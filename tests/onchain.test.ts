// contractChecks against a stand-in contract that applies the same RFC 9162 rules as OrbitAnchor
// (tests/chain.integration.ts checks the real Solidity gives identical answers).
import assert from "node:assert/strict";
import { test } from "node:test";
import "../src/lib/crypto-node.ts";
import type { OnChainCheckpoint } from "../src/lib/anchor-read.ts";
import { MerkleTree, sha256Hex, verifyConsistency, verifyInclusion } from "../src/lib/crypto.ts";
import { contractChecks, type ContractVerifier } from "../src/lib/onchain-verify.ts";
import type { LedgerEntry } from "../src/lib/types.ts";

const hashes = (n: number, salt = "") => Array.from({ length: n }, (_, i) => sha256Hex(`${salt}entry-${i}`));
const asLedger = (hs: string[]) => hs.map((hash, index) => ({ index, hash }) as unknown as LedgerEntry);

function chain(anchoredHashes: string[], sizes: number[]) {
  const tree = new MerkleTree(anchoredHashes);
  const cps: OnChainCheckpoint[] = sizes.map((size, id) => ({ id, ledgerId: "00", merkleRoot: tree.root(size), ledgerLength: size, timestamp: 0, submitter: "0xop" }));
  const contract: ContractVerifier = {
    verifyInclusion: async (id, h, i, path) => verifyInclusion(h, i, cps[id].ledgerLength, path, cps[id].merkleRoot),
    verifyConsistency: async (a, b, proof) => verifyConsistency(cps[a].ledgerLength, cps[b].ledgerLength, cps[a].merkleRoot, cps[b].merkleRoot, proof),
  };
  return { cps, contract };
}

test("honest ledger: events included, forged control rejected, checkpoints chain append-only", async () => {
  const hs = hashes(40);
  const { cps, contract } = chain(hs, [12, 25, 25, 40]);
  const checks = await contractChecks({ ledger: asLedger(hs), checkpoint: cps[3], trusted: cps, eventIndexes: [3, 17, 39, 39], contract });
  assert.deepEqual(
    checks.map((c) => c.ok),
    [true, true, true],
  );
  assert.match(checks[0].detail, /all 3 events/);
  assert.match(checks[2].detail, /3 consecutive pairs/);
});

test("a rewritten ledger fails inclusion and the append-only chain", async () => {
  const hs = hashes(40);
  const { cps, contract } = chain(hs, [12, 40]);
  const rewritten = [...hs.slice(0, 5), sha256Hex("forged"), ...hs.slice(6)];
  const checks = await contractChecks({ ledger: asLedger(rewritten), checkpoint: cps[1], trusted: cps, eventIndexes: [5, 20], contract });
  assert.equal(checks[0].ok, false, "every proof from a rewritten tree fails against the anchored root");
  assert.equal(checks[1].ok, true, "the forged control is still rejected");
  assert.equal(checks[2].ok, false);
  assert.match(checks[2].detail, /verifyConsistency\(#0, #1\) returned false/);
});

test("a node withholding anchored entries is caught before any proof is built", async () => {
  const hs = hashes(30);
  const { cps, contract } = chain(hs, [30]);
  const checks = await contractChecks({ ledger: asLedger(hs.slice(0, 20)), checkpoint: cps[0], trusted: cps, eventIndexes: [1], contract });
  assert.equal(checks.length, 1);
  assert.equal(checks[0].ok, false);
  assert.match(checks[0].detail, /withheld/);
});

test("a single checkpoint is reported as nothing-to-compare, not as a pass", async () => {
  const hs = hashes(10);
  const { cps, contract } = chain(hs, [10]);
  const checks = await contractChecks({ ledger: asLedger(hs), checkpoint: cps[0], trusted: cps, eventIndexes: [0, 9], contract });
  assert.equal(checks[2].ok, "warn");
});
