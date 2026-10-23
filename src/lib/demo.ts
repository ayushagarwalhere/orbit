// Tamper simulator for demos.
//  - "edit": someone with database access changes a past entry. Hashes break immediately.
//  - "rewrite": a malicious operator who holds the sequencer key changes a past entry, then
//    re-hashes and re-signs everything after it and even rewrites the local checkpoint records.
//    Every local check passes. Only the Merkle root already published on-chain exposes it.
import { OrbitError } from "./domain.ts";
import { hashEntry, prefixRoot } from "./ledger.ts";
import { signHash } from "./crypto.ts";
import type { Db, LedgerEntry } from "./types.ts";

function forge(e: LedgerEntry): Record<string, unknown> {
  const data = { ...e.data };
  if (e.type === "BATCH_CREATED") {
    data.massKg = Number(data.massKg) * 2; // inflate the lot and declare all of it recycled
    data.recycledKg = data.massKg;
  } else if (e.type === "SHIPPED") data.distanceKm = 1; // hide transport emissions
  else if (e.type === "CLAIM_ATTESTED") data.verdict = "APPROVE"; // flip a failed audit
  else if (e.type === "CREDIT_MINTED") data.amount = Number(data.amount) * 10; // inflate rewards
  else data.edited = true;
  return data;
}

export function tamper(db: Db, index: number, mode: "edit" | "rewrite", sequencerKey: string) {
  if (db.tamper) throw new OrbitError("Restore the previous tamper first", 409);
  const target = db.ledger[index];
  if (!target) throw new OrbitError("No such ledger entry", 404);
  const original = JSON.parse(JSON.stringify(db.ledger)) as LedgerEntry[];
  const originalCheckpoints = JSON.parse(JSON.stringify(db.checkpoints));
  const before = target.data;
  target.data = forge(target);

  if (mode === "rewrite") {
    // Cover the tracks: re-chain, re-sign, and recompute every later local checkpoint root.
    for (let i = index; i < db.ledger.length; i++) {
      const e = db.ledger[i];
      if (e.type === "ANCHORED") {
        const covers = Number(e.data.covers);
        const root = prefixRoot(db, covers);
        e.data = { ...e.data, merkleRoot: root };
        const cp = db.checkpoints.find((c) => c.covers === covers);
        if (cp) cp.merkleRoot = root;
      }
      e.prevHash = db.ledger[i - 1]?.hash ?? "0".repeat(64);
      e.hash = hashEntry(e);
      e.signature = signHash(e.hash, sequencerKey);
    }
  }
  db.tamper = { index, mode, original, originalCheckpoints };
  return { index, mode, before, after: target.data };
}

export function restore(db: Db) {
  if (!db.tamper) throw new OrbitError("Nothing to restore", 409);
  db.ledger = db.tamper.original;
  db.checkpoints = db.tamper.originalCheckpoints;
  db.tamper = undefined;
}
