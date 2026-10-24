// Integration test against a real EVM node: deploys OrbitAnchor v3, anchors seeded ledger roots, and
// checks that Solidity agrees with the TypeScript RFC 6962 inclusion and consistency proofs.
// Run a local node first (e.g. `npx hardhat node`), then: npm run test:chain
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { createPublicClient, createWalletClient, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "../src/lib/crypto-node.ts";
import { readCheckpoint, readLedgerCheckpoints, viemChain } from "../src/lib/anchor-read.ts";
import { MerkleTree, sha256Hex } from "../src/lib/crypto.ts";
import { generateKeystore } from "../src/lib/keys.ts";
import { ANCHOR_ABI, networkByKey } from "../src/lib/networks.ts";
import { ACTOR_IDS, seedDb } from "../src/lib/seed.ts";

const n = networkByKey("localhost")!;
const RPC = process.env.ORBIT_RPC_URL ?? n.rpc;
// Hardhat's well-known dev accounts #0 and #1. Never use outside a local node.
const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const WITNESS_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const hex = (xs: string[]) => xs.map((p) => `0x${p}` as `0x${string}`);

test("OrbitAnchor v3: open anchoring, RFC 6962 inclusion and consistency proofs verified on-chain", async () => {
  const chain = viemChain(n, RPC);
  const account = privateKeyToAccount(DEV_KEY);
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const { abi, bytecode } = JSON.parse(fs.readFileSync("contracts/OrbitAnchor.json", "utf8")) as { abi: Abi; bytecode: `0x${string}` };
  const address = (await pub.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi, bytecode }) })).contractAddress!;
  const send = async (w: typeof wallet, ledgerId: string, root: string, size: number) =>
    pub.waitForTransactionReceipt({ hash: await w.writeContract({ address, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${ledgerId}`, `0x${root}`, BigInt(size)] }) });

  const ledgerId = "11".repeat(32);
  const db = seedDb(generateKeystore(ACTOR_IDS), ledgerId);
  const leaves = db.ledger.map((e) => e.hash);
  const tree = new MerkleTree(leaves);
  const full = leaves.length;
  const early = 37;
  await send(wallet, ledgerId, tree.root(early), early); // checkpoint #0
  await send(wallet, ledgerId, tree.root(full), full); // checkpoint #1

  const cp = await readCheckpoint(n, address, 1, RPC);
  assert.equal(cp.merkleRoot, tree.root());
  assert.equal(cp.ledgerLength, full);
  assert.equal(cp.ledgerId, ledgerId);

  for (const i of [0, 1, 17, full - 2, full - 1]) {
    const ok = await pub.readContract({ address, abi: ANCHOR_ABI, functionName: "verifyInclusion", args: [1n, `0x${leaves[i]}`, BigInt(i), hex(tree.inclusionProof(i))] });
    assert.equal(ok, true, `entry ${i} should verify on-chain`);
  }
  assert.equal(await pub.readContract({ address, abi: ANCHOR_ABI, functionName: "verifyInclusion", args: [1n, `0x${leaves[3]}`, 4n, hex(tree.inclusionProof(3))] }), false, "wrong index");

  // Append-only: checkpoint #1 extends #0.
  assert.equal(await pub.readContract({ address, abi: ANCHOR_ABI, functionName: "verifyConsistency", args: [0n, 1n, hex(tree.consistencyProof(early, full))] }), true);

  // A rewritten history anchored later can never be proven consistent with #0.
  const forged = new MerkleTree([...leaves.slice(0, 10), sha256Hex("forged"), ...leaves.slice(11)]);
  await send(wallet, ledgerId, forged.root(), full); // checkpoint #2
  assert.equal(await pub.readContract({ address, abi: ANCHOR_ABI, functionName: "verifyConsistency", args: [0n, 2n, hex(forged.consistencyProof(early, full))] }), false);

  // Anyone can anchor: a witness's root is recorded under its own address.
  const witnessAccount = privateKeyToAccount(WITNESS_KEY);
  const witness = createWalletClient({ account: witnessAccount, chain, transport: http(RPC) });
  await send(witness, ledgerId, tree.root(), full); // checkpoint #3
  const { operator, checkpoints } = await readLedgerCheckpoints(n, address, ledgerId, RPC);
  assert.equal(operator.toLowerCase(), account.address.toLowerCase());
  assert.equal(checkpoints.length, 4);
  assert.equal(checkpoints[3].submitter.toLowerCase(), witnessAccount.address.toLowerCase());
  await assert.rejects(send(witness, ledgerId, tree.root(), 0));
});
