// Independent witness. Run by anyone who isn't Orbit: an auditor, a recycler, an NGO.
//  1. Downloads the full ledger from an Orbit node.
//  2. Re-verifies every hash, signature and signed instruction itself.
//  3. Compares it with every root already published on-chain for this ledger, by anyone.
//  4. If all is consistent, anchors the root it saw from ITS OWN wallet.
// If Orbit later rewrites or drops events, this witness's on-chain root exposes it.
//
//   npm run witness                # one pass
//   npm run witness -- --watch 120 # keep watching, anchor every 120 s when the ledger grew
//
// Env: ORBIT_URL (default http://localhost:3000), ORBIT_CHAIN, ORBIT_ANCHOR_ADDRESS, ORBIT_WITNESS_PRIVATE_KEY
import "../src/lib/crypto-node.ts";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readLedgerCheckpoints, viemChain } from "../src/lib/anchor-read.ts";
import { prefixRoot, verifyLedger } from "../src/lib/ledger.ts";
import { ANCHOR_ABI, networkByKey, submitterRole } from "../src/lib/networks.ts";
import type { Db, LedgerEntry } from "../src/lib/types.ts";

const url = (process.env.ORBIT_URL ?? "http://localhost:3000").replace(/\/$/, "");
const network = networkByKey(process.env.ORBIT_CHAIN ?? "base-sepolia");
const address = process.env.ORBIT_ANCHOR_ADDRESS as `0x${string}` | undefined;
const pk = process.env.ORBIT_WITNESS_PRIVATE_KEY as `0x${string}` | undefined;
if (!network || !address || !pk) {
  console.error("Set ORBIT_CHAIN, ORBIT_ANCHOR_ADDRESS and ORBIT_WITNESS_PRIVATE_KEY (npm run wallet -- --witness)");
  process.exit(2);
}
const rpc = process.env.ORBIT_RPC_URL || network.rpc;
const account = privateKeyToAccount(pk);
const chain = viemChain(network, rpc);
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
let lastAnchored = 0;

async function pass(): Promise<boolean> {
  const res = await fetch(`${url}/api/ledger`);
  const body = (await res.json()) as { ledgerId?: string; entries: LedgerEntry[] };
  if (!body.ledgerId) throw new Error("Node did not publish a ledgerId");
  const db = { ledger: body.entries } as unknown as Db;
  const report = verifyLedger(db);
  console.log(`[witness] ${url}: ${body.entries.length} entries, local verification ${report.ok ? "OK" : "FAILED"}`);
  if (!report.ok) {
    for (const i of report.issues.slice(0, 10)) console.log(`  ✕ #${i.index} ${i.problem}: ${i.detail}`);
    return false;
  }

  // Compare against every root from parties this witness trusts: Orbit's operator, the named
  // witnesses, and itself. Anyone can anchor, so roots from unidentified wallets are only reported.
  const { operator, checkpoints } = await readLedgerCheckpoints(network!, address!, body.ledgerId, rpc);
  let consistent = true;
  for (const cp of checkpoints) {
    const mine = cp.submitter.toLowerCase() === account.address.toLowerCase();
    const { role, name } = submitterRole(network!.chainId, cp.submitter, operator);
    const ok = cp.ledgerLength <= body.entries.length && prefixRoot(db, cp.ledgerLength) === cp.merkleRoot;
    if (role === "unidentified" && !mine) {
      if (!ok) console.log(`  · checkpoint #${cp.id} by ${name} disagrees (ignored: not a trusted submitter)`);
      continue;
    }
    console.log(`  ${ok ? "✓" : "✕ ALERT"} checkpoint #${cp.id} by ${mine ? "me" : name}: ${cp.ledgerLength} entries`);
    consistent &&= ok;
  }
  if (!consistent) {
    console.log("[witness] History disagrees with roots already on-chain. Refusing to anchor; this is evidence of a rewrite.");
    return false;
  }
  if (body.entries.length === lastAnchored) {
    console.log("[witness] No new entries since my last anchor.");
    return true;
  }
  const root = prefixRoot(db, body.entries.length);
  const hash = await wallet.writeContract({ address: address!, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${body.ledgerId}`, `0x${root}`, BigInt(body.entries.length)] });
  await pub.waitForTransactionReceipt({ hash });
  lastAnchored = body.entries.length;
  console.log(`[witness] Anchored ${body.entries.length} entries as ${account.address}: ${network!.explorer ? `${network!.explorer}/tx/${hash}` : hash}`);
  return true;
}

const watch = process.argv.indexOf("--watch");
if (watch === -1) {
  // Set exitCode rather than calling process.exit, so open sockets close cleanly (Windows libuv).
  process.exitCode = (await pass()) ? 0 : 1;
} else {
  const every = Number(process.argv[watch + 1] ?? 120) * 1000;
  for (;;) {
    await pass().catch((e) => console.error("[witness]", e instanceof Error ? e.message : e));
    await new Promise((r) => setTimeout(r, every));
  }
}
