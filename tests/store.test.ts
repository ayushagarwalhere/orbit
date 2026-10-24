import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Isolated data dir for this test run.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-store-"));
process.env.ORBIT_DATA_DIR = dir;
delete process.env.ORBIT_KEYSTORE;

const { newRequest, signRequest } = await import("../src/lib/auth.ts");
const store = await import("../src/lib/store.ts");
const { tamper, restore } = await import("../src/lib/demo.ts");
const { verifyLedger } = await import("../src/lib/ledger.ts");

const g = globalThis as unknown as { __orbit?: unknown; __orbitPersisted?: unknown };
function reload() {
  delete g.__orbit;
  delete g.__orbitPersisted;
  return store.getDb();
}
const keys = () => JSON.parse(fs.readFileSync(path.join(dir, "keystore.json"), "utf8")) as Record<string, string>;
const sign = (actor: string, action: string, body: Record<string, unknown>) => signRequest(newRequest(action, actor, body), keys()[actor]);

test("ledger persists as an append-only log and reloads identically", () => {
  const db = store.getDb();
  const before = db.ledger.length;
  const linesBefore = fs.readFileSync(path.join(dir, "ledger.jsonl"), "utf8").trim().split("\n").length;
  assert.equal(linesBefore, before);
  store.submitSigned("create-batch", sign("kutch-coop", "create-batch", { material: "organic-cotton", massKg: 3 }));
  const linesAfter = fs.readFileSync(path.join(dir, "ledger.jsonl"), "utf8").trim().split("\n").length;
  assert.equal(linesAfter, before + 1, "one appended line per entry");
  const root = verifyLedger(store.getDb()).merkleRoot;
  const again = reload();
  assert.equal(again.ledger.length, before + 1);
  assert.equal(verifyLedger(again).merkleRoot, root);
  assert.equal(verifyLedger(again).ok, true);
});

test("a rejected write leaves memory and disk untouched", () => {
  const db = store.getDb();
  const n = db.ledger.length;
  const batches = db.batches.length;
  // Valid signature, but suppliers can't mint recycled material: rejected mid-action.
  assert.throws(() => store.submitSigned("create-batch", sign("pacific-polymers", "create-batch", { material: "polyester", massKg: 5, recycledKg: 5 })), /recycler/);
  assert.equal(store.getDb().ledger.length, n);
  assert.equal(store.getDb().batches.length, batches);
  assert.equal(reload().ledger.length, n);
});

test("tamper and restore rewrite the log, and the edit survives a reload", () => {
  const idx = store.getDb().ledger.findIndex((e) => e.type === "SHIPPED");
  store.mutate((tx) => tamper(tx.db, idx, "edit", tx.sequencerKey));
  assert.equal(verifyLedger(reload()).ok, false);
  store.mutate((tx) => restore(tx.db));
  assert.equal(verifyLedger(reload()).ok, true);
});
