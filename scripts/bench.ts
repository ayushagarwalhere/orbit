// Scalability benchmark: builds a ledger of N signed entries and times verification.
//   node scripts/bench.ts 10000
import "../src/lib/crypto-node.ts";
import { PROTOCOL_ID, newRequest, signRequest } from "../src/lib/auth.ts";
import { merkleProof, merkleRoot } from "../src/lib/crypto.ts";
import { applySigned } from "../src/lib/dispatch.ts";
import { generateKeystore } from "../src/lib/keys.ts";
import { verifyLedger } from "../src/lib/ledger.ts";
import { ACTOR_IDS, seedDb } from "../src/lib/seed.ts";

const N = Number(process.argv[2] ?? 5000);
const keys = generateKeystore(ACTOR_IDS);
const db = seedDb(keys, "ab".repeat(32));
const t0 = performance.now();
while (db.ledger.length < N) {
  const req = newRequest("create-batch", "kutch-coop", { material: "organic-cotton", massKg: 1 }, db.ledgerId!);
  applySigned(db, keys[PROTOCOL_ID], "create-batch", signRequest(req, keys["kutch-coop"]));
}
const tBuild = performance.now() - t0;

const t1 = performance.now();
const full = verifyLedger(JSON.parse(JSON.stringify(db)));
const tFull = performance.now() - t1;

verifyLedger(db); // warm incremental state
applySigned(db, keys[PROTOCOL_ID], "create-batch", signRequest(newRequest("create-batch", "kutch-coop", { material: "organic-cotton", massKg: 1 }, db.ledgerId!), keys["kutch-coop"]));
const t2 = performance.now();
const inc = verifyLedger(db);
const tInc = performance.now() - t2;

const leaves = db.ledger.map((e) => e.hash);
const t3 = performance.now();
merkleRoot(leaves);
const tRoot = performance.now() - t3;
const proof = merkleProof(leaves, Math.floor(leaves.length / 2));

const ms = (x: number) => `${x.toFixed(1)} ms`;
console.log(`entries                         ${db.ledger.length}`);
console.log(`build (sign request + sequence)  ${ms(tBuild)}  (${ms(tBuild / N)} per write)`);
console.log(`full verification               ${ms(tFull)}  (${ms(tFull / full.checked)} per entry, ok=${full.ok})`);
console.log(`incremental check after 1 write  ${ms(tInc)}  (ok=${inc.ok})`);
console.log(`merkle root over all entries     ${ms(tRoot)}`);
console.log(`inclusion proof size             ${proof.length} hashes (${proof.length * 32} bytes)`);
