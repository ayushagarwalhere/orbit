// Turns a signed request into a validated action. Used by the API and by tests.
import * as A from "./actions.ts";
import { ACTOR_FIELD, verifyRequest } from "./auth.ts";
import { OrbitError } from "./domain.ts";
import { registeredKeys, type Tx } from "./ledger.ts";
import type { Db, SignedRequest } from "./types.ts";

const MAX_SKEW_MS = 5 * 60 * 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */
const ACTIONS: Record<string, (tx: Tx, b: any) => unknown> = {
  "create-batch": (tx, b) => A.createBatch(tx, { producerId: b.producerId, material: b.material, massKg: Number(b.massKg), recycledKg: Number(b.recycledKg ?? 0) }),
  manufacture: (tx, b) =>
    A.manufacture(tx, {
      brandId: b.brandId,
      name: String(b.name ?? ""),
      category: b.category,
      emoji: b.emoji,
      description: b.description,
      inputs: (Array.isArray(b.inputs) ? b.inputs : []).slice(0, 20).map((i: any) => ({ batchId: String(i.batchId), massKg: Number(i.massKg) })),
      repairabilityScore: Number(b.repairabilityScore ?? 5),
      warrantyYears: Number(b.warrantyYears ?? 2),
      depositCredits: Number(b.depositCredits ?? 0),
      endOfLife: b.endOfLife,
      co2eKg: Number(b.co2eKg ?? 0),
    }),
  ship: (tx, b) => A.ship(tx, { productId: b.productId, actorId: b.actorId, toId: b.toId, mode: b.mode }),
  receive: (tx, b) => A.receive(tx, { productId: b.productId, actorId: b.actorId }),
  sell: (tx, b) => A.sell(tx, { productId: b.productId, actorId: b.actorId, toId: b.toId }),
  repair: (tx, b) => A.repair(tx, { productId: b.productId, actorId: b.actorId, note: String(b.note ?? "Repaired"), co2eKg: Number(b.co2eKg ?? 0) }),
  return: (tx, b) => A.returnForRecycling(tx, { productId: b.productId, actorId: b.actorId, toId: b.toId }),
  recycle: (tx, b) => A.recycle(tx, { productId: b.productId, actorId: b.actorId }),
  "issue-claim": (tx, b) => A.issueClaim(tx, { productId: b.productId, issuerId: b.issuerId, kind: b.kind, statement: String(b.statement ?? ""), value: b.value, evidence: b.evidence || undefined }),
  attest: (tx, b) => A.attestClaim(tx, { claimId: b.claimId, auditorId: b.auditorId, verdict: b.verdict === "REJECT" ? "REJECT" : "APPROVE", note: String(b.note ?? "") }),
  redeem: (tx, b) => A.redeem(tx, { actorId: b.actorId, rewardId: b.rewardId }),
};

export const SIGNED_ACTIONS = Object.keys(ACTIONS);

/**
 * Checks a signed request and, if valid, applies it.
 * The caller must run this inside a transaction that rolls back on throw.
 */
export function applySigned(db: Db, sequencerKey: string, action: string, sr: SignedRequest, nowMs = Date.now()): unknown {
  const fn = ACTIONS[action];
  if (!fn) throw new OrbitError(`Unknown action ${action}`, 404);
  const r = sr?.request;
  if (!r || typeof sr.signature !== "string") throw new OrbitError("Request must be signed", 401);
  if (r.action !== action) throw new OrbitError("Signed action does not match endpoint", 400);

  const key = registeredKeys(db.ledger).get(r.actorId);
  if (!key) throw new OrbitError(`${r.actorId} is not a registered actor`, 401);
  if (!verifyRequest(sr, key)) throw new OrbitError("Invalid signature: request was not signed by this actor's key", 401);

  const issued = Date.parse(r.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(nowMs - issued) > MAX_SKEW_MS) throw new OrbitError("Request expired or clock skew too large", 401);
  if (typeof r.nonce !== "string" || r.nonce.length < 8) throw new OrbitError("Missing nonce", 400);
  if (db.ledger.some((e) => e.auth?.request.actorId === r.actorId && e.auth.request.nonce === r.nonce)) throw new OrbitError("Replay: nonce already used", 409);

  // The acting party is whoever signed. A body naming someone else is rejected, not rewritten.
  const field = ACTOR_FIELD[action] ?? "actorId";
  if (r.body[field] !== undefined && r.body[field] !== r.actorId) throw new OrbitError(`Signed by ${r.actorId} but acting as ${String(r.body[field])}`, 403);
  const body = { ...r.body, [field]: r.actorId };

  return fn({ db, sequencerKey, auth: sr }, body);
}
