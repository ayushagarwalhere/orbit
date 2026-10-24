import assert from "node:assert/strict";
import { installNativeCrypto } from "../src/lib/crypto-node.ts";
import { test } from "node:test";
import { PROTOCOL_ID, newRequest, signRequest } from "../src/lib/auth.ts";
import { publicKeyOf, randomPrivateKey, setEd25519Backend, signHash, verifySignature } from "../src/lib/crypto.ts";
import { verifyPassport } from "../src/lib/passport-verify.ts";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { restore, tamper } from "../src/lib/demo.ts";
import { applySigned } from "../src/lib/dispatch.ts";
import { balanceOf, balances, carbonFootprint, custody, provenRecycledPct } from "../src/lib/domain.ts";
import { lintClaim } from "../src/lib/greenwash.ts";
import { generateKeystore } from "../src/lib/keys.ts";
import { append, hashEntry, ledgerTree, prefixRoot, verifyLedger } from "../src/lib/ledger.ts";
import { replay } from "../src/lib/replay.ts";
import { exportPassport } from "../src/lib/passport.ts";
import { ACTOR_IDS, seedDb } from "../src/lib/seed.ts";
import type { Db } from "../src/lib/types.ts";
import { trustReport } from "../src/lib/verify.ts";

function world() {
  const keys = generateKeystore(ACTOR_IDS);
  const db = seedDb(keys, randomPrivateKey());
  /** Submit an action exactly as the browser console does: signed with the actor's own key. */
  const act = (actorId: string, action: string, body: Record<string, unknown>, opts: { key?: string; issuedAt?: string } = {}) =>
    applySigned(db, keys[PROTOCOL_ID], action, signRequest(newRequest(action, actorId, body, db.ledgerId!, opts.issuedAt), opts.key ?? keys[actorId]));
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

test("incremental verification agrees with a full re-verification", () => {
  const { db, act } = world();
  verifyLedger(db); // warm the incremental cache
  for (let i = 0; i < 5; i++) act("kutch-coop", "create-batch", { material: "organic-cotton", massKg: 10 + i });
  const incremental = verifyLedger(db);
  const full = verifyLedger(JSON.parse(JSON.stringify(db))); // fresh object: no cache
  assert.equal(incremental.ok, true);
  assert.equal(incremental.merkleRoot, full.merkleRoot);
  assert.equal(incremental.checked, full.checked);
});

test("seed is deterministic for a given keystore (stable Merkle root across restarts)", () => {
  const keys = generateKeystore(ACTOR_IDS);
  assert.equal(verifyLedger(seedDb(keys, "ab".repeat(32))).merkleRoot, verifyLedger(seedDb(keys, "ab".repeat(32))).merkleRoot);
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

test("operator rewriting derived data (and re-signing) is caught by replaying the signed instructions", () => {
  const { db, keys } = world();
  const hoodie = byName(db, "EcoCloud Hoodie");
  const i = db.ledger.findIndex((e) => e.type === "SHIPPED" && e.subjectId === hoodie.id);
  tamper(db, i, "rewrite", keys[PROTOCOL_ID]);
  assert.equal(db.ledger[i].data.distanceKm, 1);
  const r = verifyLedger(db);
  assert.ok(!r.issues.some((x) => x.problem === "hash-mismatch" || x.problem === "bad-sequencer-signature"), "signatures all pass");
  const m = r.issues.find((x) => x.problem === "derived-mismatch");
  assert.ok(m && m.index === i && m.detail.includes("distanceKm"), JSON.stringify(r.issues));
});

test("operator erasing a whole signed instruction passes every local check but fails against the anchored root", () => {
  const { db, keys } = world();
  const anchored = { covers: db.ledger.length, merkleRoot: prefixRoot(db, db.ledger.length), label: "on-chain checkpoint" };
  const i = db.ledger.findIndex((e) => e.type === "CLAIM_ATTESTED" && e.data.verdict === "REJECT");
  const before = db.ledger.length;
  tamper(db, i, "erase", keys[PROTOCOL_ID]);
  assert.equal(db.ledger.length, before - 1);
  assert.equal(verifyLedger(db).ok, true, JSON.stringify(verifyLedger(db).issues.slice(0, 2)));
  const r = verifyLedger(db, [anchored]);
  assert.ok(r.issues.some((x) => x.problem === "anchor-mismatch"));
  restore(db);
  assert.equal(verifyLedger(db, [anchored]).ok, true);
});

test("operator cannot mint credits from nothing", () => {
  const { db, keys } = world();
  // A credit entry with no instruction behind it.
  append({ db, sequencerKey: keys[PROTOCOL_ID] }, { type: "CREDIT_MINTED", subjectId: "priya", actorId: PROTOCOL_ID, data: { to: "priya", amount: 1_000_000, reason: "gift", productId: "DPP-0001", ref: "x" } });
  assert.ok(verifyLedger(db).issues.some((x) => x.problem === "unauthorised-entry"));
  // Or one smuggled into a real instruction's run of entries.
  const { db: db2, keys: k2 } = world();
  const ret = db2.ledger.findIndex((e) => e.type === "RETURNED");
  const fake = { ...db2.ledger[ret + 1], data: { ...db2.ledger[ret + 1].data, amount: 999 } };
  db2.ledger.splice(ret + 1, 1, fake);
  for (let i = ret + 1; i < db2.ledger.length; i++) {
    const e = db2.ledger[i];
    e.prevHash = db2.ledger[i - 1].hash;
    e.hash = hashEntry(e);
    e.signature = signHash(e.hash, k2[PROTOCOL_ID]);
  }
  const m = verifyLedger(db2).issues.find((x) => x.problem === "derived-mismatch");
  assert.ok(m && m.detail.includes("amount"), JSON.stringify(verifyLedger(db2).issues.slice(0, 2)));
});

test("all state is rebuilt from the ledger alone by replay, identical to the live state", () => {
  const { db, act } = world();
  act("priya", "return", { productId: byName(db, "Orbit Tee").id, toId: "refibre" });
  const r = replay(db.ledger);
  assert.equal(r.issues.length, 0, JSON.stringify(r.issues.slice(0, 2)));
  assert.deepEqual(r.db.products, db.products);
  assert.deepEqual(r.db.batches, db.batches);
  assert.deepEqual(r.db.claims, db.claims);
  assert.deepEqual(r.db.actors, db.actors);
  assert.deepEqual([...balances(r.db)], [...balances(db)]);
});

test("sequencer time must match the time the actor signed", () => {
  const { db, keys } = world();
  const i = db.ledger.findIndex((e) => e.type === "SOLD");
  db.ledger[i].timestamp = "2026-12-31T00:00:00.000Z";
  for (let j = i; j < db.ledger.length; j++) {
    const e = db.ledger[j];
    e.prevHash = db.ledger[j - 1].hash;
    e.hash = hashEntry(e);
    e.signature = signHash(e.hash, keys[PROTOCOL_ID]);
  }
  assert.ok(verifyLedger(db).issues.some((x) => x.index === i && x.problem === "timestamp-skew"));
});

test("insider cannot change what an actor signed: flipping an audit verdict is caught without the chain", () => {
  const { db, keys } = world();
  const i = db.ledger.findIndex((e) => e.type === "CLAIM_ATTESTED" && e.data.verdict === "REJECT");
  tamper(db, i, "rewrite", keys[PROTOCOL_ID]);
  const r = verifyLedger(db);
  assert.ok(r.issues.some((x) => x.index === i && (x.problem === "auth-mismatch" || x.problem === "derived-mismatch")), JSON.stringify(r.issues));
});

test("an entry re-signed with a different sequencer key is rejected", () => {
  const { db } = world();
  const e = db.ledger[10];
  e.data = { ...e.data, x: 1 };
  e.hash = hashEntry(e);
  e.signature = signRequest(newRequest("x", "x", {}, "x"), randomPrivateKey()).signature;
  assert.ok(verifyLedger(db).issues.some((x) => x.index === 10 && x.problem === "bad-sequencer-signature"));
});

test("a demo simulation expires on its own, and a new one replaces an active one", async () => {
  const { tamperExpired, TAMPER_TTL_MS } = await import("../src/lib/demo.ts");
  const { db, keys } = world();
  const i = db.ledger.findIndex((e) => e.type === "SHIPPED");
  tamper(db, i, "edit", keys[PROTOCOL_ID], 1_000);
  assert.equal(tamperExpired(db, 1_000 + TAMPER_TTL_MS - 1), false);
  assert.equal(tamperExpired(db, 1_000 + TAMPER_TTL_MS + 1), true);
  tamper(db, i + 1, "rewrite", keys[PROTOCOL_ID], 2_000); // replaces, no error
  assert.equal(db.tamper?.index, i + 1);
  restore(db);
  assert.equal(verifyLedger(db).ok, true);
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

test("API validates every input strictly, so no request can poison the ledger", () => {
  const { db, act } = world();
  const n = db.ledger.length;
  assert.throws(() => act("refibre", "create-batch", { material: "polyester", massKg: 5, recycledKg: "x" }), /number/);
  assert.throws(() => act("kutch-coop", "create-batch", { material: "plutonium", massKg: 5 }), /material/);
  assert.throws(() => act("kutch-coop", "create-batch", { material: "organic-cotton", massKg: -1 }), /between/);
  assert.throws(() => act("lumen", "manufacture", { name: "X", category: "apparel", inputs: [{ batchId: "LOT-0001", massKg: 0.1 }], depositCredits: "NaN" }), /number/);
  assert.throws(() => act("fixhub", "repair", { productId: "DPP-0001", note: "x", co2eKg: -5 }), /between/);
  assert.throws(() => act("lumen", "issue-claim", { productId: "DPP-0001", kind: "RECYCLED_CONTENT", value: 140, statement: "x" }), /between/);
  assert.equal(db.ledger.length, n, "nothing was written");
  assert.equal(verifyLedger(db).ok, true);
});

test("API rejects unknown fields and odd self-registration ids instead of storing them", () => {
  const { db, keys, act } = world();
  const n = db.ledger.length;
  assert.throws(() => act("kutch-coop", "create-batch", { material: "organic-cotton", massKg: 1, junk: "x".repeat(5000) }), /Unknown body field/);
  const sr = signRequest(newRequest("create-batch", "kutch-coop", { material: "organic-cotton", massKg: 1 }, db.ledgerId!), keys["kutch-coop"]);
  assert.throws(() => applySigned(db, keys[PROTOCOL_ID], "create-batch", { ...sr, extra: 1 } as never), /Unknown envelope field/);
  const k = randomPrivateKey();
  const body = { actorId: "lumen-official", name: "Totally Lumen", role: "consumer", publicKey: publicKeyOf(k), place: { city: "Singapore", country: "SG", lat: 1.3, lng: 103.8 } };
  assert.throws(() => applySigned(db, keys[PROTOCOL_ID], "register-actor", signRequest(newRequest("register-actor", "lumen-official", body, db.ledgerId!), k)), /guest-/);
  assert.equal(db.ledger.length, n, "nothing was written");
});

test("repair credits: at most once per product every 30 days, and replay agrees", () => {
  const { db, keys } = world();
  const tee = byName(db, "Orbit Tee");
  const repairAt = (ms: number) => applySigned(db, keys[PROTOCOL_ID], "repair", signRequest(newRequest("repair", "fixhub", { productId: tee.id, note: "Stitched seam" }, db.ledgerId!, new Date(ms).toISOString()), keys.fixhub), ms);
  const credits = () => db.ledger.filter((e) => e.type === "CREDIT_MINTED" && e.data.reason === "repair-instead-of-replace" && e.data.productId === tee.id).length;
  const t0 = Date.now();
  repairAt(t0);
  repairAt(t0 + 60_000);
  assert.equal(credits(), 1, "a second repair the same day earns nothing");
  repairAt(t0 + 31 * 24 * 3600 * 1000);
  assert.equal(credits(), 2);
  assert.equal(verifyLedger(db).ok, true, "replay reaches the same decisions from the ledger timestamps");
});

test("a recycler cannot sign for more material than went in", () => {
  const { db, act } = world();
  const tee = byName(db, "Orbit Tee");
  act("priya", "return", { productId: tee.id, toId: "refibre" });
  assert.throws(() => act("refibre", "recycle", { productId: tee.id, recovered: { polyester: 5 } }), /only/);
  assert.throws(() => act("refibre", "recycle", { productId: tee.id, recovered: { copper: 0.1 } }), /contains no/);
  act("refibre", "recycle", { productId: tee.id, recovered: { polyester: 0.08, "organic-cotton": 0.1 } });
  assert.equal(verifyLedger(db).ok, true);
});

test("a signed instruction cannot be replayed into another ledger (e.g. after a reset)", () => {
  const a = world();
  const b = world();
  const sr = signRequest(newRequest("create-batch", "kutch-coop", { material: "organic-cotton", massKg: 1 }, a.db.ledgerId!), a.keys["kutch-coop"]);
  assert.throws(() => applySigned(b.db, b.keys[PROTOCOL_ID], "create-batch", sr), /different ledger/);
});

test("a guest consumer can self-register with a key that never leaves their browser, and only as a consumer", () => {
  const { db, keys } = world();
  const k = randomPrivateKey();
  const body = { actorId: "guest-1", name: "Judge", role: "consumer", publicKey: publicKeyOf(k), place: { city: "Singapore", country: "SG", lat: 1.29, lng: 103.85 } };
  applySigned(db, keys[PROTOCOL_ID], "register-actor", signRequest(newRequest("register-actor", "guest-1", body, db.ledgerId!), k));
  assert.ok(db.actors.some((a) => a.id === "guest-1"));
  const k2 = randomPrivateKey();
  assert.throws(() => applySigned(db, keys[PROTOCOL_ID], "register-actor", signRequest(newRequest("register-actor", "guest-2", { ...body, actorId: "guest-2", role: "auditor", publicKey: publicKeyOf(k2) }, db.ledgerId!), k2)), /consumers/);
  assert.throws(() => applySigned(db, keys[PROTOCOL_ID], "register-actor", signRequest(newRequest("register-actor", "guest-3", { ...body, actorId: "guest-3", publicKey: publicKeyOf(k2) }, db.ledgerId!), k)), /signature/);
  assert.equal(verifyLedger(db).ok, true);
});

test("API rejects impersonation, replay and stale requests", () => {
  const { db, keys, act } = world();
  const hoodie = byName(db, "EcoCloud Hoodie");
  assert.throws(() => act("priya", "sell", { productId: hoodie.id, actorId: "greenloop", toId: "priya" }), /acting as greenloop/);
  assert.throws(() => act("greenloop", "sell", { productId: hoodie.id, toId: "priya" }, { issuedAt: "2020-01-01T00:00:00Z" }), /expired/);
  const sr = signRequest(newRequest("sell", "greenloop", { productId: hoodie.id, toId: "priya" }, db.ledgerId!), keys.greenloop);
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

test("in-app impact model reproduces the written assessment (docs/IMPACT.md §4)", async () => {
  const { project, DEFAULT_INPUTS } = await import("../src/lib/impact.ts");
  const moderate = project(DEFAULT_INPUTS);
  // Central case: 5% repair uptake, total = s x 1.69 Mt.
  assert.ok(Math.abs(moderate.totalMt - 0.0845) < 0.001, `moderate total ${moderate.totalMt}`);
  assert.ok(Math.abs(project({ ...DEFAULT_INPUTS, adoption: 0.01 }).totalMt - 0.0169) < 0.001);
  assert.ok(Math.abs(project({ ...DEFAULT_INPUTS, adoption: 0.15 }).totalMt - 0.253) < 0.005);
  assert.ok(Math.abs(moderate.cumulativeMt - 0.211) < 0.005);
  // 10% repair uptake (the pilot target) reproduces the sensitivity row: s x 2.49 Mt.
  assert.ok(Math.abs(project({ ...DEFAULT_INPUTS, repairUptake: 0.1 }).totalMt - 0.124) < 0.001);
});

test("greenwash lint flags vague wording only", () => {
  assert.ok(lintClaim("100% eco-friendly and carbon neutral").length >= 2);
  assert.equal(lintClaim("40% recycled polyester by mass").length, 0);
});

// ---------- proofs ----------

test("native (server) and pure-JS (browser) Ed25519 + SHA-256 agree byte for byte", () => {
  const k = randomPrivateKey();
  const h = "ab".repeat(32);
  const nativeSig = signHash(h, k);
  const jsSig = bytesToHex(ed25519.sign(hexToBytes(h), hexToBytes(k)));
  assert.equal(nativeSig, jsSig, "deterministic RFC 8032 signatures");
  assert.ok(ed25519.verify(hexToBytes(nativeSig), hexToBytes(h), hexToBytes(publicKeyOf(k)), { zip215: false }));
  assert.ok(verifySignature(h, jsSig, publicKeyOf(k)));
  assert.equal(verifySignature(h, jsSig.replace(/^../, "00"), publicKeyOf(k)), false);
  // The same ledger verifies identically under both backends.
  const { db } = world();
  const nativeRoot = verifyLedger(db).merkleRoot;
  setEd25519Backend({
    sign: (x, key) => bytesToHex(ed25519.sign(hexToBytes(x), hexToBytes(key))),
    verify: (x, s, p) => ed25519.verify(hexToBytes(s), hexToBytes(x), hexToBytes(p), { zip215: false }),
    sha256: (d) => sha256(d),
  });
  try {
    const js = verifyLedger(JSON.parse(JSON.stringify(db)));
    assert.equal(js.ok, true);
    assert.equal(js.merkleRoot, nativeRoot);
  } finally {
    installNativeCrypto();
  }
});

test("every trust score comes with a breakdown that adds up to it", () => {
  const { db } = world();
  for (const p of db.products) {
    const t = trustReport(db, p);
    const sum = t.breakdown.reduce((s, b) => s + b.points, 0);
    assert.ok(Math.abs(sum - t.score) <= 0.5, `${p.name}: ${sum} vs ${t.score}`);
  }
  const hoodie = trustReport(db, byName(db, "EcoCloud Hoodie"));
  assert.ok(hoodie.breakdown.some((b) => b.label.includes("contradicted") && b.points < 0));
});

// ---------- trustless passport verification (as run in the browser) ----------

const OPERATOR = "0x00000000000000000000000000000000000000aa";
const WITNESS = "0x00000000000000000000000000000000000000bb";
const TRUSTED = { contract: "0xcontract", operator: OPERATOR, witnesses: [{ address: WITNESS, name: "Test witness" }] };
type Cp = { id: number; ledgerId: string; merkleRoot: string; ledgerLength: number; timestamp: number; submitter: string };

/** A fake chain holding whatever checkpoints a test anchors; the "server" serves db.ledger. */
function fakeChain(db: Db) {
  const cps: Cp[] = [];
  const anchorAs = (submitter: string, covers = db.ledger.length, root = prefixRoot(db, covers), ledgerId = db.ledgerId!) => {
    const id = cps.length;
    cps.push({ id, ledgerId, merkleRoot: root, ledgerLength: covers, timestamp: 0, submitter });
    return id;
  };
  const reader = {
    checkpoint: async (id: number) => cps[id],
    ledgerCheckpoints: async (lid: string) => ({ operator: OPERATOR, checkpoints: cps.filter((c) => c.ledgerId === lid) }),
    ledger: async () => db.ledger,
  };
  return { cps, anchorAs, reader };
}
function anchoredPassport(db: Db, name: string, id: number, covers: number) {
  db.checkpoints.push({ covers, merkleRoot: prefixRoot(db, covers), at: "", onChain: true, network: "test", chainId: 999, contract: "0xcontract", checkpointId: id, ledgerId: db.ledgerId });
  return exportPassport(db, byName(db, name), "http://localhost");
}
const failed = (checks: { ok: boolean | "warn"; label: string; detail: string }[]) => checks.filter((c) => c.ok === false);
const verify = (doc: unknown, reader: ReturnType<typeof fakeChain>["reader"]) => verifyPassport(doc, { trusted: TRUSTED, chainId: 999, chain: reader });

test("browser verifier: an honest, witnessed passport passes every check, verdicts and grade re-derived", async () => {
  const { db } = world();
  const chain = fakeChain(db);
  chain.anchorAs(OPERATOR, 40);
  chain.anchorAs(WITNESS, 55);
  const id = chain.anchorAs(OPERATOR);
  const checks = await verify(anchoredPassport(db, "EcoCloud Hoodie", id, db.ledger.length), chain.reader);
  assert.deepEqual(failed(checks), []);
  assert.ok(!checks.some((c) => c.ok === "warn"), JSON.stringify(checks.filter((c) => c.ok === "warn")));
  assert.ok(checks.some((c) => c.label.startsWith("Verdict") && c.detail.includes("CONTRADICTED")));
  assert.ok(checks.find((c) => c.label === "Trust grade")?.detail.includes("E"));
});

test("browser verifier: an unanchored passport is never shown as verified", async () => {
  const { db } = world();
  const doc = exportPassport(db, byName(db, "Orbit Tee"), "http://localhost");
  const checks = await verifyPassport(doc, { trusted: TRUSTED, chainId: 999, chain: fakeChain(db).reader });
  assert.ok(failed(checks).length > 0);
});

test("browser verifier: a checkpoint submitted by anyone but Orbit's operator is rejected", async () => {
  const { db } = world();
  const chain = fakeChain(db);
  const id = chain.anchorAs("0x00000000000000000000000000000000000000ff");
  const checks = await verify(anchoredPassport(db, "Orbit Tee", id, db.ledger.length), chain.reader);
  assert.ok(failed(checks).some((c) => c.label === "On-chain checkpoint"));
});

test("browser verifier: a forged audit in the passport is caught (review B1)", async () => {
  const { db, keys } = world();
  const chain = fakeChain(db);
  chain.anchorAs(WITNESS);
  const id = chain.anchorAs(OPERATOR);
  const doc = anchoredPassport(db, "EcoCloud Hoodie", id, db.ledger.length);
  // Swap the REJECT audit for a forged APPROVE signed with a made-up auditor key.
  const ev = doc.credentialSubject.traceabilityEvents;
  const k = ev.findIndex((e) => e.type === "CLAIM_ATTESTED" && e.data.verdict === "REJECT");
  ev[k] = { ...ev[k], data: { ...ev[k].data, verdict: "APPROVE" }, signature: signHash(ev[k].hash, randomPrivateKey()) };
  void keys;
  const checks = await verify(doc, chain.reader);
  assert.ok(failed(checks).some((c) => c.label === "Passport complete and genuine"), JSON.stringify(failed(checks)));
});

test("browser verifier: a passport that leaves out an inconvenient event is caught (review B2)", async () => {
  const { db } = world();
  const chain = fakeChain(db);
  chain.anchorAs(WITNESS);
  const id = chain.anchorAs(OPERATOR);
  const doc = anchoredPassport(db, "EcoCloud Hoodie", id, db.ledger.length);
  doc.credentialSubject.traceabilityEvents = doc.credentialSubject.traceabilityEvents.filter((e) => !(e.type === "CLAIM_ATTESTED" && e.data.verdict === "REJECT"));
  const checks = await verify(doc, chain.reader);
  assert.ok(failed(checks).some((c) => c.label === "Passport complete and genuine" && c.detail.includes("leaves out")));
});

test("browser verifier: history rewritten and re-anchored fails against the witness's checkpoint", async () => {
  const { db, keys } = world();
  const chain = fakeChain(db);
  chain.anchorAs(WITNESS); // a witness saw the genuine history
  const i = db.ledger.findIndex((e) => e.type === "CLAIM_ATTESTED" && e.data.verdict === "REJECT");
  tamper(db, i, "erase", keys[PROTOCOL_ID]);
  act2(db, keys);
  const id = chain.anchorAs(OPERATOR);
  const checks = await verify(anchoredPassport(db, "EcoCloud Hoodie", id, db.ledger.length), chain.reader);
  assert.ok(failed(checks).some((c) => c.label === "Append-only history"), JSON.stringify(failed(checks)));
});

test("browser verifier: rebuilding history under a new ledger id is caught or flagged (review B3)", async () => {
  // (a) Reusing the actors' original signed instructions under a new genesis: they name the old ledger.
  const { db, keys } = world();
  const rebuilt = seedDb(keys, randomPrivateKey());
  const hopped = { ...rebuilt, ledger: rebuilt.ledger.map((e, i) => (i === 0 ? e : { ...e, auth: db.ledger[i]?.auth ?? e.auth })) } as Db;
  const ca = fakeChain(hopped);
  const ida = ca.anchorAs(OPERATOR);
  const a = await verify(anchoredPassport(hopped, "EcoCloud Hoodie", ida, hopped.ledger.length), ca.reader);
  assert.ok(failed(a).length > 0);
  // (b) Even fully re-signed (only possible with the actors' keys), a ledger no witness has seen is flagged.
  const cb = fakeChain(rebuilt);
  const idb = cb.anchorAs(OPERATOR);
  const b = await verify(anchoredPassport(rebuilt, "EcoCloud Hoodie", idb, rebuilt.ledger.length), cb.reader);
  assert.equal(b.find((c) => c.label === "Witnessed")?.ok, "warn");
});

test("browser verifier: junk anchors from unidentified wallets are ignored, not fatal", async () => {
  const { db } = world();
  const chain = fakeChain(db);
  chain.anchorAs("0x00000000000000000000000000000000000000ee", db.ledger.length, "00".repeat(32));
  chain.anchorAs(WITNESS);
  const id = chain.anchorAs(OPERATOR);
  const checks = await verify(anchoredPassport(db, "Orbit Tee", id, db.ledger.length), chain.reader);
  assert.deepEqual(failed(checks), []);
  assert.ok(checks.find((c) => c.label === "Append-only history")?.detail.includes("1 by unidentified submitters ignored"));
});

test("browser verifier: an edited verdict or grade is caught by re-derivation", async () => {
  const { db } = world();
  const chain = fakeChain(db);
  chain.anchorAs(WITNESS);
  const id = chain.anchorAs(OPERATOR);
  const doc = anchoredPassport(db, "EcoCloud Hoodie", id, db.ledger.length);
  const c = doc.credentialSubject.conformityClaims.find((x) => x.status === "CONTRADICTED")!;
  (c as { status: string }).status = "VERIFIED";
  (doc.credentialSubject.trust as { grade: string }).grade = "A";
  const checks = await verify(doc, chain.reader);
  assert.ok(failed(checks).some((x) => x.label.startsWith(`Verdict ${c.id}`)));
  assert.ok(failed(checks).some((x) => x.label === "Trust grade"));
});

test("browser verifier: a node serving a rewritten or truncated ledger is caught", async () => {
  const { db } = world();
  const chain = fakeChain(db);
  const id = chain.anchorAs(OPERATOR);
  const doc = anchoredPassport(db, "Orbit Tee", id, db.ledger.length);
  const short = { ...chain.reader, ledger: async () => db.ledger.slice(0, 20) };
  assert.ok(failed(await verify(doc, short)).some((c) => c.label === "Ledger authenticated"));
  // A node that rewrites an entry and recomputes its hash still can't match the on-chain root.
  const rewritten = db.ledger.map((e) => ({ ...e }));
  const k = rewritten.findIndex((e) => e.type === "CLAIM_ATTESTED" && e.data.verdict === "REJECT");
  rewritten[k] = { ...rewritten[k], data: { ...rewritten[k].data, verdict: "APPROVE" } };
  rewritten[k].hash = hashEntry(rewritten[k]);
  const forgedNode = { ...chain.reader, ledger: async () => rewritten };
  assert.ok(failed(await verify(doc, forgedNode)).some((c) => c.label === "Ledger authenticated"));
});

test("browser verifier: keys swapped into the passport's registrations change nothing (review B1)", async () => {
  const { db } = world();
  const chain = fakeChain(db);
  chain.anchorAs(WITNESS);
  const id = chain.anchorAs(OPERATOR);
  const doc = JSON.parse(JSON.stringify(anchoredPassport(db, "EcoCloud Hoodie", id, db.ledger.length))) as { credentialSubject: { actorRegistrations: { data: { publicKey: string } }[] } };
  assert.ok(doc.credentialSubject.actorRegistrations.length > 0);
  for (const r of doc.credentialSubject.actorRegistrations) r.data.publicKey = publicKeyOf(randomPrivateKey());
  const checks = await verify(doc, chain.reader);
  // Keys come only from the authenticated ledger, so verdicts are unchanged; edited events are flagged.
  assert.ok(checks.some((c) => c.label.startsWith("Verdict") && c.detail.includes("CONTRADICTED")));
  assert.ok(failed(checks).some((c) => c.label === "Passport complete and genuine"));
});

test("entry times must move forward, and can't be later than the anchoring block", async () => {
  const { db } = world();
  const bad = JSON.parse(JSON.stringify(db)) as Db;
  bad.ledger[10].timestamp = "2020-01-01T00:00:00.000Z";
  assert.ok(verifyLedger(bad).issues.some((i) => i.problem === "timestamp-order"));
  const chain = fakeChain(db);
  const id = chain.anchorAs(OPERATOR);
  chain.cps[id].timestamp = Math.floor(Date.parse(db.ledger[5].timestamp) / 1000); // block mined before the last entry's date
  const checks = await verify(anchoredPassport(db, "Orbit Tee", id, db.ledger.length), chain.reader);
  assert.ok(failed(checks).some((c) => c.label === "Single ledger" && c.detail.includes("after the block")));
});

function act2(db: Db, keys: Record<string, string>) {
  applySigned(db, keys[PROTOCOL_ID], "create-batch", signRequest(newRequest("create-batch", "kutch-coop", { material: "organic-cotton", massKg: 1 }, db.ledgerId!), keys["kutch-coop"]));
}
