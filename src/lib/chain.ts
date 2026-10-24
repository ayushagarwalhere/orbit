// Server-only: publishes ledger Merkle roots to OrbitAnchor and checks every party's roots back.
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readLedgerCheckpoints, viemChain, type OnChainCheckpoint } from "./anchor-read.ts";
import { recordCheckpoint } from "./actions.ts";
import { OrbitError } from "./domain.ts";
import { prefixRoot } from "./ledger.ts";
import { ANCHOR_ABI, networkByKey, submitterRole, txUrl, type Network, type SubmitterRole } from "./networks.ts";
import { getDb, mutate } from "./store.ts";
import type { Checkpoint, Db } from "./types.ts";

export interface ChainConfig {
  network: Network;
  address: `0x${string}`;
  rpc: string;
  privateKey?: `0x${string}`;
}

/** Configured from env: ORBIT_CHAIN, ORBIT_ANCHOR_ADDRESS, ORBIT_ANCHOR_PRIVATE_KEY, ORBIT_RPC_URL. */
export function chainConfig(): ChainConfig | null {
  const network = networkByKey(process.env.ORBIT_CHAIN ?? "base-sepolia");
  const address = process.env.ORBIT_ANCHOR_ADDRESS;
  if (!network || !address) return null;
  const pk = process.env.ORBIT_ANCHOR_PRIVATE_KEY;
  return {
    network,
    address: address as `0x${string}`,
    rpc: process.env.ORBIT_RPC_URL || network.rpc,
    privateKey: pk ? ((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`) : undefined,
  };
}

async function publishRoot(cfg: ChainConfig, ledgerId: string, root: string, covers: number) {
  if (!cfg.privateKey) throw new OrbitError("ORBIT_ANCHOR_PRIVATE_KEY is not set, so this server cannot publish anchors", 503);
  const chain = viemChain(cfg.network, cfg.rpc);
  const account = privateKeyToAccount(cfg.privateKey);
  const wallet = createWalletClient({ account, chain, transport: http(cfg.rpc) });
  const pub = createPublicClient({ chain, transport: http(cfg.rpc) });
  const hash = await wallet.writeContract({ address: cfg.address, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${ledgerId}`, `0x${root}`, BigInt(covers)] });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new OrbitError(`Anchor transaction reverted: ${hash}`, 502);
  const [log] = parseEventLogs({ abi: ANCHOR_ABI, eventName: "Anchored", logs: receipt.logs });
  return { txHash: hash, blockNumber: Number(receipt.blockNumber), checkpointId: Number(log.args.id), submitter: account.address };
}

const g = globalThis as unknown as { __orbitAnchor?: { inflight: Promise<Checkpoint> | null; timer: ReturnType<typeof setTimeout> | null; booted: boolean } };
const svc = () => (g.__orbitAnchor ??= { inflight: null, timer: null, booted: false });

/** Below this balance, automatic anchoring pauses (manual anchoring still works). */
const MIN_AUTO_BALANCE_WEI = 20_000_000_000_000n; // 0.00002 ETH, about 40 anchors of headroom on Base Sepolia

export async function anchorWalletBalance(): Promise<bigint | null> {
  const cfg = chainConfig();
  if (!cfg?.privateKey) return null;
  const pub = createPublicClient({ chain: viemChain(cfg.network, cfg.rpc), transport: http(cfg.rpc) });
  return pub.getBalance({ address: privateKeyToAccount(cfg.privateKey).address });
}

/** Commit the current ledger root: on-chain when configured, otherwise as a local-only checkpoint. */
export function anchorNow(opts: { auto?: boolean } = {}): Promise<Checkpoint> {
  const s = svc();
  if (s.inflight) return s.inflight;
  s.inflight = (async () => {
    const db = getDb();
    if (db.tamper) throw new OrbitError("Restore the ledger before anchoring: refusing to anchor tampered history", 409);
    // Nothing new since the last checkpoint (only the ANCHORED entry itself): don't spend gas.
    const last = db.checkpoints.at(-1);
    if (last && db.ledger.at(-1)?.type === "ANCHORED" && last.covers === db.ledger.length - 1) return last;
    const covers = db.ledger.length;
    const root = prefixRoot(db, covers);
    const cfg = chainConfig();
    if (!cfg?.privateKey) {
      return mutate((tx) => recordCheckpoint(tx, { covers, merkleRoot: root, onChain: false, network: "local only (no chain configured)" }));
    }
    // Keep a reserve for automatic anchors; manual anchors stop at the same floor.
    const bal = await anchorWalletBalance().catch(() => null);
    if (bal !== null && bal < MIN_AUTO_BALANCE_WEI) throw new OrbitError("Anchor wallet is low on testnet ETH; anchoring is paused until it is topped up", 503);
    void opts;
    const ledgerId = db.ledgerId!;
    const r = await publishRoot(cfg, ledgerId, root, covers);
    return mutate((tx) =>
      recordCheckpoint(tx, {
        covers,
        merkleRoot: root,
        onChain: true,
        chainId: cfg.network.chainId,
        network: cfg.network.name,
        contract: cfg.address,
        checkpointId: r.checkpointId,
        ledgerId,
        submitter: r.submitter,
        txHash: r.txHash,
        blockNumber: r.blockNumber,
        explorerTx: txUrl(cfg.network, r.txHash),
      }),
    );
  })().finally(() => {
    s.inflight = null;
  });
  return s.inflight;
}

/** Debounced auto-anchoring: a burst of writes produces one transaction, at most one per AUTO_INTERVAL_MS. */
/** At most one automatic anchor per this interval (default 10 min), to make testnet gas last. */
const AUTO_INTERVAL_MS = Number(process.env.ORBIT_ANCHOR_MIN_INTERVAL_MS ?? 600_000);
const autoState = globalThis as unknown as { __orbitLastAuto?: number };

export function scheduleAnchor(delayMs = 45_000) {
  const cfg = chainConfig();
  if (!cfg?.privateKey || process.env.ORBIT_AUTO_ANCHOR === "0") return;
  const s = svc();
  // Keep a pending timer: it anchors whatever exists when it fires, and resetting it on each
  // write would let a steady stream of writes postpone anchoring forever.
  if (s.timer) return;
  const sinceLast = Date.now() - (autoState.__orbitLastAuto ?? 0);
  const wait = Math.max(delayMs, AUTO_INTERVAL_MS - sinceLast);
  s.timer = setTimeout(() => {
    s.timer = null;
    autoState.__orbitLastAuto = Date.now();
    anchorNow({ auto: true }).catch((e) => console.error("[orbit] auto-anchor skipped:", e instanceof Error ? e.message : e));
  }, wait);
}

/** On server start: make sure the current ledger has an on-chain checkpoint. */
export function bootAnchor() {
  const s = svc();
  if (s.booted) return;
  s.booted = true;
  const db = getDb();
  const last = [...db.checkpoints].reverse().find((c) => c.onChain && c.ledgerId === db.ledgerId);
  if (!last || last.covers < db.ledger.length - 1) scheduleAnchor(2_000);
}

export interface AnchorCheck {
  onChain: OnChainCheckpoint | null; // null for a local-only record
  network: string;
  id?: number;
  local?: Checkpoint;
  covers: number;
  /** ignored = an unidentified submitter disagrees; shown, but it can't fail verification. */
  status: "match" | "mismatch" | "ignored" | "unreachable" | "local";
  role: SubmitterRole | "local";
  name: string;
  recomputedRoot: string;
  detail: string;
  explorerTx?: string;
}

/**
 * Compare the ledger as it is now against EVERY root published for it on-chain. Only Orbit's
 * pinned operator and named witnesses count; anyone else's root is informational. Reads the
 * chain directly, so rewriting local records changes nothing.
 */
export async function checkAnchors(db: Db): Promise<AnchorCheck[]> {
  const cfg = chainConfig();
  if (!cfg || !db.ledgerId) {
    return db.checkpoints.map((cp) => ({
      onChain: null,
      network: cp.network,
      local: cp,
      covers: cp.covers,
      status: "local",
      role: "local",
      name: "local record",
      recomputedRoot: cp.covers <= db.ledger.length ? prefixRoot(db, cp.covers) : "",
      detail: "Local checkpoint only: not independently verifiable",
    }));
  }
  try {
    const { operator, checkpoints } = await readLedgerCheckpoints(cfg.network, cfg.address, db.ledgerId, cfg.rpc);
    const localById = new Map(db.checkpoints.filter((c) => c.checkpointId !== undefined).map((c) => [c.checkpointId!, c]));
    return checkpoints.map((oc): AnchorCheck => {
      const { role, name } = submitterRole(cfg.network.chainId, oc.submitter, operator);
      const trusted = role !== "unidentified";
      const base = { onChain: oc, network: cfg.network.name, id: oc.id, local: localById.get(oc.id), covers: oc.ledgerLength, role, name, explorerTx: localById.get(oc.id)?.explorerTx };
      if (oc.ledgerLength > db.ledger.length) {
        return { ...base, status: trusted ? "mismatch" : "ignored", recomputedRoot: "", detail: `${name} anchored ${oc.ledgerLength} entries, but the ledger now has only ${db.ledger.length}${trusted ? ": events were deleted or withheld" : " (not a trusted submitter)"}` };
      }
      const recomputed = prefixRoot(db, oc.ledgerLength);
      const ok = recomputed === oc.merkleRoot;
      return {
        ...base,
        status: ok ? "match" : trusted ? "mismatch" : "ignored",
        recomputedRoot: recomputed,
        detail: ok
          ? `Entries 0–${oc.ledgerLength - 1} match checkpoint #${oc.id} by ${name}`
          : trusted
            ? `History changed after ${name} anchored it: checkpoint #${oc.id} holds ${oc.merkleRoot.slice(0, 12)}…, ledger now hashes to ${recomputed.slice(0, 12)}…`
            : `Checkpoint #${oc.id} by ${name} disagrees with the ledger; ignored because this submitter isn't trusted`,
      };
    });
  } catch (e) {
    return db.checkpoints.slice(-1).map((cp) => ({
      onChain: null,
      network: cfg.network.name,
      local: cp,
      covers: cp.covers,
      status: "unreachable",
      role: "local",
      name: "local record",
      recomputedRoot: "",
      detail: `Could not reach ${cfg.network.name}: ${e instanceof Error ? (e.message.split(String.fromCharCode(10))[0] ?? "") : "error"}`,
    }));
  }
}
