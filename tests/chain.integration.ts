// Integration test against a real EVM node: deploys OrbitAnchor v3, anchors seeded ledger roots, and
// checks that Solidity agrees with the TypeScript RFC 6962 inclusion and consistency proofs.
// Run a local EVM node with the standard dev accounts first (`anvil`, or `npx hardhat node` in a Hardhat project), then: npm run test:chain
// CI runs this on every push (.github/workflows/ci.yml, job "contract").
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { createPublicClient, createWalletClient, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "../src/lib/crypto-node.ts";
import { readCheckpoint, readLedgerCheckpoints, viemChain } from "../src/lib/anchor-read.ts";
import { MerkleTree, sha256Hex, verifyConsistency, verifyInclusion } from "../src/lib/crypto.ts";
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

test("differential: Solidity and TypeScript agree on every RFC 6962 proof for every tree size up to 24", async () => {
  const chain = viemChain(n, RPC);
  const account = privateKeyToAccount(DEV_KEY);
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const { abi, bytecode } = JSON.parse(fs.readFileSync("contracts/OrbitAnchor.json", "utf8")) as { abi: Abi; bytecode: `0x${string}` };
  const address = (await pub.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi, bytecode }) })).contractAddress!;
  const MAX = 24;
  const leaves = Array.from({ length: MAX }, (_, i) => sha256Hex(`diff-${i}`));
  const tree = new MerkleTree(leaves);
  const ledgerId = `0x${"22".repeat(32)}` as const;
  // Checkpoint id k-1 holds the root of the first k leaves.
  for (let k = 1; k <= MAX; k++) {
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address, abi: ANCHOR_ABI, functionName: "anchor", args: [ledgerId, `0x${tree.root(k)}`, BigInt(k)] }) });
  }
  const call = (functionName: "verifyInclusion" | "verifyConsistency", args: readonly unknown[]) => pub.readContract({ address, abi: ANCHOR_ABI, functionName, args } as never) as Promise<boolean>;
  let calls = 0;
  for (let size = 1; size <= MAX; size++) {
    const id = BigInt(size - 1);
    for (let m = 0; m < size; m++) {
      const path = tree.inclusionProof(m, size);
      const cases: [string, number, string[], boolean][] = [
        [leaves[m], m, path, true],
        [sha256Hex(`forged-${m}`), m, path, false],
      ];
      if (size > 1) cases.push([leaves[m], (m + 1) % size, path, verifyInclusion(leaves[m], (m + 1) % size, size, path, tree.root(size))]);
      for (const [leaf, idx, p, ts] of cases) {
        assert.equal(verifyInclusion(leaf, idx, size, p, tree.root(size)), ts);
        assert.equal(await call("verifyInclusion", [id, `0x${leaf}`, BigInt(idx), hex(p)]), ts, `inclusion size=${size} m=${m} idx=${idx}`);
        calls++;
      }
    }
    for (let older = 1; older <= size; older++) {
      const proof = tree.consistencyProof(older, size);
      assert.equal(await call("verifyConsistency", [BigInt(older - 1), id, hex(proof)]), true, `consistency ${older}->${size}`);
      if (proof.length) {
        const bad = [sha256Hex("tampered"), ...proof.slice(1)];
        assert.equal(await call("verifyConsistency", [BigInt(older - 1), id, hex(bad)]), verifyConsistency(older, size, tree.root(older), tree.root(size), bad), `tampered ${older}->${size}`);
      }
      calls += proof.length ? 2 : 1;
    }
  }
  assert.ok(calls > 900, `ran ${calls} on-chain comparisons`);
});

test("Verify page's 'Ask the contract' checks run against real Solidity: honest ledger passes, rewritten ledger fails", async () => {
  const { contractVerifier } = await import("../src/lib/anchor-read.ts");
  const { contractChecks } = await import("../src/lib/onchain-verify.ts");
  const chain = viemChain(n, RPC);
  const account = privateKeyToAccount(DEV_KEY);
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const { abi, bytecode } = JSON.parse(fs.readFileSync("contracts/OrbitAnchor.json", "utf8")) as { abi: Abi; bytecode: `0x${string}` };
  const address = (await pub.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi, bytecode }) })).contractAddress!;
  const ledgerId = "33".repeat(32);
  const db = seedDb(generateKeystore(ACTOR_IDS), ledgerId);
  const tree = new MerkleTree(db.ledger.map((e) => e.hash));
  for (const size of [20, db.ledger.length]) {
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${ledgerId}`, `0x${tree.root(size)}`, BigInt(size)] }) });
  }
  const { checkpoints } = await readLedgerCheckpoints(n, address, ledgerId, RPC);
  const cp = checkpoints[checkpoints.length - 1];
  const contract = contractVerifier(n, address, RPC);
  const eventIndexes = db.ledger.filter((e) => e.subjectId === db.products[1].id).map((e) => e.index);

  const honest = await contractChecks({ ledger: db.ledger, checkpoint: cp, trusted: checkpoints, eventIndexes, contract });
  assert.deepEqual(honest.map((c) => c.ok), [true, true, true]);

  const rewritten = db.ledger.map((e, i) => (i === 10 ? { ...e, hash: sha256Hex("rewritten") } : e));
  const caught = await contractChecks({ ledger: rewritten, checkpoint: cp, trusted: checkpoints, eventIndexes, contract });
  assert.equal(caught[0].ok, false);
  assert.equal(caught[2].ok, false);
});
