// Deterministic replay: the ledger is the only source of truth.
//
// Every non-anchor entry belongs to one actor-signed instruction. Replay re-runs each instruction
// through exactly the same rules as the live API (dispatch.applyAction) and checks that it
// produces byte-identical entries. So nobody, not even the operator holding the sequencer key,
// can insert, alter or invent derived data (credits, recovered lots, distances, passport hashes)
// without it showing up as a mismatch. All application state is rebuilt this way on load.
import { checkpointFromEntry } from "./actions.ts";
import { PROTOCOL_ID, requestHash } from "./auth.ts";
import { applyAction } from "./dispatch.ts";
import { entryBody } from "./ledger.ts";
import type { Db, LedgerEntry } from "./types.ts";

export const LEDGER_VERSION = 4;

export type ReplayProblem = "rule-violation" | "derived-mismatch" | "unauthorised-entry";
export interface ReplayIssue {
  index: number;
  problem: ReplayProblem;
  detail: string;
}

export function emptyDb(): Db {
  return { version: LEDGER_VERSION, actors: [], batches: [], products: [], claims: [], ledger: [], checkpoints: [] };
}

export interface ReplayState {
  db: Db;
  n: number; // entries of the source ledger processed so far
  issues: ReplayIssue[];
}

export function newReplayState(): ReplayState {
  return { db: emptyDb(), n: 0, issues: [] };
}

function sizes(db: Db) {
  return { actors: db.actors.length, batches: db.batches.length, products: db.products.length, claims: db.claims.length, checkpoints: db.checkpoints.length, ledgerId: db.ledgerId };
}
function truncate(db: Db, s: ReturnType<typeof sizes>) {
  db.actors.length = s.actors;
  db.batches.length = s.batches;
  db.products.length = s.products;
  db.claims.length = s.claims;
  db.checkpoints.length = s.checkpoints;
  db.ledgerId = s.ledgerId;
}

function firstDifference(expected: LedgerEntry, actual: LedgerEntry): string {
  const a = entryBody(expected) as Record<string, unknown>;
  const b = entryBody(actual) as Record<string, unknown>;
  for (const k of ["type", "subjectId", "actorId", "timestamp"]) if (a[k] !== b[k]) return `${k}: rules give "${String(a[k])}", ledger has "${String(b[k])}"`;
  const da = expected.data;
  const dbb = actual.data;
  for (const k of new Set([...Object.keys(da), ...Object.keys(dbb)])) {
    if (JSON.stringify(da[k]) !== JSON.stringify(dbb[k])) return `data.${k}: rules give ${JSON.stringify(da[k])}, ledger has ${JSON.stringify(dbb[k])}`;
  }
  if (JSON.stringify(a.place) !== JSON.stringify(b.place)) return "place differs";
  return "entry differs from what the rules produce";
}

/**
 * Feed source entries into the replay state (incrementally: only entries not yet processed).
 * The rebuilt ledger keeps the ORIGINAL entries (with their signatures) so the hash chain carries on.
 */
export function replayInto(state: ReplayState, source: LedgerEntry[]) {
  const { db } = state;
  const issue = (index: number, problem: ReplayProblem, detail: string) => state.issues.push({ index, problem, detail });
  let i = state.n;
  while (i < source.length) {
    const e = source[i];
    if (e.type === "ANCHORED") {
      // Anchors are the only protocol entries without an instruction; they change no state except
      // the checkpoint list, and every root is checked against the chain separately.
      if (e.actorId !== PROTOCOL_ID || e.auth) issue(i, "unauthorised-entry", "anchor entries must come from the protocol alone");
      db.ledger.push(e);
      db.checkpoints.push(checkpointFromEntry(e));
      i++;
      continue;
    }
    if (!e.auth) {
      issue(i, "unauthorised-entry", "no signed instruction behind this entry");
      db.ledger.push(e);
      i++;
      continue;
    }
    // The run of consecutive entries produced by one instruction.
    const rh = requestHash(e.auth.request);
    let j = i + 1;
    while (j < source.length && source[j].auth && requestHash(source[j].auth!.request) === rh) j++;
    const group = source.slice(i, j);

    const before = sizes(db);
    const req = e.auth.request;
    try {
      if (db.ledgerId && req.ledger !== db.ledgerId) throw new Error("instruction was signed for a different ledger");
      applyAction({ db, sequencerKey: "", auth: e.auth, at: e.timestamp }, req.action, req.actorId, req.body);
      const produced = db.ledger.slice(i);
      if (produced.length !== group.length) {
        issue(i, "derived-mismatch", `"${req.action}" produces ${produced.length} entr${produced.length === 1 ? "y" : "ies"} under the rules; the ledger has ${group.length}`);
      } else {
        const k = produced.findIndex((p, x) => p.hash !== group[x].hash);
        if (k >= 0) issue(i + k, "derived-mismatch", firstDifference(produced[k], group[k]));
      }
    } catch (err) {
      truncate(db, before);
      issue(i, "rule-violation", `"${req.action}" by ${req.actorId} breaks the rules: ${err instanceof Error ? err.message : String(err)}`);
    }
    db.ledger.length = i;
    for (const g of group) db.ledger.push(g);
    i = j;
  }
  state.n = source.length;
}

/** Rebuild all state from a ledger. */
export function replay(source: LedgerEntry[]): { db: Db; issues: ReplayIssue[] } {
  const s = newReplayState();
  replayInto(s, source);
  return { db: s.db, issues: s.issues };
}
