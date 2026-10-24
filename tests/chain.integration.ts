// Integration test against a real EVM node: deploys OrbitAnchor, anchors a seeded ledger root,
// and checks that Solidity agrees with the TypeScript Merkle proofs.
// Run a local node first (e.g. `npx hardhat node`), then: npm run test:chain
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { createPublicClient, createWalletClient, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readCheckpoint, readLedgerCheckpoints, viemChain } from "../src/lib/anchor-read.ts";
import { merkleProof } from "../src/lib/crypto.ts";
import { generateKeystore } from "../src/lib/keys.ts";
import { prefixRoot } from "../src/lib/ledger.ts";
import { ANCHOR_ABI, networkByKey } from "../src/lib/networks.ts";
import { ACTOR_IDS, seedDb } from "../src/lib/seed.ts";

const n = networkByKey("localhost")!;
const RPC = process.env.ORBIT_RPC_URL ?? n.rpc;
// Hardhat's well-known dev account #0. Never use outside a local node.
const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

test("OrbitAnchor: anchor a ledger root and verify inclusion proofs on-chain", async () => {
  const chain = viemChain(n, RPC);
  const account = privateKeyToAccount(DEV_KEY);
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const artifact = JSON.parse(fs.readFileSync("contracts/OrbitAnchor.json", "utf8")) as { abi: Abi; bytecode: `0x${string}` };
  const { abi, bytecode } = artifact;

  const deployHash = await wallet.deployContract({ abi, bytecode });
  const address = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;

  const db = seedDb(generateKeystore(ACTOR_IDS));
  const covers = db.ledger.length;
  const root = prefixRoot(db, covers);
  const ledgerId = "11".repeat(32);
  const tx = await wallet.writeContract({ address, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${ledgerId}`, `0x${root}`, BigInt(covers)] });
  await pub.waitForTransactionReceipt({ hash: tx });

  const cp = await readCheckpoint(n, address, 0, RPC);
  assert.equal(cp.merkleRoot, root);
  assert.equal(cp.ledgerLength, covers);
  assert.equal(cp.ledgerId, ledgerId);

  const leaves = db.ledger.map((e) => e.hash);
  for (const i of [0, 1, 17, covers - 2, covers - 1]) {
    const proof = merkleProof(leaves, i);
    const ok = await pub.readContract({
      address,
      abi,
      functionName: "verifyInclusion",
      args: [0n, `0x${leaves[i]}`, proof.map((p) => `0x${p.sibling}`), proof.map((p) => p.left)],
    });
    assert.equal(ok, true, `entry ${i} should verify on-chain`);
  }
  const forged = merkleProof(leaves, 3);
  const bad = await pub.readContract({ address, abi, functionName: "verifyInclusion", args: [0n, `0x${"ab".repeat(32)}`, forged.map((p) => `0x${p.sibling}`), forged.map((p) => p.left)] });
  assert.equal(bad, false);

  // Anyone can anchor: an independent witness publishes its own view, recorded under its address.
  const witnessAccount = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const witness = createWalletClient({ account: witnessAccount, chain, transport: http(RPC) });
  const wtx = await witness.writeContract({ address, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${ledgerId}`, `0x${root}`, BigInt(covers)] });
  await pub.waitForTransactionReceipt({ hash: wtx });
  const { operator, checkpoints } = await readLedgerCheckpoints(n, address, ledgerId, 10, RPC);
  assert.equal(operator.toLowerCase(), account.address.toLowerCase());
  assert.equal(checkpoints.length, 2);
  assert.equal(checkpoints[1].submitter.toLowerCase(), witnessAccount.address.toLowerCase());
  assert.equal(checkpoints[1].merkleRoot, root);
  // Empty ledgers are rejected.
  await assert.rejects(witness.writeContract({ address, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${ledgerId}`, `0x${root}`, 0n] }));
});
