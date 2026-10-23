import { hashObject, merkleRoot, signHash, verifySignature } from "./crypto.ts";
import type { Db, EntryType, LedgerEntry, Place } from "./types.ts";

export const GENESIS_HASH = "0".repeat(64);

export function entryBody(e: Omit<LedgerEntry, "hash" | "signature">) {
  return {
    index: e.index,
    type: e.type,
    subjectId: e.subjectId,
    actorId: e.actorId,
    timestamp: e.timestamp,
    place: e.place,
    data: e.data,
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
}

export function append(db: Db, input: AppendInput): LedgerEntry {
  const prev = db.ledger[db.ledger.length - 1];
  const base = {
    index: db.ledger.length,
    type: input.type,
    subjectId: input.subjectId,
    actorId: input.actorId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    place: input.place,
    data: input.data ?? {},
    prevHash: prev ? prev.hash : GENESIS_HASH,
  };
  const hash = hashEntry(base);
  const entry: LedgerEntry = { ...base, hash, signature: signHash(hash, input.actorId) };
  db.ledger.push(entry);
  return entry;
}

export type EntryProblem = "hash-mismatch" | "broken-link" | "bad-signature" | "unknown-actor";

export interface IntegrityReport {
  ok: boolean;
  checked: number;
  issues: { index: number; problem: EntryProblem; detail: string }[];
  badIndexes: Set<number>;
  merkleRoot: string;
}

/** Re-derives every hash, checks every link and every signature. Any edit anywhere is detected. */
export function verifyLedger(db: Db): IntegrityReport {
  const keys = new Map(db.actors.map((a) => [a.id, a.publicKey]));
  const issues: IntegrityReport["issues"] = [];
  const bad = new Set<number>();
  db.ledger.forEach((e, i) => {
    const expectedPrev = i === 0 ? GENESIS_HASH : db.ledger[i - 1].hash;
    if (e.prevHash !== expectedPrev) {
      issues.push({ index: i, problem: "broken-link", detail: "prevHash does not match previous entry" });
      bad.add(i);
    }
    const recomputed = hashEntry(e);
    if (recomputed !== e.hash) {
      issues.push({ index: i, problem: "hash-mismatch", detail: `content hashes to ${recomputed.slice(0, 12)}…` });
      bad.add(i);
    }
    const pk = keys.get(e.actorId);
    if (!pk) {
      issues.push({ index: i, problem: "unknown-actor", detail: e.actorId });
      bad.add(i);
    } else if (!verifySignature(e.hash, e.signature, pk)) {
      issues.push({ index: i, problem: "bad-signature", detail: "Ed25519 signature invalid" });
      bad.add(i);
    }
  });
  return {
    ok: issues.length === 0,
    checked: db.ledger.length,
    issues,
    badIndexes: bad,
    merkleRoot: merkleRoot(db.ledger.map((e) => e.hash)),
  };
}

export function entriesFor(db: Db, subjectId: string): LedgerEntry[] {
  return db.ledger.filter((e) => e.subjectId === subjectId);
}
