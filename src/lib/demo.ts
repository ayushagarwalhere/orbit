// Tamper simulator for demos. Simulations live in memory only; the ledger on disk is never touched.
//  - "edit":    someone with database access changes a past entry. Its hash breaks immediately.
//  - "rewrite": a malicious operator holding the sequencer key changes derived data in a past entry
//               and re-hashes and re-signs everything after it. Signatures pass, but replaying the
//               actors' signed instructions recomputes the true value and exposes it.
//  - "erase":   the same operator deletes a whole signed instruction (e.g. a failed audit), then
//               re-chains, re-signs and rewrites the local checkpoint records. Every remaining
//               instruction still replays cleanly; only the Merkle roots already on-chain expose it.
import { checkpointFromEntry, recordCheckpoint } from "./actions.ts";
import { requestHash } from "./auth.ts";
import { signHash } from "./crypto.ts";
import { OrbitError } from "./domain.ts";
import { applyAction } from "./dispatch.ts";
import { GENESIS_HASH, hashEntry, prefixRoot } from "./ledger.ts";
import { replay } from "./replay.ts";
import type { Db, LedgerEntry } from "./types.ts";

export type TamperMode = "edit" | "rewrite" | "erase";

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

/** Re-chain and re-sign from `from` onward, recomputing local checkpoint records to cover tracks. */
function resequence(db: Db, from: number, sequencerKey: string) {
  for (let i = from; i < db.ledger.length; i++) {
    const e = db.ledger[i];
    e.index = i;
    if (e.type === "ANCHORED") {
      const covers = Math.min(Number(e.data.covers), i);
      const root = prefixRoot(db, covers);
      e.data = { ...e.data, covers, merkleRoot: root };
      const cp = db.checkpoints.find((c) => c.txHash === e.data.txHash && c.checkpointId === e.data.checkpointId);
      if (cp) {
        cp.covers = covers;
        cp.merkleRoot = root;
      }
    }
    e.prevHash = db.ledger[i - 1]?.hash ?? GENESIS_HASH;
    e.hash = hashEntry(e);
    e.signature = signHash(e.hash, sequencerKey);
  }
}

/** A simulation restores itself after this long, so judges sharing one demo don't block each other. */
export const TAMPER_TTL_MS = 90_000;

export function tamper(db: Db, index: number, mode: TamperMode, sequencerKey: string, now = Date.now()) {
  if (db.tamper) restore(db); // a new simulation replaces the active one
  const target = db.ledger[index];
  if (!target) throw new OrbitError("No such ledger entry", 404);
  const original = JSON.parse(JSON.stringify(db.ledger)) as LedgerEntry[];
  const originalCheckpoints = JSON.parse(JSON.stringify(db.checkpoints));
  const before = target.data;
  let after: Record<string, unknown> = target.data;

  if (mode === "erase") {
    if (!target.auth) throw new OrbitError("Only entries from a signed instruction can be erased", 400);
    const rh = requestHash(target.auth.request);
    let from = index;
    while (from > 0 && db.ledger[from - 1].auth && requestHash(db.ledger[from - 1].auth!.request) === rh) from--;
    let to = index + 1;
    while (to < db.ledger.length && db.ledger[to].auth && requestHash(db.ledger[to].auth!.request) === rh) to++;
    // The most careful forgery: rebuild everything after the deleted instruction by re-running each
    // later instruction through the real rules and re-signing it, and re-anchor local checkpoints.
    // Every hash, signature and replay check passes; only roots already on-chain disagree.
    const removed = to - from;
    const forged = replay(original.slice(0, from)).db;
    for (let k = to; k < original.length; ) {
      const e = original[k];
      if (e.type === "ANCHORED" || !e.auth) {
        if (e.type === "ANCHORED") {
          const cp = checkpointFromEntry(e);
          const covers = cp.covers > from ? cp.covers - removed : cp.covers;
          const { at: _at, ...rest } = cp;
          recordCheckpoint({ db: forged, sequencerKey, at: e.timestamp }, { ...rest, covers, merkleRoot: prefixRoot(forged, covers) });
        }
        k++;
        continue;
      }
      const rh = requestHash(e.auth.request);
      let end = k + 1;
      while (end < original.length && original[end].auth && requestHash(original[end].auth!.request) === rh) end++;
      try {
        applyAction({ db: forged, sequencerKey, auth: e.auth, at: e.timestamp }, e.auth.request.action, e.auth.request.actorId, e.auth.request.body);
      } catch {
        /* an instruction that depended on the erased one simply drops out of the forged history */
      }
      k = end;
    }
    db.ledger = forged.ledger;
    db.checkpoints = forged.checkpoints;
    after = { erased: removed };
  } else {
    target.data = forge(target);
    after = target.data;
    if (mode === "rewrite") resequence(db, index, sequencerKey);
  }
  db.tamper = { index, mode, at: now, original, originalCheckpoints };
  return { index, mode, before, after };
}

/** True if a simulation has outlived its TTL and should be rolled back. */
export function tamperExpired(db: Db, now = Date.now()): boolean {
  return !!db.tamper && now - (db.tamper.at ?? 0) > TAMPER_TTL_MS;
}

export function restore(db: Db) {
  if (!db.tamper) throw new OrbitError("Nothing to restore", 409);
  db.ledger = db.tamper.original;
  db.checkpoints = db.tamper.originalCheckpoints;
  db.tamper = undefined;
}
