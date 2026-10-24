import { PROTOCOL_ID, authMismatch, requestHash, verifyRequest } from "./auth.ts";
import { MerkleTree, hashObject, signHash, verifySignature } from "./crypto.ts";
import { newReplayState, replayInto, type ReplayState } from "./replay.ts";
import type { Db, EntryType, LedgerEntry, Place, SignedRequest } from "./types.ts";

export const GENESIS_HASH = "0".repeat(64);
const SKEW_MS = 5 * 60 * 1000;

/** A write context: the database, the sequencer's key, and the actor's signed instruction. */
export interface Tx {
  db: Db;
  /** Sequencer signing key. Empty during replay (verifiers re-derive entries, they don't sign them). */
  sequencerKey: string;
  auth?: SignedRequest;
  /** One timestamp for every entry a request produces (set by the sequencer, or by replay). */
  at?: string;
}

export function entryBody(e: Omit<LedgerEntry, "hash" | "signature">) {
  return {
    index: e.index,
    type: e.type,
    subjectId: e.subjectId,
    actorId: e.actorId,
    timestamp: e.timestamp,
    place: e.place,
    data: e.data,
    auth: e.auth,
    prevHash: e.prevHash,
  };
}

export function hashEntry(e: Omit<LedgerEntry, "hash" | "signature">): string {
  return hashObject(entryBody(e));
}

export interface AppendInput {
  type: EntryType;
  subjectId: string;
  actorId: string;
  data?: Record<string, unknown>;
  place?: Place;
  timestamp?: string;
  withAuth?: boolean; // default: attach tx.auth whenever the write comes from a signed request
}

export function append(tx: Tx, input: AppendInput): LedgerEntry {
  const { db } = tx;
  const prev = db.ledger[db.ledger.length - 1];
  // Everything a request produces (including protocol-minted credits) carries that request,
  // so every entry can be traced to, and re-derived from, an actor's signed instruction.
  const attach = input.withAuth ?? !!tx.auth;
  const base = {
    index: db.ledger.length,
    type: input.type,
    subjectId: input.subjectId,
    actorId: input.actorId,
    timestamp: input.timestamp ?? tx.at ?? new Date().toISOString(),
    place: input.place,
    data: input.data ?? {},
    auth: attach ? tx.auth : undefined,
    prevHash: prev ? prev.hash : GENESIS_HASH,
  };
  const hash = hashEntry(base);
  const entry: LedgerEntry = { ...base, hash, signature: tx.sequencerKey ? signHash(hash, tx.sequencerKey) : "" };
  db.ledger.push(entry);
  return entry;
}

export type EntryProblem =
  | "hash-mismatch"
  | "broken-link"
  | "bad-sequencer-signature"
  | "bad-actor-signature"
  | "auth-mismatch"
  | "unknown-actor"
  | "replayed-request"
  | "timestamp-skew"
  | "rule-violation"
  | "derived-mismatch"
  | "unauthorised-entry"
  | "anchor-mismatch";

export interface AnchorRef {
  covers: number;
  merkleRoot: string;
  label: string;
}

export interface IntegrityReport {
  ok: boolean;
  checked: number;
  issues: { index: number; problem: EntryProblem; detail: string }[];
  badIndexes: Set<number>;
  merkleRoot: string;
  /** Public keys as committed by ACTOR_REGISTERED entries on the ledger itself. */
  keys: Map<string, string>;
}

/** Public keys, taken only from registration entries (self-signed proof of possession). */
const keyCache = new WeakMap<LedgerEntry[], { n: number; keys: Map<string, string> }>();
export function registeredKeys(ledger: LedgerEntry[]): Map<string, string> {
  let c = keyCache.get(ledger);
  if (!c || c.n > ledger.length) {
    c = { n: 0, keys: new Map() };
    keyCache.set(ledger, c);
  }
  for (let i = c.n; i < ledger.length; i++) {
    const e = ledger[i];
    if (e.type === "ACTOR_REGISTERED" && !c.keys.has(e.subjectId)) c.keys.set(e.subjectId, String(e.data.publicKey));
  }
  c.n = ledger.length;
  return c.keys;
}

/**
 * The RFC 6962 tree over a ledger's entry hashes, kept up to date incrementally. Any edit to history
 * (a different head, a shorter ledger, a demo simulation) rebuilds it.
 */
const trees = new WeakMap<LedgerEntry[], { tree: MerkleTree; head?: string; key: string }>();
export function ledgerTree(db: Db): MerkleTree {
  const key = db.tamper ? `${db.tamper.mode}${db.tamper.index}${db.tamper.at}` : "";
  let c = trees.get(db.ledger);
  const n = c?.tree.size ?? 0;
  if (!c || c.key !== key || n > db.ledger.length || (n > 0 && db.ledger[n - 1].hash !== c.head)) {
    c = { tree: new MerkleTree(), key };
    trees.set(db.ledger, c);
  }
  for (let i = c.tree.size; i < db.ledger.length; i++) c.tree.append(db.ledger[i].hash);
  c.head = db.ledger.at(-1)?.hash;
  return c.tree;
}

/** Root over entries 0..covers-1 (O(log² n) from the cached tree). */
export function prefixRoot(db: Db, covers: number): string {
  return ledgerTree(db).root(Math.max(0, Math.min(covers, db.ledger.length)));
}

/**
 * Incremental verification state. The ledger is append-only, so once entries 0..n-1 are verified
 * only new entries need checking: O(new entries) per call instead of O(ledger). Any edit to
 * history (tamper flag, different head, shorter ledger) falls back to a full pass.
 */
interface VerifyState {
  n: number;
  head: string | undefined;
  tamperKey: string;
  keys: Map<string, string>;
  seenRequests: Set<string>;
  lastRequest: string | null;
  issues: IntegrityReport["issues"];
  bad: Set<number>;
  replay: ReplayState;
}

const states = new WeakMap<Db, VerifyState>();

function freshState(tamperKey: string): VerifyState {
  return { n: 0, head: undefined, tamperKey, keys: new Map(), seenRequests: new Set(), lastRequest: null, issues: [], bad: new Set(), replay: newReplayState() };
}

function checkEntry(s: VerifyState, ledger: LedgerEntry[], i: number) {
  const e = ledger[i];
  const flag = (problem: EntryProblem, detail: string) => {
    s.issues.push({ index: i, problem, detail });
    s.bad.add(i);
  };
  const expectedPrev = i === 0 ? GENESIS_HASH : ledger[i - 1].hash;
  if (e.prevHash !== expectedPrev) flag("broken-link", "prevHash does not match previous entry");
  const recomputed = hashEntry(e);
  if (recomputed !== e.hash) flag("hash-mismatch", `content hashes to ${recomputed.slice(0, 12)}…`);

  if (e.type === "ACTOR_REGISTERED" && !s.keys.has(e.subjectId)) s.keys.set(e.subjectId, String(e.data.publicKey));
  const seqKey = s.keys.get(PROTOCOL_ID);
  if (!seqKey || !verifySignature(e.hash, e.signature, seqKey)) flag("bad-sequencer-signature", "not signed by the registered sequencer");

  if (e.actorId !== PROTOCOL_ID || e.type === "ACTOR_REGISTERED") {
    const actorKey = s.keys.get(e.actorId);
    if (!actorKey) flag("unknown-actor", `${e.actorId} is not registered on the ledger`);
    else if (!e.auth || !verifyRequest(e.auth, actorKey)) flag("bad-actor-signature", "actor's signed instruction is missing or invalid");
    const mismatch = authMismatch(e);
    if (mismatch) flag("auth-mismatch", mismatch);
    if (e.auth) {
      // The sequencer's timestamp must agree with the time the actor signed (within the API's skew window).
      const skew = Math.abs(Date.parse(e.timestamp) - Date.parse(e.auth.request.issuedAt));
      if (!(skew <= SKEW_MS)) flag("timestamp-skew", `recorded ${e.timestamp}, but the actor signed at ${e.auth.request.issuedAt}`);
      // One instruction may produce a run of entries, but must never reappear later.
      const rh = requestHash(e.auth.request);
      if (s.seenRequests.has(rh) && s.lastRequest !== rh) flag("replayed-request", "this signed instruction was already used earlier");
      s.seenRequests.add(rh);
      s.lastRequest = rh;
    }
  }
}

/**
 * Full independent check: every hash, every link, the sequencer's signature, the actor's
 * signed instruction (and that the entry matches it), replay, and optional anchored roots.
 */
export function verifyLedger(db: Db, anchors: AnchorRef[] = []): IntegrityReport {
  const ledger = db.ledger;
  const tamperKey = db.tamper ? `${db.tamper.mode}${db.tamper.index}` : "";
  let s = states.get(db);
  const prefixIntact = s && s.tamperKey === tamperKey && s.n <= ledger.length && (s.n === 0 || ledger[s.n - 1].hash === s.head);
  if (!s || !prefixIntact) {
    s = freshState(tamperKey);
    states.set(db, s);
  }
  for (let i = s.n; i < ledger.length; i++) checkEntry(s, ledger, i);
  s.n = ledger.length;
  s.head = ledger.at(-1)?.hash;
  // Re-run every instruction through the rules and compare the derived entries (incremental).
  const before = s.replay.issues.length;
  replayInto(s.replay, ledger);
  for (const r of s.replay.issues.slice(before)) {
    s.issues.push(r);
    s.bad.add(r.index);
  }

  const issues = s.issues.slice();
  const bad = new Set(s.bad);
  for (const a of anchors) {
    const at = Math.max(0, Math.min(a.covers, ledger.length) - 1);
    if (a.covers > ledger.length) {
      issues.push({ index: at, problem: "anchor-mismatch", detail: `${a.label} covers ${a.covers} entries but ledger has ${ledger.length}` });
      bad.add(at);
      continue;
    }
    const root = prefixRoot(db, a.covers);
    if (root !== a.merkleRoot) {
      issues.push({ index: at, problem: "anchor-mismatch", detail: `${a.label}: recomputed root ${root.slice(0, 12)}… ≠ anchored ${a.merkleRoot.slice(0, 12)}…` });
      bad.add(at);
    }
  }
  return { ok: issues.length === 0, checked: ledger.length, issues, badIndexes: bad, merkleRoot: ledgerTree(db).root(), keys: s.keys };
}

export function entriesFor(db: Db, subjectId: string): LedgerEntry[] {
  return db.ledger.filter((e) => e.subjectId === subjectId);
}
