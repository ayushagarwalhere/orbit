import { PROTOCOL_ID, authMismatch, requestHash, verifyRequest } from "./auth.ts";
import { hashObject, merkleRoot, signHash, verifySignature } from "./crypto.ts";
import type { Db, EntryType, LedgerEntry, Place, SignedRequest } from "./types.ts";

export const GENESIS_HASH = "0".repeat(64);

/** A write context: the database, the sequencer's key, and the actor's signed instruction. */
export interface Tx {
  db: Db;
  sequencerKey: string;
  auth?: SignedRequest;
  at?: string; // entry timestamp override (seeding); otherwise the sequencer's clock
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
  withAuth?: boolean; // default: attach tx.auth when the actor is not the protocol
}

export function append(tx: Tx, input: AppendInput): LedgerEntry {
  const { db } = tx;
  const prev = db.ledger[db.ledger.length - 1];
  const attach = input.withAuth ?? input.actorId !== PROTOCOL_ID;
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
  const entry: LedgerEntry = { ...base, hash, signature: signHash(hash, tx.sequencerKey) };
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
export function registeredKeys(ledger: LedgerEntry[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const e of ledger) {
    if (e.type !== "ACTOR_REGISTERED" || keys.has(e.subjectId)) continue;
    keys.set(e.subjectId, String(e.data.publicKey));
  }
  return keys;
}

export function prefixRoot(db: Db, covers: number): string {
  return merkleRoot(db.ledger.slice(0, covers).map((e) => e.hash));
}

/**
 * Full independent check: every hash, every link, the sequencer's signature, the actor's
 * signed instruction (and that the entry matches it), replay, and optional anchored roots.
 */
const memo = new WeakMap<Db, { key: string; report: IntegrityReport }>();

export function verifyLedger(db: Db, anchors: AnchorRef[] = []): IntegrityReport {
  // Signature checks are the expensive part; cache per ledger state (append-only, so length + head + tamper flag identify it).
  const key = anchors.length ? null : `${db.ledger.length}:${db.ledger.at(-1)?.hash}:${db.tamper ? `${db.tamper.mode}${db.tamper.index}` : ""}`;
  const hit = key ? memo.get(db) : undefined;
  if (hit && hit.key === key) return hit.report;
  const report = computeIntegrity(db, anchors);
  if (key) memo.set(db, { key, report });
  return report;
}

function computeIntegrity(db: Db, anchors: AnchorRef[]): IntegrityReport {
  const issues: IntegrityReport["issues"] = [];
  const bad = new Set<number>();
  const flag = (index: number, problem: EntryProblem, detail: string) => {
    issues.push({ index, problem, detail });
    bad.add(index);
  };
  const keys = new Map<string, string>();
  const seenRequests = new Map<string, number>();
  let lastRequest: string | null = null;
  const ledger = db.ledger;

  ledger.forEach((e, i) => {
    const expectedPrev = i === 0 ? GENESIS_HASH : ledger[i - 1].hash;
    if (e.prevHash !== expectedPrev) flag(i, "broken-link", "prevHash does not match previous entry");
    const recomputed = hashEntry(e);
    if (recomputed !== e.hash) flag(i, "hash-mismatch", `content hashes to ${recomputed.slice(0, 12)}…`);

    if (e.type === "ACTOR_REGISTERED" && !keys.has(e.subjectId)) keys.set(e.subjectId, String(e.data.publicKey));
    const seqKey = keys.get(PROTOCOL_ID);
    if (!seqKey || !verifySignature(e.hash, e.signature, seqKey)) flag(i, "bad-sequencer-signature", "not signed by the registered sequencer");

    if (e.actorId !== PROTOCOL_ID || e.type === "ACTOR_REGISTERED") {
      const actorKey = keys.get(e.actorId);
      if (!actorKey) flag(i, "unknown-actor", `${e.actorId} is not registered on the ledger`);
      else if (!e.auth || !verifyRequest(e.auth, actorKey)) flag(i, "bad-actor-signature", "actor's signed instruction is missing or invalid");
      const mismatch = authMismatch(e);
      if (mismatch) flag(i, "auth-mismatch", mismatch);
      if (e.auth) {
        // One instruction may produce a run of entries, but must never reappear later.
        const rh = requestHash(e.auth.request);
        if (seenRequests.has(rh) && lastRequest !== rh) flag(i, "replayed-request", "this signed instruction was already used earlier");
        seenRequests.set(rh, i);
        lastRequest = rh;
      }
    }
  });

  for (const a of anchors) {
    if (a.covers > ledger.length) {
      flag(ledger.length - 1, "anchor-mismatch", `${a.label} covers ${a.covers} entries but ledger has ${ledger.length}`);
      continue;
    }
    const root = prefixRoot(db, a.covers);
    if (root !== a.merkleRoot) {
      // Find the first entry that diverges is impossible from a root alone; flag the range.
      flag(a.covers - 1, "anchor-mismatch", `${a.label}: recomputed root ${root.slice(0, 12)}… ≠ anchored ${a.merkleRoot.slice(0, 12)}…`);
    }
  }

  return { ok: issues.length === 0, checked: ledger.length, issues, badIndexes: bad, merkleRoot: merkleRoot(ledger.map((e) => e.hash)), keys };
}

export function entriesFor(db: Db, subjectId: string): LedgerEntry[] {
  return db.ledger.filter((e) => e.subjectId === subjectId);
}
