// Actor authorisation. Every write is an instruction signed by the actor's own key.
// The server verifies it. In production it never holds actor keys, so it cannot act on anyone's
// behalf. (Demo mode is the exception: the server generates the role-play keys.)
import { hashObject, randomPrivateKey, signHash, verifySignature } from "./crypto.ts";
import type { ActionRequest, LedgerEntry, SignedRequest } from "./types.ts";

export const PROTOCOL_ID = "orbit-protocol";

export function requestHash(r: ActionRequest): string {
  return hashObject(r);
}

export function signRequest(request: ActionRequest, privateKeyHex: string): SignedRequest {
  return { request, signature: signHash(requestHash(request), privateKeyHex) };
}

export function verifyRequest(sr: SignedRequest, publicKeyHex: string): boolean {
  return verifySignature(requestHash(sr.request), sr.signature, publicKeyHex);
}

export function newRequest(action: string, actorId: string, body: Record<string, unknown>, ledger: string, issuedAt = new Date().toISOString(), nonce?: string): ActionRequest {
  return {
    action,
    ledger,
    actorId,
    body,
    issuedAt,
    // Seeded history uses deterministic nonces so the demo ledger is reproducible.
    nonce: nonce ?? randomPrivateKey().slice(0, 24), // 96 random bits
  };
}

/** Which body field names the acting party, per action. The server forces it to the signer. */
export const ACTOR_FIELD: Record<string, string> = {
  "register-actor": "actorId",
  "create-batch": "producerId",
  manufacture: "brandId",
  "issue-claim": "issuerId",
  attest: "auditorId",
  accredit: "accreditorId",
  "suspend-accreditation": "accreditorId",
};

/** Entry types each action is allowed to produce on behalf of the signer. */
const ALLOWED: Record<string, string[]> = {
  "register-actor": ["ACTOR_REGISTERED"],
  "create-batch": ["BATCH_CREATED"],
  manufacture: ["MANUFACTURED"],
  ship: ["SHIPPED"],
  receive: ["RECEIVED"],
  sell: ["SOLD"],
  repair: ["REPAIRED"],
  return: ["RETURNED"],
  recycle: ["RECYCLED", "BATCH_CREATED"],
  "issue-claim": ["CLAIM_ISSUED"],
  attest: ["CLAIM_ATTESTED"],
  redeem: ["CREDIT_REDEEMED"],
  accredit: ["ACCREDITED"],
  "suspend-accreditation": ["ACCREDITATION_SUSPENDED"],
};

/** Body fields that must match what the ledger entry recorded. */
const BINDINGS: [bodyKey: string, read: (e: LedgerEntry) => unknown][] = [
  ["toId", (e) => e.data.to],
  ["mode", (e) => e.data.mode],
  ["verdict", (e) => e.data.verdict],
  ["note", (e) => e.data.note],
  ["kind", (e) => e.data.kind],
  ["value", (e) => e.data.value],
  ["rewardId", (e) => e.data.reward],
  ["publicKey", (e) => e.data.publicKey],
  ["massKg", (e) => (e.type === "BATCH_CREATED" && e.auth?.request.action === "create-batch" ? e.data.massKg : undefined)],
  ["recycledKg", (e) => (e.type === "BATCH_CREATED" && e.auth?.request.action === "create-batch" ? e.data.recycledKg : undefined)],
];

/**
 * Does this ledger entry faithfully reflect the actor's signed instruction?
 * Returns a reason string if not. Protocol entries (credits, anchors) only need the sequencer.
 */
export function authMismatch(e: LedgerEntry): string | null {
  if (e.actorId === PROTOCOL_ID && e.type !== "ACTOR_REGISTERED") return null;
  if (!e.auth) return "missing actor authorisation";
  const r = e.auth.request;
  if (r.actorId !== e.actorId) return `signed by ${r.actorId}, recorded as ${e.actorId}`;
  if (!ALLOWED[r.action]?.includes(e.type)) return `request "${r.action}" cannot produce ${e.type}`;
  // A new claim gets its own id, so its entry names the product in data instead.
  const recordedSubject = e.type === "CLAIM_ISSUED" ? e.data.productId : e.type === "BATCH_CREATED" ? undefined : e.subjectId;
  const signedSubject = r.body.claimId ?? r.body.productId;
  if (signedSubject !== undefined && recordedSubject !== undefined && signedSubject !== recordedSubject) {
    return `request is about ${String(signedSubject)}, entry is about ${String(recordedSubject)}`;
  }
  for (const [key, read] of BINDINGS) {
    if (!(key in r.body)) continue;
    const recorded = read(e);
    if (recorded === undefined) continue;
    const signed = r.body[key];
    const same = typeof recorded === "number" ? Math.abs(Number(signed) - recorded) < 0.001 : String(signed) === String(recorded);
    if (!same) return `${key}: actor signed "${String(signed)}", ledger says "${String(recorded)}"`;
  }
  return null;
}
