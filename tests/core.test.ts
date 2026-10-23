import assert from "node:assert/strict";
import { test } from "node:test";
import { PROTOCOL_ID, newRequest, signRequest } from "../src/lib/auth.ts";
import { merkleProof, merkleRoot, randomPrivateKey, rootFromProof, verifyMerkleProof } from "../src/lib/crypto.ts";
import { restore, tamper } from "../src/lib/demo.ts";
import { applySigned } from "../src/lib/dispatch.ts";
import { balanceOf, carbonFootprint, custody, provenRecycledPct } from "../src/lib/domain.ts";
import { lintClaim } from "../src/lib/greenwash.ts";
import { generateKeystore } from "../src/lib/keys.ts";
import { hashEntry, prefixRoot, verifyLedger } from "../src/lib/ledger.ts";
import { exportPassport } from "../src/lib/passport.ts";
import { ACTOR_IDS, seedDb } from "../src/lib/seed.ts";
import type { Db } from "../src/lib/types.ts";
import { trustReport } from "../src/lib/verify.ts";

function world() {
  const keys = generateKeystore(ACTOR_IDS);
  const db = seedDb(keys);
  /** Submit an action exactly as the browser console does: signed with the actor's own key. */
  const act = (actorId: string, action: string, body: Record<string, unknown>, opts: { key?: string; issuedAt?: string } = {}) =>
    applySigned(db, keys[PROTOCOL_ID], action, signRequest(newRequest(action, actorId, body, opts.issuedAt), opts.key ?? keys[actorId]));
  return { keys, db, act };
}

const byName = (db: Db, name: string) => {
  const p = db.products.find((x) => x.name === name);
  assert.ok(p, `missing product ${name}`);
  return p;
};

// ---------- ledger integrity ----------

test("seeded ledger: hashes, sequencer signatures, actor signatures and bindings all verify", () => {
  const { db } = world();
  const r = verifyLedger(db);
  assert.equal(r.ok, true, JSON.stringify(r.issues.slice(0, 3)));
  assert.ok(db.ledger.length > 60);
  assert.equal(r.keys.size, ACTOR_IDS.length, "every actor key comes from an on-ledger registration");
});

test("seed is deterministic for a given keystore (stable Merkle root across restarts)", () => {
  const keys = generateKeystore(ACTOR_IDS);
  assert.equal(verifyLedger(seedDb(keys)).merkleRoot, verifyLedger(seedDb(keys)).merkleRoot);
});

test("seed timestamps only move forward", () => {
  const { db } = world();
  for (let i = 1; i < db.ledger.length; i++) assert.ok(db.ledger[i].timestamp >= db.ledger[i - 1].timestamp, `entry ${i} goes back in time`);
});

test("naive edit is caught by hash check, and restore fixes it", () => {
  const { db, keys } = world();
  const i = db.ledger.findIndex((e) => e.type === "SHIPPED");
  tamper(db, i, "edit", keys[PROTOCOL_ID]);
  const r = verifyLedger(db);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((x) => x.index === i && x.problem === "hash-mismatch"));
  restore(db);
  assert.equal(verifyLedger(db).ok, true);
});

test("insider rewrite with the sequencer key passes local checks but fails against the anchored root", () => {
  const { db, keys } = world();
  const anchored = { covers: db.ledger.length, merkleRoot: prefixRoot(db, db.ledger.length), label: "on-chain checkpoint" };
  const hoodie = byName(db, "EcoCloud Hoodie");
  const i = db.ledger.findIndex((e) => e.type === "SHIPPED" && e.subjectId === hoodie.id);
  tamper(db, i, "rewrite", keys[PROTOCOL_ID]);
  assert.equal(db.ledger[i].data.distanceKm, 1);
  assert.equal(verifyLedger(db).ok, true, "every hash, link and signature looks valid locally");
  const r = verifyLedger(db, [anchored]);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((x) => x.problem === "anchor-mismatch"));
});

test("insider cannot change what an actor signed: flipping an audit verdict is caught without the chain", () => {
  const { db, keys } = world();
  const i = db.ledger.findIndex((e) => e.type === "CLAIM_ATTESTED" && e.data.verdict === "REJECT");
  tamper(db, i, "rewrite", keys[PROTOCOL_ID]);
  const r = verifyLedger(db);
  assert.ok(r.issues.some((x) => x.index === i && x.problem === "auth-mismatch"), JSON.stringify(r.issues));
});

test("an entry re-signed with a different sequencer key is rejected", () => {
  const { db } = world();
  const e = db.ledger[10];
  e.data = { ...e.data, x: 1 };
  e.hash = hashEntry(e);
  e.signature = signRequest(newRequest("x", "x", {}), randomPrivateKey()).signature;
  assert.ok(verifyLedger(db).issues.some((x) => x.index === 10 && x.problem === "bad-sequencer-signature"));
});

test("tampering with a material lot flags every product made from it", () => {
  const { db, keys } = world();
  const battery = byName(db, "Strata 500 Wh E-bike Battery");
  const copperLot = battery.inputs[2].batchId;
  tamper(db, db.ledger.findIndex((e) => e.type === "BATCH_CREATED" && e.subjectId === copperLot), "edit", keys[PROTOCOL_ID]);
  assert.equal(trustReport(db, battery).integrity.ok, false);
  assert.equal(trustReport(db, byName(db, "Orbit Tee")).integrity.ok, true);
});

test("editing a passport record breaks its trust score", () => {
  const { db } = world();
  const tee = byName(db, "Orbit Tee");
  tee.inputs[0].massKg = 0.01;
  const t = trustReport(db, tee);
  assert.equal(t.integrity.passportTampered, true);
  assert.ok(t.score <= 10);
});

// ---------- authentication ----------

test("API rejects requests not signed by the actor's own key", () => {
  const { db, keys, act } = world();
  const hoodie = byName(db, "EcoCloud Hoodie");
  assert.throws(() => act("greenloop", "sell", { productId: hoodie.id, toId: "priya" }, { key: keys.priya }), /Invalid signature/);
  assert.throws(() => act("greenloop", "sell", { productId: hoodie.id, toId: "priya" }, { key: randomPrivateKey() }), /Invalid signature/);
  assert.throws(() => applySigned(db, keys[PROTOCOL_ID], "sell", undefined as never), /signed/);
});

test("API rejects impersonation, replay and stale requests", () => {
  const { db, keys, act } = world();
  const hoodie = byName(db, "EcoCloud Hoodie");
  assert.throws(() => act("priya", "sell", { productId: hoodie.id, actorId: "greenloop", toId: "priya" }), /acting as greenloop/);
  assert.throws(() => act("greenloop", "sell", { productId: hoodie.id, toId: "priya" }, { issuedAt: "2020-01-01T00:00:00Z" }), /expired/);
  const sr = signRequest(newRequest("sell", "greenloop", { productId: hoodie.id, toId: "priya" }), keys.greenloop);
  applySigned(db, keys[PROTOCOL_ID], "sell", sr);
  assert.throws(() => applySigned(db, keys[PROTOCOL_ID], "sell", sr), /Replay/);
  assert.equal(verifyLedger(db).ok, true);
});

// ---------- protocol rules ----------

test("honest product earns an A, greenwashed product is caught", () => {
  const { db } = world();
  const tee = trustReport(db, byName(db, "Orbit Tee"));
  assert.equal(tee.grade, "A");
  assert.ok(tee.claims.every((c) => c.status === "VERIFIED"));
  assert.ok(tee.claims.find((c) => c.claim.kind === "CARBON_FOOTPRINT")?.caveats.length, "unattested factory data is flagged");

  const hoodie = trustReport(db, byName(db, "EcoCloud Hoodie"));
  assert.ok(["D", "E"].includes(hoodie.grade));
  const recycled = hoodie.claims.find((c) => c.claim.kind === "RECYCLED_CONTENT");
  assert.equal(recycled?.status, "CONTRADICTED");
  assert.ok(recycled?.lint.some((l) => l.severity === "high"));
  assert.equal(hoodie.claims.find((c) => c.claim.kind === "ETHICAL_LABOR")?.status, "CONTRADICTED");
});

test("closed loop: recovered material carries into the next product", () => {
  const { db } = world();
  const loop = byName(db, "Strata 500 Wh Loop Edition");
  assert.ok(provenRecycledPct(db, loop) > 90);
  const t = trustReport(db, loop);
  assert.equal(t.grade, "A");
  assert.ok(t.claims.every((c) => c.status === "VERIFIED"));
  assert.equal(custody(db, byName(db, "Strata 500 Wh E-bike Battery").id).stage, "recycled");
  assert.ok(carbonFootprint(db, loop).total < carbonFootprint(db, byName(db, "Strata 500 Wh E-bike Battery")).total * 0.4);
});

test("a misdeclared transport mode is exposed by the recipient's signed arrival time", () => {
  const { db } = world();
  const hoodie = carbonFootprint(db, byName(db, "EcoCloud Hoodie"));
  const leg = hoodie.legs[0];
  assert.equal(leg.declaredMode, "ship");
  assert.equal(leg.check, "contradicted");
  assert.equal(leg.mode, "air", "counted as the lowest-emission mode that could make the trip");
  const claim = trustReport(db, byName(db, "EcoCloud Hoodie")).claims.find((c) => c.claim.kind === "CARBON_FOOTPRINT");
  assert.ok(claim?.reasons.some((r) => r.includes("Declared ship")));
  // Honest legs pass, and a leg still in transit is pending rather than trusted.
  assert.ok(carbonFootprint(db, byName(db, "Orbit Tee")).legs.every((l) => l.check === "consistent"));
  assert.equal(carbonFootprint(db, byName(db, "Strata 500 Wh Loop Edition")).legs[0].check, "pending");
});

test("a brand that lies about the mode is caught live through the API", () => {
  const { db, act } = world();
  const lot = act("kutch-coop", "create-batch", { material: "organic-cotton", massKg: 5 }) as { id: string };
  const p = act("lumen", "manufacture", { name: "Fast Tee", category: "apparel", inputs: [{ batchId: lot.id, massKg: 0.2 }] }) as { id: string };
  act("lumen", "ship", { productId: p.id, toId: "greenloop", mode: "ship" }); // Dhaka -> Singapore "by sea"
  act("greenloop", "receive", { productId: p.id }); // signed minutes later
  const legs = carbonFootprint(db, db.products.find((x) => x.id === p.id)!).legs;
  assert.equal(legs[0].check, "contradicted");
  assert.equal(legs[0].mode, "air");
});

test("mass balance prevents overselling a material lot", () => {
  const { act } = world();
  const lot = act("kutch-coop", "create-batch", { material: "organic-cotton", massKg: 1 }) as { id: string };
  act("lumen", "manufacture", { name: "A", category: "apparel", inputs: [{ batchId: lot.id, massKg: 0.8 }] });
  assert.throws(() => act("lumen", "manufacture", { name: "B", category: "apparel", inputs: [{ batchId: lot.id, massKg: 0.3 }] }), /Mass balance/);
  assert.throws(() => act("lumen", "manufacture", { name: "C", category: "apparel", inputs: [{ batchId: lot.id, massKg: 0.15 }, { batchId: lot.id, massKg: 0.15 }] }), /Mass balance/);
});

test("suppliers cannot invent recycled content", () => {
  const { act } = world();
  assert.throws(() => act("pacific-polymers", "create-batch", { material: "polyester", massKg: 10, recycledKg: 10 }), /recycler/);
});

test("custody rules: only the holder can ship, only consumers buy", () => {
  const { db, act } = world();
  const hoodie = byName(db, "EcoCloud Hoodie");
  assert.throws(() => act("lumen", "ship", { productId: hoodie.id, toId: "bluewake", mode: "truck" }), /does not hold/);
  assert.throws(() => act("greenloop", "sell", { productId: hoodie.id, toId: "fixhub" }), /consumer/);
});

test("return + recycle via signed requests mints credits and new recycled lots", () => {
  const { db, act } = world();
  const tee = byName(db, "Orbit Tee");
  const before = balanceOf(db, "priya");
  act("priya", "return", { productId: tee.id, toId: "refibre" });
  assert.equal(balanceOf(db, "priya"), before + tee.depositCredits);
  const { outputs } = act("refibre", "recycle", { productId: tee.id }) as { outputs: { batchId: string }[] };
  assert.equal(outputs.length, 2);
  assert.ok(db.batches.find((b) => b.id === outputs[0].batchId)?.sourceProductIds.includes(tee.id));
  assert.ok(balanceOf(db, "refibre") > 0);
  act("priya", "redeem", { rewardId: "tree" });
  assert.equal(verifyLedger(db).ok, true, JSON.stringify(verifyLedger(db).issues));
});

test("credits cannot be overspent", () => {
  const { act } = world();
  assert.throws(() => act("priya", "redeem", { rewardId: "discount" }), /Not enough credits/);
});

test("only independent auditors can attest; brands only claim their own products", () => {
  const { db, act } = world();
  const tee = byName(db, "Orbit Tee");
  assert.throws(() => act("kestrel", "issue-claim", { productId: tee.id, kind: "ORIGIN", value: "DE", statement: "x" }), /brand/);
  const c = act("lumen", "issue-claim", { productId: tee.id, kind: "REPAIRABILITY", value: 7, statement: "Repairable" }) as { id: string };
  assert.throws(() => act("lumen", "attest", { claimId: c.id, verdict: "APPROVE", note: "self" }), /auditor/);
});

test("greenwash lint flags vague wording only", () => {
  assert.ok(lintClaim("100% eco-friendly and carbon neutral").length >= 2);
  assert.equal(lintClaim("40% recycled polyester by mass").length, 0);
});

// ---------- proofs ----------

test("merkle proofs verify against the root", () => {
  const leaves = ["a", "b", "c", "d", "e"].map((x) => x.repeat(64));
  const root = merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) assert.ok(verifyMerkleProof(leaves[i], merkleProof(leaves, i), root));
  assert.equal(verifyMerkleProof("f".repeat(64), merkleProof(leaves, 0), root), false);
});

test("passport events and actor registrations prove inclusion in the anchored root", () => {
  const { db } = world();
  const root = prefixRoot(db, db.ledger.length);
  db.checkpoints.push({ covers: db.ledger.length, merkleRoot: root, at: "", onChain: true, network: "test", chainId: 31337, contract: "0x0", checkpointId: 0 });
  const doc = exportPassport(db, byName(db, "Orbit Tee"), "http://localhost:3000");
  const all = [...doc.credentialSubject.traceabilityEvents, ...doc.credentialSubject.actorRegistrations];
  assert.ok(all.length > 10);
  for (const e of all) assert.equal(rootFromProof(e.hash, e.merkleProof!), root);
  assert.equal(doc.proof.anchor?.merkleRoot, root);
});
