// Read-side queries. All state is derived from the ledger (see replay.ts); nothing here is trusted
// storage. Lookups go through incremental indexes so each costs O(entries for that subject).
import { hashObject } from "./crypto.ts";
import { MATERIAL_FACTORS, MAX_KM_PER_DAY, TEXTILE_PROCESSING, TEXTILES, TRANSPORT_FACTORS, routeKm, transportFactor } from "./factors.ts";
import type { Actor, Attestation, Batch, Claim, Db, LedgerEntry, LifecycleStage, Material, Place, Product, TransportMode } from "./types.ts";

export class OrbitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------- entity lookups (id -> record), cached per array and extended as it grows ----------

const byIdCache = new WeakMap<object, { n: number; map: Map<string, unknown> }>();
function lookup<T extends { id: string }>(arr: T[], id: string): T | undefined {
  let c = byIdCache.get(arr);
  if (!c || c.n > arr.length) {
    c = { n: 0, map: new Map() };
    byIdCache.set(arr, c);
  }
  for (let i = c.n; i < arr.length; i++) c.map.set(arr[i].id, arr[i]);
  c.n = arr.length;
  return c.map.get(id) as T | undefined;
}

export function getActor(db: Db, id: string): Actor {
  const a = lookup(db.actors, id);
  if (!a) throw new OrbitError(`Unknown actor ${id}`, 404);
  return a;
}
export function findActor(db: Db, id: string): Actor | undefined {
  return lookup(db.actors, id);
}
export function getProduct(db: Db, id: string): Product {
  const p = lookup(db.products, id);
  if (!p) throw new OrbitError(`Unknown product ${id}`, 404);
  return p;
}
export function getBatch(db: Db, id: string): Batch {
  const b = lookup(db.batches, id);
  if (!b) throw new OrbitError(`Unknown batch ${id}`, 404);
  return b;
}
export function getClaim(db: Db, id: string): Claim {
  const c = lookup(db.claims, id);
  if (!c) throw new OrbitError(`Unknown claim ${id}`, 404);
  return c;
}

// ---------- ledger indexes ----------

const LIFECYCLE = new Set(["MANUFACTURED", "SHIPPED", "RECEIVED", "SOLD", "REPAIRED", "RETURNED", "RECYCLED"]);

interface LedgerIndex {
  n: number;
  key: string;
  lifecycle: Map<string, LedgerEntry[]>;
  byProduct: Map<string, LedgerEntry[]>;
  attestations: Map<string, LedgerEntry[]>;
  balances: Map<string, number>;
}
const ledgerIdx = new WeakMap<LedgerEntry[], LedgerIndex>();

function push<K>(m: Map<K, LedgerEntry[]>, k: K, e: LedgerEntry) {
  const a = m.get(k);
  if (a) a.push(e);
  else m.set(k, [e]);
}

function idx(db: Db): LedgerIndex {
  // A demo tamper edits entries in place, so it invalidates the index.
  const key = db.tamper ? `${db.tamper.mode}${db.tamper.index}${db.tamper.at}` : "";
  let x = ledgerIdx.get(db.ledger);
  if (!x || x.n > db.ledger.length || x.key !== key) {
    x = { n: 0, key, lifecycle: new Map(), byProduct: new Map(), attestations: new Map(), balances: new Map() };
    ledgerIdx.set(db.ledger, x);
  }
  for (let i = x.n; i < db.ledger.length; i++) {
    const e = db.ledger[i];
    if (LIFECYCLE.has(e.type)) push(x.lifecycle, e.subjectId, e);
    const pid = typeof e.data.productId === "string" ? e.data.productId : LIFECYCLE.has(e.type) ? e.subjectId : undefined;
    if (pid) push(x.byProduct, pid, e);
    if (e.type === "CLAIM_ATTESTED") push(x.attestations, e.subjectId, e);
    if (e.type === "CREDIT_MINTED") x.balances.set(String(e.data.to), (x.balances.get(String(e.data.to)) ?? 0) + Number(e.data.amount));
    if (e.type === "CREDIT_REDEEMED") x.balances.set(e.actorId, (x.balances.get(e.actorId) ?? 0) - Number(e.data.amount));
  }
  x.n = db.ledger.length;
  return x;
}

export function lifecycleEntries(db: Db, productId: string): LedgerEntry[] {
  return idx(db).lifecycle.get(productId) ?? [];
}

/** Every ledger entry that touches a product: lifecycle, its claims and audits, credits it triggered. */
export function productEntries(db: Db, productId: string): LedgerEntry[] {
  return idx(db).byProduct.get(productId) ?? [];
}

/** Audits of a claim, read from the ledger (never from a mutable record). */
export interface Accreditation {
  certificate: string;
  scheme: string;
  scope: "recycler" | "auditor";
  validFrom: string;
  validUntil: string;
  issuerId: string;
  suspendedFrom?: string;
  suspendedReason?: string;
}

/** Certificates issued to an actor, with any suspension applied (rebuilt only when the ledger grows). */
const accCache = new WeakMap<Db, { n: number; by: Map<string, Accreditation[]> }>();
export function accreditationsOf(db: Db, actorId: string): Accreditation[] {
  let c = accCache.get(db);
  if (!c || c.n !== db.ledger.length) {
    const by = new Map<string, Accreditation[]>();
    const byCert = new Map<string, Accreditation>();
    for (const e of db.ledger) {
      if (e.type === "ACCREDITED") {
        const a: Accreditation = { certificate: String(e.data.certificate), scheme: String(e.data.scheme), scope: e.data.scope === "auditor" ? "auditor" : "recycler", validFrom: String(e.data.validFrom), validUntil: String(e.data.validUntil), issuerId: e.actorId };
        by.set(e.subjectId, [...(by.get(e.subjectId) ?? []), a]);
        byCert.set(a.certificate, a);
      } else if (e.type === "ACCREDITATION_SUSPENDED") {
        const a = byCert.get(String(e.data.certificate));
        if (a && a.issuerId === e.actorId) {
          a.suspendedFrom = String(e.data.from);
          a.suspendedReason = String(e.data.reason);
        }
      }
    }
    c = { n: db.ledger.length, by };
    accCache.set(db, c);
  }
  return c.by.get(actorId) ?? [];
}

/** "Global Recycled Standard GRS-NL-25-0418 (demo certificate)": demo bodies are marked fictional in their registration. */
export function certificateLabel(db: Db, a: Accreditation): string {
  const issuer = db.actors.find((x) => x.id === a.issuerId);
  const demo = !!issuer && /fictional/i.test(issuer.description);
  return `${a.scheme} ${a.certificate}${demo ? " (demo certificate)" : ""}`;
}

/** The certificate that covered `actorId` for `scope` at time `at`, or why none did. */
export function accreditedAt(db: Db, actorId: string, scope: "recycler" | "auditor", at: string): { ok: true; cert: Accreditation } | { ok: false; reason: string } {
  const t = Date.parse(at);
  const certs = accreditationsOf(db, actorId).filter((a) => a.scope === scope);
  const name = db.actors.find((a) => a.id === actorId)?.name ?? actorId;
  if (!certs.length) return { ok: false, reason: `${name} holds no ${scope === "recycler" ? "recycling" : "auditing"} accreditation on the ledger` };
  for (const a of certs) {
    if (t < Date.parse(a.validFrom) || t > Date.parse(a.validUntil)) continue;
    if (a.suspendedFrom && t >= Date.parse(a.suspendedFrom)) continue;
    return { ok: true, cert: a };
  }
  const susp = certs.find((a) => a.suspendedFrom && t >= Date.parse(a.suspendedFrom));
  if (susp) return { ok: false, reason: `${name}'s ${susp.scheme} certificate ${susp.certificate} was suspended from ${susp.suspendedFrom!.slice(0, 10)} (${susp.suspendedReason})` };
  const c0 = certs[0];
  return { ok: false, reason: `${name}'s ${c0.scheme} certificate ${c0.certificate} was not valid on ${at.slice(0, 10)} (valid ${c0.validFrom.slice(0, 10)} to ${c0.validUntil.slice(0, 10)})` };
}

export function attestationsOf(db: Db, claimId: string): Attestation[] {
  return (idx(db).attestations.get(claimId) ?? []).map((e) => ({
    auditorId: e.actorId,
    verdict: e.data.verdict === "REJECT" ? "REJECT" : "APPROVE",
    note: String(e.data.note ?? ""),
    at: e.timestamp,
    entryHash: e.hash,
  }));
}

export function balances(db: Db): Map<string, number> {
  return idx(db).balances;
}

export function balanceOf(db: Db, actorId: string): number {
  return balances(db).get(actorId) ?? 0;
}

/** When the acting party signed the instruction behind an entry (falls back to the sequencer time). */
export function signedAt(e: LedgerEntry): number {
  return Date.parse(e.auth?.request.issuedAt ?? e.timestamp);
}

/** Fields of a product that are committed to the ledger at manufacture time. */
export function passportCore(p: Product) {
  return {
    id: p.id,
    gtin: p.gtin,
    serial: p.serial,
    name: p.name,
    category: p.category,
    brandId: p.brandId,
    inputs: p.inputs,
    repairabilityScore: p.repairabilityScore,
    warrantyYears: p.warrantyYears,
    depositCredits: p.depositCredits,
  };
}
export function passportHash(p: Product): string {
  return hashObject(passportCore(p));
}
export function claimCore(c: Claim) {
  return { id: c.id, productId: c.productId, kind: c.kind, statement: c.statement, value: c.value, issuerId: c.issuerId, evidenceHash: c.evidenceHash };
}
export function claimHash(c: Claim): string {
  return hashObject(claimCore(c));
}

export interface Custody {
  holderId: string;
  stage: LifecycleStage;
  pendingRecipientId?: string;
}

export function custody(db: Db, productId: string): Custody {
  let c: Custody = { holderId: getProduct(db, productId).brandId, stage: "manufactured" };
  for (const e of lifecycleEntries(db, productId)) {
    switch (e.type) {
      case "MANUFACTURED":
        c = { holderId: e.actorId, stage: "manufactured" };
        break;
      case "SHIPPED":
        c = { holderId: e.actorId, stage: "in-transit", pendingRecipientId: String(e.data.to) };
        break;
      case "RECEIVED":
        c = { holderId: e.actorId, stage: "in-stock" };
        break;
      case "SOLD":
        c = { holderId: String(e.data.to), stage: "in-use" };
        break;
      case "REPAIRED":
        c = { ...c, stage: "in-use" };
        break;
      case "RETURNED":
        c = { holderId: String(e.data.to), stage: "returned" };
        break;
      case "RECYCLED":
        c = { holderId: e.actorId, stage: "recycled" };
        break;
    }
  }
  return c;
}

export interface MaterialLine {
  batch: Batch;
  material: Material;
  label: string;
  massKg: number;
  recycledKg: number;
  origin: Place;
  closedLoop: boolean; // recovered from an earlier Orbit product
  /** Recycled kg that counts: only from a recycler accredited when the lot was created. */
  provenRecycledKg: number;
  /** Why recycled kg in this line doesn't count, if it doesn't. */
  unaccredited?: string;
  certificate?: string;
}

export function materialLines(db: Db, p: Product): MaterialLine[] {
  return p.inputs.map((i) => {
    const b = getBatch(db, i.batchId);
    const recycledKg = b.massKg > 0 ? (i.massKg * b.recycledKg) / b.massKg : 0;
    // Recycled content counts only if the recycler held a valid accreditation when it made the lot.
    const acc = recycledKg > 0 ? accreditedAt(db, b.producerId, "recycler", b.createdAt) : undefined;
    return {
      batch: b,
      material: b.material,
      label: MATERIAL_FACTORS[b.material].label,
      massKg: i.massKg,
      recycledKg,
      origin: b.place,
      closedLoop: b.sourceProductIds.length > 0,
      provenRecycledKg: acc?.ok ? recycledKg : 0,
      unaccredited: acc && !acc.ok ? acc.reason : undefined,
      certificate: acc?.ok ? certificateLabel(db, acc.cert) : undefined,
    };
  });
}

export function productMass(p: Product): number {
  return p.inputs.reduce((s, i) => s + i.massKg, 0);
}

/** Recycled content proven by batch lineage (mass balance), in percent. */
export function provenRecycledPct(db: Db, p: Product): number {
  const lines = materialLines(db, p);
  const mass = lines.reduce((s, l) => s + l.massKg, 0);
  if (mass === 0) return 0;
  return (lines.reduce((s, l) => s + l.provenRecycledKg, 0) / mass) * 100;
}

/** How much of each batch has been committed to products already (indexed, extended as products are added). */
const consumedCache = new WeakMap<Product[], { n: number; kg: Map<string, number> }>();
export function batchConsumed(db: Db, batchId: string): number {
  let c = consumedCache.get(db.products);
  if (!c || c.n > db.products.length) {
    c = { n: 0, kg: new Map() };
    consumedCache.set(db.products, c);
  }
  for (let i = c.n; i < db.products.length; i++) for (const inp of db.products[i].inputs) c.kg.set(inp.batchId, (c.kg.get(inp.batchId) ?? 0) + inp.massKg);
  c.n = db.products.length;
  return c.kg.get(batchId) ?? 0;
}

export interface Leg {
  shippedIndex: number;
  from: string;
  to: string;
  declaredMode: TransportMode; // what the shipper said
  mode: TransportMode; // what we account for: declared, or the cheapest mode physically consistent with the receipt
  /** Great-circle distance between the two parties' registered sites (recorded on the ledger). */
  distanceKm: number;
  /** Distance actually travelled for the mode counted (GLEC rules: air +95 km, road ×1.2, sea lanes). */
  routeKm: number;
  co2eKg: number;
  transitHours?: number;
  /** consistent: receipt time fits the declared mode; contradicted: too fast for it; pending: not yet received */
  check: "consistent" | "contradicted" | "pending";
  note?: string;
}

export interface CarbonBreakdown {
  /** Cradle-to-gate materials, from the signed lots. */
  materials: number;
  /** Garment processing (spinning, knitting, dyeing, finishing), modelled from published defaults. */
  processing: number;
  /** Factory and repair energy as declared by the brand / repairer (self-reported). */
  manufacturing: number;
  transport: number;
  total: number;
  legs: Leg[];
}

/** Lowest-emission mode first, so an inferred mode always gives the shipper the benefit of the doubt. */
const MODES_BY_EMISSIONS: TransportMode[] = (Object.keys(TRANSPORT_FACTORS) as TransportMode[]).sort((a, b) => TRANSPORT_FACTORS[a] - TRANSPORT_FACTORS[b]);

/**
 * Transport legs, cross-checked against the recipient. The shipper declares the mode, but the
 * RECEIVED entry is signed by the recipient, so the shipper doesn't control the arrival time.
 * If the implied speed is impossible for the declared mode, the leg is contradicted and
 * accounted for with the lowest-emission mode that could actually have made the trip.
 */
export function shipmentLegs(db: Db, p: Product): Leg[] {
  const mass = productMass(p);
  const life = lifecycleEntries(db, p.id);
  const legs: Leg[] = [];
  life.forEach((e, i) => {
    if (e.type !== "SHIPPED") return;
    const declaredMode = (e.data.mode as TransportMode) ?? "truck";
    const to = String(e.data.to);
    const distanceKm = Number(e.data.distanceKm ?? 0);
    const received = life.slice(i + 1).find((r) => r.type === "RECEIVED" && r.actorId === to);
    let mode = declaredMode;
    let check: Leg["check"] = "pending";
    let transitHours: number | undefined;
    let note: string | undefined;
    if (received) {
      // Both ends are signed times: the shipper's instruction and the recipient's receipt.
      transitHours = Math.max(0.5, (signedAt(received) - signedAt(e)) / 3.6e6);
      const kmPerDay = distanceKm / (transitHours / 24);
      if (kmPerDay <= MAX_KM_PER_DAY[declaredMode]) check = "consistent";
      else {
        check = "contradicted";
        mode = MODES_BY_EMISSIONS.find((m) => MAX_KM_PER_DAY[m] >= kmPerDay) ?? "air";
        note = `Declared ${declaredMode}, but the recipient's signed receipt shows ${Math.round(distanceKm).toLocaleString("en")} km in ${transitHours < 48 ? `${Math.round(transitHours)} h` : `${Math.round(transitHours / 24)} days`} (≈${Math.round(kmPerDay).toLocaleString("en")} km/day). A ${declaredMode} can't do more than ${MAX_KM_PER_DAY[declaredMode].toLocaleString("en")} km/day, so this leg is counted as ${mode}.`;
      }
    }
    const route = routeKm(mode, getActor(db, e.actorId).place, getActor(db, to).place);
    legs.push({ shippedIndex: e.index, from: e.actorId, to, declaredMode, mode, distanceKm, routeKm: route, co2eKg: route * (mass / 1000) * transportFactor(mode, distanceKm), transitHours, check, note });
  });
  return legs;
}

export function carbonFootprint(db: Db, p: Product): CarbonBreakdown {
  // Garments lose ~15% of fabric in cutting, so their fibre is scaled up like the processing stages.
  const waste = (m: Material) => (p.category === "apparel" && TEXTILES.includes(m) ? TEXTILE_PROCESSING.cuttingWaste : 1);
  const materials = materialLines(db, p).reduce((s, l) => {
    const f = MATERIAL_FACTORS[l.material];
    return s + ((l.massKg - l.provenRecycledKg) * f.virgin + l.provenRecycledKg * f.recycled) * waste(l.material);
  }, 0);
  // Apparel: spinning, knitting and wet processing from published defaults, scaled for cutting waste.
  let processing = 0;
  if (p.category === "apparel") {
    const T = TEXTILE_PROCESSING;
    const lines = materialLines(db, p).filter((l) => TEXTILES.includes(l.material));
    const textileKg = lines.reduce((s, l) => s + l.massKg, 0);
    const spinning = lines.reduce((s, l) => s + l.massKg * (T.spinning[l.material] ?? 0), 0);
    processing = (spinning + textileKg * (T.knitting + T.wetProcessing)) * T.cuttingWaste;
  }
  let manufacturing = 0;
  for (const e of lifecycleEntries(db, p.id)) {
    if (e.type === "MANUFACTURED" || e.type === "REPAIRED") manufacturing += Number(e.data.co2eKg ?? 0);
  }
  const legs = shipmentLegs(db, p);
  const transport = legs.reduce((s, l) => s + l.co2eKg, 0);
  return { materials, processing, manufacturing, transport, total: materials + processing + manufacturing + transport, legs };
}

/** CO2e avoided by using recycled instead of virgin material. */
export function avoidedCo2e(db: Db, p: Product): number {
  return materialLines(db, p).reduce((s, l) => {
    const f = MATERIAL_FACTORS[l.material];
    return s + l.provenRecycledKg * (f.virgin - f.recycled);
  }, 0);
}

/** Ordered list of places the product (and its materials) passed through. */
export function journey(db: Db, p: Product): { place: Place; label: string; type: string; at: string; actorId: string }[] {
  const pts: { place: Place; label: string; type: string; at: string; actorId: string }[] = [];
  for (const l of materialLines(db, p)) {
    pts.push({ place: l.origin, label: `${l.label} sourced`, type: "SOURCE", at: l.batch.createdAt, actorId: l.batch.producerId });
  }
  for (const e of lifecycleEntries(db, p.id)) {
    if (!e.place) continue;
    pts.push({ place: e.place, label: e.type.toLowerCase(), type: e.type, at: e.timestamp, actorId: e.actorId });
  }
  return pts;
}
