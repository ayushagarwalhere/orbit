// Tamper simulator for demos: edits a ledger entry the way a dishonest insider might,
// without being able to re-sign it. verifyLedger() should immediately flag it.
import { OrbitError } from "./domain.ts";
import type { Db } from "./types.ts";

export function tamper(db: Db, index: number) {
  if (db.tamper) throw new OrbitError("Restore the previous tampered entry first", 409);
  const e = db.ledger[index];
  if (!e) throw new OrbitError("No such ledger entry", 404);
  const original = JSON.parse(JSON.stringify(e));
  const data = { ...e.data };
  if (e.type === "BATCH_CREATED") {
    // inflate the lot and declare all of it recycled
    data.massKg = Number(data.massKg) * 2;
    data.recycledKg = data.massKg;
  }
  else if (e.type === "SHIPPED") data.distanceKm = 1; // hide air freight emissions
  else if (e.type === "CLAIM_ATTESTED") data.verdict = "APPROVE"; // flip a failed audit
  else if (e.type === "CREDIT_MINTED") data.amount = Number(data.amount) * 10; // inflate rewards
  else data.edited = true;
  e.data = data;
  db.tamper = { index, original };
  return { index, before: original.data, after: data };
}

export function restore(db: Db) {
  if (!db.tamper) throw new OrbitError("Nothing to restore", 409);
  db.ledger[db.tamper.index] = db.tamper.original;
  db.tamper = undefined;
}
