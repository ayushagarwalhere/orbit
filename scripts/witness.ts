// Witness. Meant to be run by someone who isn't Orbit: an auditor, a recycler, an NGO, a judge.
//  1. Gets the ledger: from an Orbit node (ORBIT_URL), or from a file you were sent (--file).
//  2. Re-verifies every hash, signature and signed instruction itself, and replays the rules.
//  3. Compares it with every root already published on-chain for this ledger by trusted parties.
//  4. If everything agrees, anchors the root it saw from ITS OWN wallet (skip with --check-only).
// If Orbit later rewrites or drops events, this witness's on-chain root exposes it.
//
//   npm run witness -- --check-only                    # verify only: no wallet, no gas
//   npm run witness -- --file ledger.jsonl --check-only  # verify a ledger file you were sent
//   npm run witness                                    # verify, then anchor from your wallet
//   npm run witness -- --watch 120                     # keep watching, anchor when the ledger grew
//
// Env: ORBIT_URL (default http://localhost:3000), ORBIT_CHAIN (default base-sepolia),
//      ORBIT_ANCHOR_ADDRESS (default: Orbit's pinned contract), ORBIT_WITNESS_PRIVATE_KEY (to anchor)
// See docs/WITNESS_GUIDE.md.
import "../src/lib/crypto-node.ts";
import fs from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readLedgerCheckpoints, viemChain } from "../src/lib/anchor-read.ts";
import { PROTOCOL_ID } from "../src/lib/auth.ts";
import { prefixRoot, verifyLedger } from "../src/lib/ledger.ts";
import { ANCHOR_ABI, OFFICIAL_ANCHORS, networkByKey, submitterRole } from "../src/lib/networks.ts";
import type { Db, LedgerEntry } from "../src/lib/types.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : (process.argv[i + 1] ?? "");
};
const file = arg("--file");
const checkOnly = process.argv.includes("--check-only");
const url = (process.env.ORBIT_URL ?? "http://localhost:3000").replace(/\/$/, "");
const network = networkByKey(process.env.ORBIT_CHAIN ?? "base-sepolia");
const address = (process.env.ORBIT_ANCHOR_ADDRESS ?? (network ? OFFICIAL_ANCHORS[network.chainId]?.contract : undefined)) as `0x${string}` | undefined;
const pk = process.env.ORBIT_WITNESS_PRIVATE_KEY as `0x${string}` | undefined;
if (!network || !address) {
  console.error("Unknown network or anchor contract: set ORBIT_CHAIN and ORBIT_ANCHOR_ADDRESS");
  process.exit(2);
}
if (!pk && !checkOnly) {
  console.error("To anchor, set ORBIT_WITNESS_PRIVATE_KEY (create one with: npm run wallet -- --witness).");
  console.error("To only verify, without a wallet or gas, add --check-only.");
  process.exit(2);
}
const rpc = process.env.ORBIT_RPC_URL || network.rpc;
const account = pk ? privateKeyToAccount(pk) : undefined;
const chain = viemChain(network, rpc);
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = account ? createWalletClient({ account, chain, transport: http(rpc) }) : undefined;
let lastAnchored = 0;
// In --watch mode, keep what we've downloaded and only fetch new entries each pass.
let cache: LedgerEntry[] | null = null;

/** The ledger id comes from the genesis entry itself, not from whatever the server says. */
function genesisLedgerId(entries: LedgerEntry[]): string {
  const g = entries[0];
  if (!g || g.type !== "ACTOR_REGISTERED" || g.subjectId !== PROTOCOL_ID || typeof g.data.ledgerId !== "string") throw new Error("Entry #0 is not the protocol's genesis registration");
  return g.data.ledgerId;
}

function readFile(p: string): LedgerEntry[] {
  const text = fs.readFileSync(p, "utf8").trim();
  // Accept either data/ledger.jsonl (one entry per line) or a saved /api/ledger response.
  if (text.startsWith("{") && !text.includes("\n{")) {
    const j = JSON.parse(text) as { entries?: LedgerEntry[] };
    if (!Array.isArray(j.entries)) throw new Error(`${p}: expected { entries: [...] } or one entry per line`);
    return j.entries;
  }
  return text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as LedgerEntry);
}

async function download(): Promise<LedgerEntry[]> {
  if (file !== undefined) return readFile(file);
  const from = cache?.length ?? 0;
  const body = (await (await fetch(`${url}/api/ledger?from=${from}`)).json()) as { total: number; entries: LedgerEntry[] };
  if (!cache || body.total < from || (from && body.entries[0] && body.entries[0].prevHash !== cache[from - 1].hash)) {
    // First pass, or history shrank or forked: start over with a full download.
    cache = ((await (await fetch(`${url}/api/ledger`)).json()) as { entries: LedgerEntry[] }).entries;
  } else {
    cache.push(...body.entries);
  }
  return cache;
}

async function pass(): Promise<boolean> {
  const entries = await download();
  const source = file !== undefined ? file : url;
  const ledgerId = genesisLedgerId(entries);
  const db = { ledger: entries } as unknown as Db;
  const report = verifyLedger(db);
  console.log(`[witness] ${source}: ledger ${ledgerId.slice(0, 12)}…, ${entries.length} entries`);
  console.log(`  ${report.ok ? "✓" : "✕"} hashes, signatures, signed times and replay of every instruction: ${report.ok ? "all OK" : `${report.issues.length} problem(s)`}`);
  if (!report.ok) {
    for (const i of report.issues.slice(0, 10)) console.log(`    ✕ #${i.index} ${i.problem}: ${i.detail}`);
    return false;
  }

  // Compare against every root from parties this witness trusts: Orbit's operator, the named
  // witnesses, and itself. Anyone can anchor, so roots from unidentified wallets are only reported.
  const { operator, checkpoints } = await readLedgerCheckpoints(network!, address!, ledgerId, rpc);
  let consistent = true;
  let trusted = 0;
  for (const cp of checkpoints) {
    const mine = !!account && cp.submitter.toLowerCase() === account.address.toLowerCase();
    const { role, name } = submitterRole(network!.chainId, cp.submitter, operator);
    const ok = cp.ledgerLength <= entries.length && prefixRoot(db, cp.ledgerLength) === cp.merkleRoot;
    if (role === "unidentified" && !mine) {
      if (!ok) console.log(`  · checkpoint #${cp.id} by ${name} disagrees (ignored: not a trusted submitter)`);
      continue;
    }
    trusted++;
    console.log(`  ${ok ? "✓" : "✕ ALERT"} on-chain checkpoint #${cp.id} by ${mine ? "me" : name}: ${cp.ledgerLength} entries${ok ? " match" : " DO NOT match"}`);
    consistent &&= ok;
  }
  if (!trusted) console.log("  · no trusted checkpoint on-chain for this ledger yet");
  if (!consistent) {
    console.log("[witness] This ledger disagrees with roots already on-chain: evidence of a rewrite. Not anchoring.");
    return false;
  }
  if (!wallet || !account) {
    console.log(`[witness] Verified. (--check-only: nothing anchored.)`);
    return true;
  }
  if (entries.length === lastAnchored) {
    console.log("[witness] No new entries since my last anchor.");
    return true;
  }
  const root = prefixRoot(db, entries.length);
  const hash = await wallet.writeContract({ address: address!, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${ledgerId}`, `0x${root}`, BigInt(entries.length)] });
  await pub.waitForTransactionReceipt({ hash });
  lastAnchored = entries.length;
  console.log(`[witness] Anchored ${entries.length} entries from ${account.address}: ${network!.explorer ? `${network!.explorer}/tx/${hash}` : hash}`);
  console.log("[witness] Send that address to the Orbit team so they can list you as a named witness.");
  return true;
}

const watch = process.argv.indexOf("--watch");
if (watch === -1) {
  // Set exitCode rather than calling process.exit, so open sockets close cleanly (Windows libuv).
  process.exitCode = await pass().then(
    (ok) => (ok ? 0 : 1),
    (e) => {
      console.error("[witness]", e instanceof Error ? e.message : e);
      return 1;
    },
  );
} else {
  const every = Number(process.argv[watch + 1] ?? 120) * 1000;
  for (;;) {
    await pass().catch((e) => console.error("[witness]", e instanceof Error ? e.message : e));
    await new Promise((r) => setTimeout(r, every));
  }
}
