// Write-side: every state change validates business rules, then appends a signed ledger entry.
import { hashObject, merkleRoot, sha256Hex } from "./crypto.ts";
import {
  OrbitError,
  balanceOf,
  batchConsumed,
  claimHash,
  custody,
  getActor,
  getBatch,
  getClaim,
  getProduct,
  materialLines,
  passportHash,
  productMass,
} from "./domain.ts";
import { CREDITS_PER_KG_RECOVERED, MATERIAL_FACTORS, haversineKm } from "./factors.ts";
import { append } from "./ledger.ts";
import type { Actor, Batch, Claim, ClaimKind, Db, Material, MaterialInput, Product, Role, TransportMode } from "./types.ts";

export const PROTOCOL_ID = "orbit-protocol";

function requireRole(a: Actor, ...roles: Role[]) {
  if (!roles.includes(a.role)) throw new OrbitError(`${a.name} is a ${a.role}; this action needs ${roles.join(" or ")}`, 403);
}

function nextId(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// ---------- materials ----------

export function createBatch(
  db: Db,
  input: { producerId: string; material: Material; massKg: number; recycledKg?: number; sourceProductIds?: string[]; at?: string },
): Batch {
  const producer = getActor(db, input.producerId);
  requireRole(producer, "supplier", "recycler", "protocol");
  if (!(input.massKg > 0)) throw new OrbitError("massKg must be positive");
  const recycledKg = input.recycledKg ?? 0;
  if (recycledKg < 0 || recycledKg > input.massKg) throw new OrbitError("recycledKg must be between 0 and massKg");
  if (recycledKg > 0 && producer.role !== "recycler" && !(input.sourceProductIds?.length)) {
    // A supplier can sell recycled feedstock, but must reference where it came from.
    throw new OrbitError("Recycled content must be backed by a recycler or a source product");
  }
  const batch: Batch = {
    id: nextId("LOT", db.batches.length + 1),
    material: input.material,
    massKg: round(input.massKg),
    recycledKg: round(recycledKg),
    producerId: producer.id,
    place: producer.place,
    createdAt: input.at ?? new Date().toISOString(),
    sourceProductIds: input.sourceProductIds ?? [],
  };
  db.batches.push(batch);
  append(db, {
    type: "BATCH_CREATED",
    subjectId: batch.id,
    actorId: producer.id,
    place: producer.place,
    timestamp: batch.createdAt,
    data: { material: batch.material, massKg: batch.massKg, recycledKg: batch.recycledKg, sourceProductIds: batch.sourceProductIds, batchHash: hashObject(batch) },
  });
  return batch;
}

// ---------- products ----------

export interface ManufactureInput {
  brandId: string;
  name: string;
  category: Product["category"];
  emoji?: string;
  description?: string;
  inputs: MaterialInput[];
  repairabilityScore?: number;
  warrantyYears?: number;
  depositCredits?: number;
  endOfLife?: string;
  co2eKg?: number; // factory energy, measured / metered
  at?: string;
}

export function manufacture(db: Db, input: ManufactureInput): Product {
  const brand = getActor(db, input.brandId);
  requireRole(brand, "manufacturer");
  if (!input.name?.trim()) throw new OrbitError("Product name required");
  if (!input.inputs?.length) throw new OrbitError("At least one material input required");
  for (const i of input.inputs) {
    const b = getBatch(db, i.batchId);
    if (!(i.massKg > 0)) throw new OrbitError("Input mass must be positive");
    const remaining = b.massKg - batchConsumed(db, b.id);
    // Mass balance: you cannot put more of a lot into products than the lot contains.
    if (i.massKg > remaining + 1e-9) throw new OrbitError(`Mass balance violated: ${b.id} has only ${round(remaining)} kg left`, 409);
  }
  const n = db.products.length + 1;
  const product: Product = {
    id: nextId("DPP", n),
    gtin: `0${String(4006381000000 + n * 7)}`,
    serial: sha256Hex(`${input.brandId}:${n}:${input.name}`).slice(0, 10).toUpperCase(),
    name: input.name.trim(),
    category: input.category,
    emoji: input.emoji ?? "📦",
    brandId: brand.id,
    description: input.description ?? "",
    inputs: input.inputs.map((i) => ({ batchId: i.batchId, massKg: round(i.massKg) })),
    repairabilityScore: input.repairabilityScore ?? 5,
    warrantyYears: input.warrantyYears ?? 2,
    depositCredits: input.depositCredits ?? 0,
    endOfLife: input.endOfLife ?? "Return through Orbit for recycling.",
    createdAt: input.at ?? new Date().toISOString(),
  };
  db.products.push(product);
  append(db, {
    type: "MANUFACTURED",
    subjectId: product.id,
    actorId: brand.id,
    place: brand.place,
    timestamp: product.createdAt,
    data: { passportHash: passportHash(product), co2eKg: input.co2eKg ?? 0, massKg: round(productMass(product)) },
  });
  return product;
}

export function ship(db: Db, input: { productId: string; actorId: string; toId: string; mode: TransportMode; at?: string }) {
  const p = getProduct(db, input.productId);
  const from = getActor(db, input.actorId);
  const to = getActor(db, input.toId);
  const c = custody(db, p.id);
  if (c.stage === "in-transit") throw new OrbitError("Product is already in transit");
  if (c.stage === "recycled" || c.stage === "returned" || c.stage === "in-use") throw new OrbitError(`Cannot ship a product that is ${c.stage}`);
  if (c.holderId !== from.id) throw new OrbitError(`${from.name} does not hold this product`, 403);
  if (to.id === from.id) throw new OrbitError("Cannot ship to yourself");
  requireRole(to, "logistics", "retailer", "manufacturer");
  const distanceKm = haversineKm(from.place, to.place);
  return append(db, { type: "SHIPPED", subjectId: p.id, actorId: from.id, place: from.place, timestamp: input.at, data: { to: to.id, mode: input.mode, distanceKm } });
}

export function receive(db: Db, input: { productId: string; actorId: string; at?: string }) {
  const p = getProduct(db, input.productId);
  const a = getActor(db, input.actorId);
  const c = custody(db, p.id);
  if (c.stage !== "in-transit" || c.pendingRecipientId !== a.id) throw new OrbitError(`${a.name} is not the expected recipient`, 403);
  return append(db, { type: "RECEIVED", subjectId: p.id, actorId: a.id, place: a.place, timestamp: input.at, data: { from: c.holderId } });
}

export function sell(db: Db, input: { productId: string; actorId: string; toId: string; at?: string }) {
  const p = getProduct(db, input.productId);
  const seller = getActor(db, input.actorId);
  const buyer = getActor(db, input.toId);
  requireRole(seller, "retailer");
  requireRole(buyer, "consumer");
  const c = custody(db, p.id);
  if (c.stage !== "in-stock" || c.holderId !== seller.id) throw new OrbitError(`${seller.name} does not have this product in stock`, 403);
  return append(db, { type: "SOLD", subjectId: p.id, actorId: seller.id, place: seller.place, timestamp: input.at, data: { to: buyer.id, deposit: p.depositCredits } });
}

export function repair(db: Db, input: { productId: string; actorId: string; note: string; co2eKg?: number; at?: string }) {
  const p = getProduct(db, input.productId);
  const r = getActor(db, input.actorId);
  requireRole(r, "repairer");
  const c = custody(db, p.id);
  if (c.stage !== "in-use") throw new OrbitError("Only products in use can be repaired");
  const e = append(db, { type: "REPAIRED", subjectId: p.id, actorId: r.id, place: r.place, timestamp: input.at, data: { note: input.note, owner: c.holderId, co2eKg: input.co2eKg ?? 0 } });
  // Repairs extend product life, so the owner gets a small incentive.
  mint(db, { to: c.holderId, amount: 15, reason: "repair-instead-of-replace", productId: p.id, ref: e.hash, at: input.at });
  return e;
}

export function returnForRecycling(db: Db, input: { productId: string; actorId: string; toId: string; at?: string }) {
  const p = getProduct(db, input.productId);
  const owner = getActor(db, input.actorId);
  const recycler = getActor(db, input.toId);
  requireRole(recycler, "recycler");
  const c = custody(db, p.id);
  if (c.stage !== "in-use" || c.holderId !== owner.id) throw new OrbitError(`${owner.name} does not own this product`, 403);
  const e = append(db, {
    type: "RETURNED",
    subjectId: p.id,
    actorId: owner.id,
    place: owner.place,
    timestamp: input.at,
    data: { to: recycler.id, distanceKm: haversineKm(owner.place, recycler.place) },
  });
  if (p.depositCredits > 0) mint(db, { to: owner.id, amount: p.depositCredits, reason: "deposit-refund", productId: p.id, ref: e.hash, at: input.at });
  return e;
}

/** Recycler breaks the product down. Recovered material becomes new traceable recycled batches. */
export function recycle(db: Db, input: { productId: string; actorId: string; at?: string }) {
  const p = getProduct(db, input.productId);
  const r = getActor(db, input.actorId);
  requireRole(r, "recycler");
  const c = custody(db, p.id);
  if (c.stage !== "returned" || c.holderId !== r.id) throw new OrbitError(`${r.name} has not received this product`, 403);

  const recovered = new Map<Material, number>();
  for (const l of materialLines(db, p)) {
    recovered.set(l.material, (recovered.get(l.material) ?? 0) + l.massKg * MATERIAL_FACTORS[l.material].recoveryRate);
  }
  const outputs: { batchId: string; material: Material; massKg: number }[] = [];
  const entry = append(db, {
    type: "RECYCLED",
    subjectId: p.id,
    actorId: r.id,
    place: r.place,
    timestamp: input.at,
    data: { inputMassKg: round(productMass(p)), recoveredKg: round([...recovered.values()].reduce((a, b) => a + b, 0)) },
  });
  for (const [material, kg] of recovered) {
    const b = createBatch(db, { producerId: r.id, material, massKg: kg, recycledKg: kg, sourceProductIds: [p.id], at: input.at });
    outputs.push({ batchId: b.id, material, massKg: b.massKg });
  }
  const totalKg = outputs.reduce((s, o) => s + o.massKg, 0);
  mint(db, { to: r.id, amount: Math.round(totalKg * CREDITS_PER_KG_RECOVERED), reason: "material-recovered", productId: p.id, ref: entry.hash, at: input.at });
  return { entry, outputs };
}

// ---------- claims ----------

export function issueClaim(
  db: Db,
  input: { productId: string; issuerId: string; kind: ClaimKind; statement: string; value: number | string; evidence?: string; at?: string },
): Claim {
  const p = getProduct(db, input.productId);
  const issuer = getActor(db, input.issuerId);
  if (issuer.id !== p.brandId) throw new OrbitError("Only the brand that made the product can issue claims about it", 403);
  if (!input.statement?.trim()) throw new OrbitError("Statement required");
  const claim: Claim = {
    id: nextId("CLM", db.claims.length + 1),
    productId: p.id,
    kind: input.kind,
    statement: input.statement.trim(),
    value: typeof input.value === "string" && input.kind !== "ORIGIN" && input.kind !== "ETHICAL_LABOR" ? Number(input.value) : input.value,
    issuerId: issuer.id,
    evidenceHash: input.evidence ? sha256Hex(input.evidence) : undefined,
    createdAt: input.at ?? new Date().toISOString(),
    attestations: [],
  };
  db.claims.push(claim);
  append(db, { type: "CLAIM_ISSUED", subjectId: claim.id, actorId: issuer.id, timestamp: claim.createdAt, data: { productId: p.id, kind: claim.kind, value: claim.value, claimHash: claimHash(claim) } });
  return claim;
}

export function attestClaim(db: Db, input: { claimId: string; auditorId: string; verdict: "APPROVE" | "REJECT"; note: string; at?: string }) {
  const claim = getClaim(db, input.claimId);
  const auditor = getActor(db, input.auditorId);
  requireRole(auditor, "auditor");
  if (claim.attestations.some((a) => a.auditorId === auditor.id)) throw new OrbitError("This auditor already attested this claim", 409);
  const e = append(db, {
    type: "CLAIM_ATTESTED",
    subjectId: claim.id,
    actorId: auditor.id,
    place: auditor.place,
    timestamp: input.at,
    data: { productId: claim.productId, verdict: input.verdict, note: input.note, claimHash: claimHash(claim) },
  });
  claim.attestations.push({ auditorId: auditor.id, verdict: input.verdict, note: input.note, at: e.timestamp, entryHash: e.hash });
  return e;
}

// ---------- credits ----------

function mint(db: Db, input: { to: string; amount: number; reason: string; productId: string; ref: string; at?: string }) {
  if (input.amount <= 0) return;
  append(db, { type: "CREDIT_MINTED", subjectId: input.to, actorId: PROTOCOL_ID, timestamp: input.at, data: { to: input.to, amount: input.amount, reason: input.reason, productId: input.productId, ref: input.ref } });
}

export const REWARDS = [
  { id: "repair-voucher", label: "Free repair at a partner repair café", cost: 40 },
  { id: "transit", label: "S$5 public transport top-up", cost: 60 },
  { id: "tree", label: "Plant a mangrove via partner NGO", cost: 20 },
  { id: "discount", label: "15% off a certified circular product", cost: 80 },
];

export function redeem(db: Db, input: { actorId: string; rewardId: string; at?: string }) {
  const a = getActor(db, input.actorId);
  const reward = REWARDS.find((r) => r.id === input.rewardId);
  if (!reward) throw new OrbitError("Unknown reward");
  const bal = balanceOf(db, a.id);
  if (bal < reward.cost) throw new OrbitError(`Not enough credits: ${bal} available, ${reward.cost} needed`, 402);
  return append(db, { type: "CREDIT_REDEEMED", subjectId: a.id, actorId: a.id, timestamp: input.at, data: { amount: reward.cost, reward: reward.id, label: reward.label } });
}

// ---------- anchoring ----------

/**
 * Commits the Merkle root of the whole ledger as a signed checkpoint entry. The same root
 * can be published on-chain via contracts/OrbitAnchor.sol for public timestamping.
 */
export function anchor(db: Db, input: { network?: string; txRef?: string; at?: string } = {}) {
  const root = merkleRoot(db.ledger.map((e) => e.hash));
  const covered = db.ledger.length;
  const e = append(db, { type: "ANCHORED", subjectId: "ledger", actorId: PROTOCOL_ID, timestamp: input.at, data: { merkleRoot: root, covers: covered } });
  const cp = { index: covered, merkleRoot: root, at: e.timestamp, network: input.network ?? "orbit-local", txRef: input.txRef ?? e.hash };
  db.checkpoints.push(cp);
  return cp;
}
