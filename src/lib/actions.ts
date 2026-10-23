// Write-side: every state change validates business rules, then appends a ledger entry that
// carries the actor's own signed instruction and is sequenced by the protocol.
import { PROTOCOL_ID } from "./auth.ts";
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
import { append, type Tx } from "./ledger.ts";
import type { Actor, Batch, Checkpoint, Claim, ClaimKind, Material, MaterialInput, Product, Role, TransportMode } from "./types.ts";

export { PROTOCOL_ID };

function requireRole(a: Actor, ...roles: Role[]) {
  if (!roles.includes(a.role)) throw new OrbitError(`${a.name} is a ${a.role}; this action needs ${roles.join(" or ")}`, 403);
}

function nextId(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const now = (tx: Tx) => tx.at ?? new Date().toISOString();

// ---------- identity ----------

/** Publishes an actor's public key on the ledger. Its auth is self-signed: proof of key possession. */
export function registerActor(tx: Tx, actor: Actor) {
  if (tx.db.ledger.some((e) => e.type === "ACTOR_REGISTERED" && e.subjectId === actor.id)) throw new OrbitError("Actor already registered", 409);
  return append(tx, {
    type: "ACTOR_REGISTERED",
    subjectId: actor.id,
    actorId: actor.id,
    place: actor.place,
    withAuth: true,
    data: { name: actor.name, role: actor.role, publicKey: actor.publicKey },
  });
}

// ---------- materials ----------

export function createBatch(tx: Tx, input: { producerId: string; material: Material; massKg: number; recycledKg?: number; sourceProductIds?: string[] }): Batch {
  const { db } = tx;
  const producer = getActor(db, input.producerId);
  requireRole(producer, "supplier", "recycler");
  if (!MATERIAL_FACTORS[input.material]) throw new OrbitError("Unknown material");
  if (!(input.massKg > 0)) throw new OrbitError("massKg must be positive");
  const recycledKg = input.recycledKg ?? 0;
  if (recycledKg < 0 || recycledKg > input.massKg) throw new OrbitError("recycledKg must be between 0 and massKg");
  if (recycledKg > 0 && producer.role !== "recycler") {
    // Only recyclers can mint recycled material, so suppliers cannot invent recycled content.
    throw new OrbitError("Only a recycler can register recycled material");
  }
  const batch: Batch = {
    id: nextId("LOT", db.batches.length + 1),
    material: input.material,
    massKg: round(input.massKg),
    recycledKg: round(recycledKg),
    producerId: producer.id,
    place: producer.place,
    createdAt: now(tx),
    sourceProductIds: input.sourceProductIds ?? [],
  };
  db.batches.push(batch);
  append(tx, {
    type: "BATCH_CREATED",
    subjectId: batch.id,
    actorId: producer.id,
    place: producer.place,
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
  co2eKg?: number; // factory energy, self-reported by the brand unless attested
}

export function manufacture(tx: Tx, input: ManufactureInput): Product {
  const { db } = tx;
  const brand = getActor(db, input.brandId);
  requireRole(brand, "manufacturer");
  if (!input.name?.trim()) throw new OrbitError("Product name required");
  if (!input.inputs?.length) throw new OrbitError("At least one material input required");
  const drawn = new Map<string, number>();
  for (const i of input.inputs) {
    const b = getBatch(db, i.batchId);
    if (!(i.massKg > 0)) throw new OrbitError("Input mass must be positive");
    drawn.set(b.id, (drawn.get(b.id) ?? 0) + i.massKg);
    const remaining = b.massKg - batchConsumed(db, b.id);
    // Mass balance: you cannot put more of a lot into products than the lot contains.
    if (drawn.get(b.id)! > remaining + 1e-9) throw new OrbitError(`Mass balance violated: ${b.id} has only ${round(remaining)} kg left`, 409);
  }
  const n = db.products.length + 1;
  const product: Product = {
    id: nextId("DPP", n),
    gtin: `0${String(4006381000000 + n * 7)}`,
    serial: sha256Hex(`${input.brandId}:${n}:${input.name}`).slice(0, 10).toUpperCase(),
    name: input.name.trim().slice(0, 80),
    category: input.category,
    emoji: (input.emoji ?? "📦").slice(0, 4),
    brandId: brand.id,
    description: (input.description ?? "").slice(0, 280),
    inputs: input.inputs.map((i) => ({ batchId: i.batchId, massKg: round(i.massKg) })),
    repairabilityScore: Math.max(0, Math.min(10, input.repairabilityScore ?? 5)),
    warrantyYears: input.warrantyYears ?? 2,
    depositCredits: Math.max(0, Math.min(500, input.depositCredits ?? 0)),
    endOfLife: input.endOfLife ?? "Return through Orbit for recycling.",
    createdAt: now(tx),
  };
  db.products.push(product);
  append(tx, {
    type: "MANUFACTURED",
    subjectId: product.id,
    actorId: brand.id,
    place: brand.place,
    data: { passportHash: passportHash(product), co2eKg: Math.max(0, input.co2eKg ?? 0), massKg: round(productMass(product)) },
  });
  return product;
}

export function ship(tx: Tx, input: { productId: string; actorId: string; toId: string; mode: TransportMode }) {
  const { db } = tx;
  const p = getProduct(db, input.productId);
  const from = getActor(db, input.actorId);
  const to = getActor(db, input.toId);
  if (!["ship", "rail", "truck", "air"].includes(input.mode)) throw new OrbitError("Unknown transport mode");
  const c = custody(db, p.id);
  if (c.stage === "in-transit") throw new OrbitError("Product is already in transit");
  if (c.stage === "recycled" || c.stage === "returned" || c.stage === "in-use") throw new OrbitError(`Cannot ship a product that is ${c.stage}`);
  if (c.holderId !== from.id) throw new OrbitError(`${from.name} does not hold this product`, 403);
  if (to.id === from.id) throw new OrbitError("Cannot ship to yourself");
  requireRole(to, "logistics", "retailer", "manufacturer");
  // Distance comes from both parties' registered locations, not from the shipper's say-so.
  const distanceKm = haversineKm(from.place, to.place);
  return append(tx, { type: "SHIPPED", subjectId: p.id, actorId: from.id, place: from.place, data: { to: to.id, mode: input.mode, distanceKm } });
}

export function receive(tx: Tx, input: { productId: string; actorId: string }) {
  const { db } = tx;
  const p = getProduct(db, input.productId);
  const a = getActor(db, input.actorId);
  const c = custody(db, p.id);
  if (c.stage !== "in-transit" || c.pendingRecipientId !== a.id) throw new OrbitError(`${a.name} is not the expected recipient`, 403);
  return append(tx, { type: "RECEIVED", subjectId: p.id, actorId: a.id, place: a.place, data: { from: c.holderId } });
}

export function sell(tx: Tx, input: { productId: string; actorId: string; toId: string }) {
  const { db } = tx;
  const p = getProduct(db, input.productId);
  const seller = getActor(db, input.actorId);
  const buyer = getActor(db, input.toId);
  requireRole(seller, "retailer");
  requireRole(buyer, "consumer");
  const c = custody(db, p.id);
  if (c.stage !== "in-stock" || c.holderId !== seller.id) throw new OrbitError(`${seller.name} does not have this product in stock`, 403);
  return append(tx, { type: "SOLD", subjectId: p.id, actorId: seller.id, place: seller.place, data: { to: buyer.id, deposit: p.depositCredits } });
}

export function repair(tx: Tx, input: { productId: string; actorId: string; note: string; co2eKg?: number }) {
  const { db } = tx;
  const p = getProduct(db, input.productId);
  const r = getActor(db, input.actorId);
  requireRole(r, "repairer");
  const c = custody(db, p.id);
  if (c.stage !== "in-use") throw new OrbitError("Only products in use can be repaired");
  const e = append(tx, { type: "REPAIRED", subjectId: p.id, actorId: r.id, place: r.place, data: { note: input.note.slice(0, 200), owner: c.holderId, co2eKg: input.co2eKg ?? 0 } });
  // Repairs extend product life, so the owner gets a small incentive.
  mint(tx, { to: c.holderId, amount: 15, reason: "repair-instead-of-replace", productId: p.id, ref: e.hash });
  return e;
}

export function returnForRecycling(tx: Tx, input: { productId: string; actorId: string; toId: string }) {
  const { db } = tx;
  const p = getProduct(db, input.productId);
  const owner = getActor(db, input.actorId);
  const recycler = getActor(db, input.toId);
  requireRole(recycler, "recycler");
  const c = custody(db, p.id);
  if (c.stage !== "in-use" || c.holderId !== owner.id) throw new OrbitError(`${owner.name} does not own this product`, 403);
  const e = append(tx, { type: "RETURNED", subjectId: p.id, actorId: owner.id, place: owner.place, data: { to: recycler.id, distanceKm: haversineKm(owner.place, recycler.place) } });
  if (p.depositCredits > 0) mint(tx, { to: owner.id, amount: p.depositCredits, reason: "deposit-refund", productId: p.id, ref: e.hash });
  return e;
}

/** Recycler breaks the product down. Recovered material becomes new traceable recycled batches. */
export function recycle(tx: Tx, input: { productId: string; actorId: string }) {
  const { db } = tx;
  const p = getProduct(db, input.productId);
  const r = getActor(db, input.actorId);
  requireRole(r, "recycler");
  const c = custody(db, p.id);
  if (c.stage !== "returned" || c.holderId !== r.id) throw new OrbitError(`${r.name} has not received this product`, 403);

  const recovered = new Map<Material, number>();
  for (const l of materialLines(db, p)) {
    recovered.set(l.material, (recovered.get(l.material) ?? 0) + l.massKg * MATERIAL_FACTORS[l.material].recoveryRate);
  }
  const entry = append(tx, {
    type: "RECYCLED",
    subjectId: p.id,
    actorId: r.id,
    place: r.place,
    data: { inputMassKg: round(productMass(p)), recoveredKg: round([...recovered.values()].reduce((a, b) => a + b, 0)) },
  });
  const outputs: { batchId: string; material: Material; massKg: number }[] = [];
  for (const [material, kg] of recovered) {
    const b = createBatch(tx, { producerId: r.id, material, massKg: kg, recycledKg: kg, sourceProductIds: [p.id] });
    outputs.push({ batchId: b.id, material, massKg: b.massKg });
  }
  const totalKg = outputs.reduce((s, o) => s + o.massKg, 0);
  mint(tx, { to: r.id, amount: Math.round(totalKg * CREDITS_PER_KG_RECOVERED), reason: "material-recovered", productId: p.id, ref: entry.hash });
  return { entry, outputs };
}

// ---------- claims ----------

export function issueClaim(tx: Tx, input: { productId: string; issuerId: string; kind: ClaimKind; statement: string; value: number | string; evidence?: string }): Claim {
  const { db } = tx;
  const p = getProduct(db, input.productId);
  const issuer = getActor(db, input.issuerId);
  if (issuer.id !== p.brandId) throw new OrbitError("Only the brand that made the product can issue claims about it", 403);
  if (!["RECYCLED_CONTENT", "CARBON_FOOTPRINT", "ORIGIN", "ETHICAL_LABOR", "REPAIRABILITY"].includes(input.kind)) throw new OrbitError("Unknown claim kind");
  if (!input.statement?.trim()) throw new OrbitError("Statement required");
  const textual = input.kind === "ORIGIN" || input.kind === "ETHICAL_LABOR";
  const value = textual ? String(input.value) : Number(input.value);
  if (!textual && !Number.isFinite(value)) throw new OrbitError("Claim value must be a number");
  const claim: Claim = {
    id: nextId("CLM", db.claims.length + 1),
    productId: p.id,
    kind: input.kind,
    statement: input.statement.trim().slice(0, 200),
    value,
    issuerId: issuer.id,
    evidenceHash: input.evidence ? sha256Hex(input.evidence) : undefined,
    createdAt: now(tx),
    attestations: [],
  };
  db.claims.push(claim);
  append(tx, { type: "CLAIM_ISSUED", subjectId: claim.id, actorId: issuer.id, data: { productId: p.id, kind: claim.kind, value: claim.value, claimHash: claimHash(claim) } });
  return claim;
}

export function attestClaim(tx: Tx, input: { claimId: string; auditorId: string; verdict: "APPROVE" | "REJECT"; note: string }) {
  const { db } = tx;
  const claim = getClaim(db, input.claimId);
  const auditor = getActor(db, input.auditorId);
  requireRole(auditor, "auditor");
  if (claim.attestations.some((a) => a.auditorId === auditor.id)) throw new OrbitError("This auditor already attested this claim", 409);
  const e = append(tx, {
    type: "CLAIM_ATTESTED",
    subjectId: claim.id,
    actorId: auditor.id,
    place: auditor.place,
    data: { productId: claim.productId, verdict: input.verdict, note: input.note.slice(0, 200), claimHash: claimHash(claim) },
  });
  claim.attestations.push({ auditorId: auditor.id, verdict: input.verdict, note: input.note, at: e.timestamp, entryHash: e.hash });
  return e;
}

// ---------- credits ----------

function mint(tx: Tx, input: { to: string; amount: number; reason: string; productId: string; ref: string }) {
  if (input.amount <= 0) return;
  append(tx, { type: "CREDIT_MINTED", subjectId: input.to, actorId: PROTOCOL_ID, data: { to: input.to, amount: input.amount, reason: input.reason, productId: input.productId, ref: input.ref } });
}

export const REWARDS = [
  { id: "repair-voucher", label: "Free repair at a partner repair café", cost: 40 },
  { id: "transit", label: "S$5 public transport top-up", cost: 60 },
  { id: "tree", label: "Plant a mangrove via partner NGO", cost: 20 },
  { id: "discount", label: "15% off a certified circular product", cost: 80 },
];

export function redeem(tx: Tx, input: { actorId: string; rewardId: string }) {
  const { db } = tx;
  const a = getActor(db, input.actorId);
  const reward = REWARDS.find((r) => r.id === input.rewardId);
  if (!reward) throw new OrbitError("Unknown reward");
  const bal = balanceOf(db, a.id);
  if (bal < reward.cost) throw new OrbitError(`Not enough credits: ${bal} available, ${reward.cost} needed`, 402);
  return append(tx, { type: "CREDIT_REDEEMED", subjectId: a.id, actorId: a.id, data: { amount: reward.cost, reward: reward.id, label: reward.label } });
}

// ---------- anchoring ----------

/** The root a checkpoint commits to: all entries currently on the ledger. */
export function currentRoot(tx: Tx) {
  return { covers: tx.db.ledger.length, merkleRoot: merkleRoot(tx.db.ledger.map((e) => e.hash)) };
}

/** Records a checkpoint (already published on-chain, or local-only) as a ledger entry. */
export function recordCheckpoint(tx: Tx, cp: Omit<Checkpoint, "at">): Checkpoint {
  const e = append(tx, {
    type: "ANCHORED",
    subjectId: "ledger",
    actorId: PROTOCOL_ID,
    data: { merkleRoot: cp.merkleRoot, covers: cp.covers, network: cp.network, chainId: cp.chainId, contract: cp.contract, checkpointId: cp.checkpointId, txHash: cp.txHash },
  });
  const full: Checkpoint = { ...cp, at: e.timestamp };
  tx.db.checkpoints.push(full);
  return full;
}
