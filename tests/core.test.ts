import assert from "node:assert/strict";
import { test } from "node:test";
import { attestClaim, createBatch, issueClaim, manufacture, recycle, redeem, returnForRecycling, sell, ship } from "../src/lib/actions.ts";
import { merkleProof, merkleRoot, verifyMerkleProof } from "../src/lib/crypto.ts";
import { tamper, restore } from "../src/lib/demo.ts";
import { balanceOf, custody, provenRecycledPct } from "../src/lib/domain.ts";
import { lintClaim } from "../src/lib/greenwash.ts";
import { verifyLedger } from "../src/lib/ledger.ts";
import { exportPassport } from "../src/lib/passport.ts";
import { seedDb } from "../src/lib/seed.ts";
import { trustReport } from "../src/lib/verify.ts";

const byName = (db: ReturnType<typeof seedDb>, name: string) => {
  const p = db.products.find((x) => x.name === name);
  assert.ok(p, `missing product ${name}`);
  return p;
};

test("seeded ledger is fully signed and hash-linked", () => {
  const db = seedDb();
  const r = verifyLedger(db);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.ok(db.ledger.length > 40);
});

test("seed timestamps only move forward", () => {
  const db = seedDb();
  for (let i = 1; i < db.ledger.length; i++) {
    assert.ok(db.ledger[i].timestamp >= db.ledger[i - 1].timestamp, `entry ${i} goes back in time`);
  }
});

test("honest product earns an A, greenwashed product is caught", () => {
  const db = seedDb();
  const tee = trustReport(db, byName(db, "Orbit Tee"));
  assert.equal(tee.grade, "A");
  assert.ok(tee.claims.every((c) => c.status === "VERIFIED"));

  const hoodie = trustReport(db, byName(db, "EcoCloud Hoodie"));
  assert.ok(["D", "E"].includes(hoodie.grade));
  const recycled = hoodie.claims.find((c) => c.claim.kind === "RECYCLED_CONTENT");
  assert.equal(recycled?.status, "CONTRADICTED");
  assert.ok(recycled?.lint.some((l) => l.severity === "high"));
  assert.equal(hoodie.claims.find((c) => c.claim.kind === "ETHICAL_LABOR")?.status, "CONTRADICTED");
});

test("closed loop: recovered material carries into the next product", () => {
  const db = seedDb();
  const loop = byName(db, "Strata 500 Wh Loop Edition");
  assert.ok(provenRecycledPct(db, loop) > 90);
  const t = trustReport(db, loop);
  assert.ok(t.claims.every((c) => c.status === "VERIFIED"), JSON.stringify(t.claims.map((c) => c.reasons)));
  assert.equal(custody(db, byName(db, "Strata 500 Wh E-bike Battery").id).stage, "recycled");
});

test("tampering is detected and restorable", () => {
  const db = seedDb();
  tamper(db, 2);
  const r = verifyLedger(db);
  assert.equal(r.ok, false);
  assert.ok(r.badIndexes.has(2));
  restore(db);
  assert.equal(verifyLedger(db).ok, true);
});

test("editing a passport record breaks its trust score", () => {
  const db = seedDb();
  const tee = byName(db, "Orbit Tee");
  tee.inputs[0].massKg = 0.01; // quietly change the bill of materials
  const t = trustReport(db, tee);
  assert.equal(t.integrity.passportTampered, true);
  assert.ok(t.score <= 10);
});

test("mass balance prevents overselling a material lot", () => {
  const db = seedDb();
  const lot = createBatch(db, { producerId: "kutch-coop", material: "organic-cotton", massKg: 1 });
  manufacture(db, { brandId: "lumen", name: "A", category: "apparel", inputs: [{ batchId: lot.id, massKg: 0.8 }] });
  assert.throws(() => manufacture(db, { brandId: "lumen", name: "B", category: "apparel", inputs: [{ batchId: lot.id, massKg: 0.3 }] }), /Mass balance/);
});

test("suppliers cannot invent recycled content", () => {
  const db = seedDb();
  assert.throws(() => createBatch(db, { producerId: "pacific-polymers", material: "polyester", massKg: 10, recycledKg: 10 }), /recycler/);
});

test("custody rules: only the holder can ship, only consumers buy", () => {
  const db = seedDb();
  const hoodie = byName(db, "EcoCloud Hoodie");
  assert.throws(() => ship(db, { productId: hoodie.id, actorId: "lumen", toId: "bluewake", mode: "truck" }), /does not hold/);
  assert.throws(() => sell(db, { productId: hoodie.id, actorId: "greenloop", toId: "fixhub" }), /consumer/);
});

test("return + recycle mints credits and new recycled lots", () => {
  const db = seedDb();
  const tee = byName(db, "Orbit Tee");
  const before = balanceOf(db, "priya");
  returnForRecycling(db, { productId: tee.id, actorId: "priya", toId: "refibre" });
  assert.equal(balanceOf(db, "priya"), before + tee.depositCredits);
  const { outputs } = recycle(db, { productId: tee.id, actorId: "refibre" });
  assert.equal(outputs.length, 2);
  assert.ok(db.batches.find((b) => b.id === outputs[0].batchId)?.sourceProductIds.includes(tee.id));
  assert.ok(balanceOf(db, "refibre") > 0);
  assert.equal(verifyLedger(db).ok, true);
});

test("credits cannot be overspent", () => {
  const db = seedDb();
  assert.throws(() => redeem(db, { actorId: "priya", rewardId: "discount" }), /Not enough credits/);
});

test("only independent auditors can attest; brands only claim their own products", () => {
  const db = seedDb();
  const tee = byName(db, "Orbit Tee");
  assert.throws(() => issueClaim(db, { productId: tee.id, issuerId: "kestrel", kind: "ORIGIN", value: "DE", statement: "x" }), /brand/);
  const c = issueClaim(db, { productId: tee.id, issuerId: "lumen", kind: "REPAIRABILITY", value: 7, statement: "Repairable" });
  assert.throws(() => attestClaim(db, { claimId: c.id, auditorId: "lumen", verdict: "APPROVE", note: "self" }), /auditor/);
});

test("greenwash lint flags vague wording only", () => {
  assert.ok(lintClaim("100% eco-friendly and carbon neutral").length >= 2);
  assert.equal(lintClaim("40% recycled polyester by mass").length, 0);
});

test("merkle proofs verify against the root", () => {
  const leaves = ["a", "b", "c", "d", "e"].map((x) => x.repeat(64));
  const root = merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) assert.ok(verifyMerkleProof(leaves[i], merkleProof(leaves, i), root));
  assert.equal(verifyMerkleProof("f".repeat(64), merkleProof(leaves, 0), root), false);
});

test("passport export is self-describing", () => {
  const db = seedDb();
  const doc = exportPassport(db, byName(db, "Orbit Tee"), "http://localhost:3000");
  assert.ok(doc.credentialSubject.traceabilityEvents.every((e) => e.signerPublicKey && e.signature));
  assert.equal(doc.proof.ledgerIntegrity, true);
});
