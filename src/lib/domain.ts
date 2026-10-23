// Read-side queries: everything here is derived from the ledger + records, never stored.
import { hashObject } from "./crypto.ts";
import { MATERIAL_FACTORS, TRANSPORT_FACTORS } from "./factors.ts";
import type { Actor, Batch, Claim, Db, LedgerEntry, LifecycleStage, Material, Place, Product, TransportMode } from "./types.ts";

export class OrbitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function getActor(db: Db, id: string): Actor {
  const a = db.actors.find((x) => x.id === id);
  if (!a) throw new OrbitError(`Unknown actor ${id}`, 404);
  return a;
}
export function getProduct(db: Db, id: string): Product {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new OrbitError(`Unknown product ${id}`, 404);
  return p;
}
export function getBatch(db: Db, id: string): Batch {
  const b = db.batches.find((x) => x.id === id);
  if (!b) throw new OrbitError(`Unknown batch ${id}`, 404);
  return b;
}
export function getClaim(db: Db, id: string): Claim {
  const c = db.claims.find((x) => x.id === id);
  if (!c) throw new OrbitError(`Unknown claim ${id}`, 404);
  return c;
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

const LIFECYCLE = new Set(["MANUFACTURED", "SHIPPED", "RECEIVED", "SOLD", "REPAIRED", "RETURNED", "RECYCLED"]);

export function lifecycleEntries(db: Db, productId: string): LedgerEntry[] {
  return db.ledger.filter((e) => e.subjectId === productId && LIFECYCLE.has(e.type));
}

/** Every ledger entry that touches a product: lifecycle, its claims, credits it triggered. */
export function productEntries(db: Db, productId: string): LedgerEntry[] {
  const claimIds = new Set(db.claims.filter((c) => c.productId === productId).map((c) => c.id));
  return db.ledger.filter((e) => e.subjectId === productId || claimIds.has(e.subjectId) || e.data.productId === productId);
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
}

export function materialLines(db: Db, p: Product): MaterialLine[] {
  return p.inputs.map((i) => {
    const b = getBatch(db, i.batchId);
    return {
      batch: b,
      material: b.material,
      label: MATERIAL_FACTORS[b.material].label,
      massKg: i.massKg,
      recycledKg: b.massKg > 0 ? (i.massKg * b.recycledKg) / b.massKg : 0,
      origin: b.place,
      closedLoop: b.sourceProductIds.length > 0,
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
  return (lines.reduce((s, l) => s + l.recycledKg, 0) / mass) * 100;
}

/** How much of each batch has been committed to products already. */
export function batchConsumed(db: Db, batchId: string): number {
  let used = 0;
  for (const p of db.products) for (const i of p.inputs) if (i.batchId === batchId) used += i.massKg;
  return used;
}

export interface CarbonBreakdown {
  materials: number;
  manufacturing: number;
  transport: number;
  total: number;
  legs: { from: string; to: string; mode: TransportMode; distanceKm: number; co2eKg: number }[];
}

export function carbonFootprint(db: Db, p: Product): CarbonBreakdown {
  const mass = productMass(p);
  const materials = materialLines(db, p).reduce((s, l) => {
    const f = MATERIAL_FACTORS[l.material];
    return s + (l.massKg - l.recycledKg) * f.virgin + l.recycledKg * f.recycled;
  }, 0);
  let manufacturing = 0;
  const legs: CarbonBreakdown["legs"] = [];
  for (const e of lifecycleEntries(db, p.id)) {
    if (e.type === "MANUFACTURED") manufacturing += Number(e.data.co2eKg ?? 0);
    if (e.type === "REPAIRED") manufacturing += Number(e.data.co2eKg ?? 0);
    if (e.type === "SHIPPED") {
      const mode = (e.data.mode as TransportMode) ?? "truck";
      const distanceKm = Number(e.data.distanceKm ?? 0);
      const co2eKg = distanceKm * (mass / 1000) * TRANSPORT_FACTORS[mode];
      legs.push({ from: e.actorId, to: String(e.data.to), mode, distanceKm, co2eKg });
    }
  }
  const transport = legs.reduce((s, l) => s + l.co2eKg, 0);
  return { materials, manufacturing, transport, total: materials + manufacturing + transport, legs };
}

/** CO2e avoided by using recycled instead of virgin material. */
export function avoidedCo2e(db: Db, p: Product): number {
  return materialLines(db, p).reduce((s, l) => {
    const f = MATERIAL_FACTORS[l.material];
    return s + l.recycledKg * (f.virgin - f.recycled);
  }, 0);
}

export function balances(db: Db): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of db.ledger) {
    if (e.type === "CREDIT_MINTED") m.set(String(e.data.to), (m.get(String(e.data.to)) ?? 0) + Number(e.data.amount));
    if (e.type === "CREDIT_REDEEMED") m.set(e.actorId, (m.get(e.actorId) ?? 0) - Number(e.data.amount));
  }
  return m;
}

export function balanceOf(db: Db, actorId: string): number {
  return balances(db).get(actorId) ?? 0;
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
