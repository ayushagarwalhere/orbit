// The single entry point for every state change. Live API requests and ledger replay both call
// applyAction(), so the rules that produced an entry can always be re-run to check it.
import * as A from "./actions.ts";
import { ACTOR_FIELD, PROTOCOL_ID, verifyRequest } from "./auth.ts";
import { OrbitError } from "./domain.ts";
import { MATERIAL_FACTORS } from "./factors.ts";
import { registeredKeys, type Tx } from "./ledger.ts";
import type { ClaimKind, Db, Material, Role, SignedRequest, TransportMode } from "./types.ts";

const MAX_SKEW_MS = 5 * 60 * 1000;

// ---------- strict input validation ----------

type Body = Record<string, unknown>;
const bad = (msg: string): never => {
  throw new OrbitError(msg, 400);
};
function str(b: Body, k: string, max: number, opt = false): string | undefined {
  const v = b[k];
  if (v === undefined || v === null || v === "") return opt ? undefined : bad(`${k} is required`);
  if (typeof v !== "string") return bad(`${k} must be text`);
  const t = v.trim();
  if (!t && !opt) bad(`${k} is required`);
  if (t.length > max) bad(`${k} is too long (max ${max})`);
  return t || undefined;
}
function id(b: Body, k: string, opt = false): string | undefined {
  const v = str(b, k, 64, opt);
  if (v !== undefined && !/^[A-Za-z0-9_-]+$/.test(v)) bad(`${k} has invalid characters`);
  return v;
}
function num(b: Body, k: string, min: number, max: number, opt = false, int = false): number | undefined {
  const v = b[k];
  if (v === undefined || v === null || v === "") return opt ? undefined : bad(`${k} is required`);
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) bad(`${k} must be a number`);
  if (n < min || n > max) bad(`${k} must be between ${min} and ${max}`);
  if (int && !Number.isInteger(n)) bad(`${k} must be a whole number`);
  return n;
}
function oneOf<T extends string>(b: Body, k: string, options: readonly T[], opt = false): T | undefined {
  const v = b[k];
  if (v === undefined && opt) return undefined;
  if (typeof v !== "string" || !options.includes(v as T)) bad(`${k} must be one of ${options.join(", ")}`);
  return v as T;
}

const MATERIALS = Object.keys(MATERIAL_FACTORS) as Material[];
const MODES = ["ship", "rail", "truck", "air"] as const satisfies readonly TransportMode[];
const ROLES = ["supplier", "manufacturer", "logistics", "retailer", "consumer", "repairer", "recycler", "auditor", "protocol"] as const satisfies readonly Role[];
const KINDS = ["RECYCLED_CONTENT", "CARBON_FOOTPRINT", "ORIGIN", "ETHICAL_LABOR", "REPAIRABILITY"] as const satisfies readonly ClaimKind[];
const CATEGORIES = ["apparel", "battery", "electronics", "packaging"] as const;

// ---------- actions: parse a body, then run the protocol rule ----------

const ACTIONS: Record<string, (tx: Tx, b: Body) => unknown> = {
  "register-actor": (tx, b) => {
    const place = (b.place ?? {}) as Body;
    const publicKey = str(b, "publicKey", 64)!;
    if (!/^[0-9a-f]{64}$/.test(publicKey)) bad("publicKey must be 32 bytes of lowercase hex");
    const ledgerId = str(b, "ledgerId", 64, true);
    if (ledgerId !== undefined && !/^[0-9a-f]{64}$/.test(ledgerId)) bad("ledgerId must be 32 bytes of hex");
    const actorId = id(b, "actorId")!;
    const role = oneOf(b, "role", ROLES)!;
    if ((role === "protocol") !== (actorId === PROTOCOL_ID)) bad("Only the protocol has the protocol role");
    return A.registerActor(tx, {
      actorId,
      name: str(b, "name", 80)!,
      role,
      publicKey,
      place: { city: str(place, "city", 60)!, country: str(place, "country", 2)!, lat: num(place, "lat", -90, 90)!, lng: num(place, "lng", -180, 180)! },
      description: str(b, "description", 200, true),
      ledgerId,
    });
  },
  "create-batch": (tx, b) => {
    const massKg = num(b, "massKg", 0.001, 1e7)!;
    return A.createBatch(tx, { producerId: id(b, "producerId")!, material: oneOf(b, "material", MATERIALS)!, massKg, recycledKg: num(b, "recycledKg", 0, massKg, true) ?? 0 });
  },
  manufacture: (tx, b) => {
    const inputs = b.inputs;
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 20) bad("inputs must list 1–20 material lots");
    return A.manufacture(tx, {
      brandId: id(b, "brandId")!,
      name: str(b, "name", 80)!,
      category: oneOf(b, "category", CATEGORIES)!,
      emoji: str(b, "emoji", 8, true),
      description: str(b, "description", 280, true),
      inputs: (inputs as Body[]).map((i) => ({ batchId: id(i ?? {}, "batchId")!, massKg: num(i ?? {}, "massKg", 0.001, 1e6)! })),
      repairabilityScore: num(b, "repairabilityScore", 0, 10, true),
      warrantyYears: num(b, "warrantyYears", 0, 30, true),
      depositCredits: num(b, "depositCredits", 0, 500, true, true),
      endOfLife: str(b, "endOfLife", 280, true),
      co2eKg: num(b, "co2eKg", 0, 1e6, true),
    });
  },
  ship: (tx, b) => A.ship(tx, { productId: id(b, "productId")!, actorId: id(b, "actorId")!, toId: id(b, "toId")!, mode: oneOf(b, "mode", MODES)! }),
  receive: (tx, b) => A.receive(tx, { productId: id(b, "productId")!, actorId: id(b, "actorId")! }),
  sell: (tx, b) => A.sell(tx, { productId: id(b, "productId")!, actorId: id(b, "actorId")!, toId: id(b, "toId")! }),
  repair: (tx, b) => A.repair(tx, { productId: id(b, "productId")!, actorId: id(b, "actorId")!, note: str(b, "note", 200)!, co2eKg: num(b, "co2eKg", 0, 1e4, true) }),
  return: (tx, b) => A.returnForRecycling(tx, { productId: id(b, "productId")!, actorId: id(b, "actorId")!, toId: id(b, "toId")! }),
  recycle: (tx, b) => {
    let recovered: Partial<Record<Material, number>> | undefined;
    if (b.recovered !== undefined) {
      if (typeof b.recovered !== "object" || b.recovered === null || Array.isArray(b.recovered)) bad("recovered must map material -> kg");
      recovered = {};
      for (const [m, kg] of Object.entries(b.recovered as Body)) {
        if (!MATERIALS.includes(m as Material)) bad(`Unknown material ${m}`);
        recovered[m as Material] = num({ kg }, "kg", 0, 1e6)!;
      }
    }
    return A.recycle(tx, { productId: id(b, "productId")!, actorId: id(b, "actorId")!, recovered });
  },
  "issue-claim": (tx, b) => {
    const kind = oneOf(b, "kind", KINDS)!;
    const textual = kind === "ORIGIN" || kind === "ETHICAL_LABOR";
    const value = textual ? str(b, "value", 40)! : num(b, "value", 0, kind === "RECYCLED_CONTENT" ? 100 : kind === "REPAIRABILITY" ? 10 : 1e6)!;
    if (kind === "ORIGIN" && !/^[A-Z]{2}$/.test(String(value))) bad("Origin must be a 2-letter country code");
    return A.issueClaim(tx, { productId: id(b, "productId")!, issuerId: id(b, "issuerId")!, kind, statement: str(b, "statement", 200)!, value, evidence: str(b, "evidence", 500, true) });
  },
  attest: (tx, b) => A.attestClaim(tx, { claimId: id(b, "claimId")!, auditorId: id(b, "auditorId")!, verdict: oneOf(b, "verdict", ["APPROVE", "REJECT"] as const)!, note: str(b, "note", 200)! }),
  redeem: (tx, b) => A.redeem(tx, { actorId: id(b, "actorId")!, rewardId: oneOf(b, "rewardId", A.REWARDS.map((r) => r.id))! }),
};

/** Actions a client may submit through the API. Registration is limited to self-registering consumers. */
export const SIGNED_ACTIONS = Object.keys(ACTIONS);

/**
 * Validate a body and run its rule. The acting party is whoever signed: a body naming someone
 * else is rejected, never rewritten. Used both live and during replay.
 */
export function applyAction(tx: Tx, action: string, actorId: string, body: Body): unknown {
  const fn = ACTIONS[action];
  if (!fn) throw new OrbitError(`Unknown action ${action}`, 404);
  if (typeof body !== "object" || body === null || Array.isArray(body)) bad("Body must be an object");
  const field = ACTOR_FIELD[action] ?? "actorId";
  if (body[field] !== undefined && body[field] !== actorId) throw new OrbitError(`Signed by ${actorId} but acting as ${String(body[field])}`, 403);
  return fn(tx, { ...body, [field]: actorId });
}

/** Used nonces per ledger, extended incrementally as the ledger grows (O(new entries) per request). */
const nonceCache = new WeakMap<Db, { n: number; set: Set<string> }>();
function usedNonces(db: Db): Set<string> {
  let c = nonceCache.get(db);
  if (!c || c.n > db.ledger.length) {
    c = { n: 0, set: new Set() };
    nonceCache.set(db, c);
  }
  for (let i = c.n; i < db.ledger.length; i++) {
    const a = db.ledger[i].auth?.request;
    if (a) c.set.add(`${a.actorId}:${a.nonce}`);
  }
  c.n = db.ledger.length;
  return c.set;
}

/**
 * Checks a signed request (signature, ledger, freshness, nonce) and, if valid, applies it with a
 * single sequencer timestamp for everything it produces.
 * The caller must run this inside a transaction that rolls back on throw.
 */
export function applySigned(db: Db, sequencerKey: string, action: string, sr: SignedRequest, nowMs = Date.now()): unknown {
  if (!ACTIONS[action]) throw new OrbitError(`Unknown action ${action}`, 404);
  const r = sr?.request;
  if (!r || typeof sr.signature !== "string" || typeof r !== "object") throw new OrbitError("Request must be signed", 401);
  if (r.action !== action) throw new OrbitError("Signed action does not match endpoint", 400);
  if (r.ledger !== db.ledgerId) throw new OrbitError("This instruction was signed for a different ledger", 409);
  if (typeof r.actorId !== "string" || typeof r.body !== "object" || r.body === null) throw new OrbitError("Malformed request", 400);

  let key = registeredKeys(db.ledger).get(r.actorId);
  if (action === "register-actor") {
    // Open self-registration, consumers only: the instruction must be signed by the key it registers.
    if (key) throw new OrbitError("Actor already registered", 409);
    if (r.body.role !== "consumer") throw new OrbitError("Only consumers can self-register", 403);
    key = typeof r.body.publicKey === "string" ? r.body.publicKey : undefined;
  }
  if (!key) throw new OrbitError(`${r.actorId} is not a registered actor`, 401);
  if (!verifyRequest(sr, key)) throw new OrbitError("Invalid signature: request was not signed by this actor's key", 401);

  const issued = Date.parse(r.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(nowMs - issued) > MAX_SKEW_MS) throw new OrbitError("Request expired or clock skew too large", 401);
  if (typeof r.nonce !== "string" || r.nonce.length < 8 || r.nonce.length > 64) throw new OrbitError("Missing nonce", 400);
  if (usedNonces(db).has(`${r.actorId}:${r.nonce}`)) throw new OrbitError("Replay: nonce already used", 409);

  return applyAction({ db, sequencerKey, auth: sr, at: new Date(nowMs).toISOString() }, action, r.actorId, r.body as Body);
}
