// Server-only: publishes ledger Merkle roots to OrbitAnchor and checks them back.
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readCheckpoint, viemChain } from "./anchor-read.ts";
import { recordCheckpoint } from "./actions.ts";
import { OrbitError } from "./domain.ts";
import { prefixRoot } from "./ledger.ts";
import { ANCHOR_ABI, networkById, networkByKey, txUrl, type Network } from "./networks.ts";
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

async function publishRoot(cfg: ChainConfig, root: string, covers: number) {
  if (!cfg.privateKey) throw new OrbitError("ORBIT_ANCHOR_PRIVATE_KEY is not set, so this server cannot publish anchors", 503);
  const chain = viemChain(cfg.network, cfg.rpc);
  const account = privateKeyToAccount(cfg.privateKey);
  const wallet = createWalletClient({ account, chain, transport: http(cfg.rpc) });
  const pub = createPublicClient({ chain, transport: http(cfg.rpc) });
  const hash = await wallet.writeContract({ address: cfg.address, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${root}`, BigInt(covers)] });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new OrbitError(`Anchor transaction reverted: ${hash}`, 502);
  const [log] = parseEventLogs({ abi: ANCHOR_ABI, eventName: "Anchored", logs: receipt.logs });
  return { txHash: hash, blockNumber: Number(receipt.blockNumber), checkpointId: Number(log.args.id) };
}

const g = globalThis as unknown as { __orbitAnchor?: { inflight: Promise<Checkpoint> | null; timer: ReturnType<typeof setTimeout> | null; booted: boolean } };
const svc = () => (g.__orbitAnchor ??= { inflight: null, timer: null, booted: false });

/** Commit the current ledger root: on-chain when configured, otherwise as a local-only checkpoint. */
/** Below this balance, automatic anchoring pauses (manual anchoring still works). */
const MIN_AUTO_BALANCE_WEI = 20_000_000_000_000n; // 0.00002 ETH ≈ 40 anchors of headroom on Base Sepolia

export async function anchorWalletBalance(): Promise<bigint | null> {
  const cfg = chainConfig();
  if (!cfg?.privateKey) return null;
  const pub = createPublicClient({ chain: viemChain(cfg.network, cfg.rpc), transport: http(cfg.rpc) });
  return pub.getBalance({ address: privateKeyToAccount(cfg.privateKey).address });
}

export function anchorNow(opts: { auto?: boolean } = {}): Promise<Checkpoint> {
  const s = svc();
  if (s.inflight) return s.inflight;
  s.inflight = (async () => {
    if (opts.auto) {
      const bal = await anchorWalletBalance().catch(() => null);
      if (bal !== null && bal < MIN_AUTO_BALANCE_WEI) throw new OrbitError("Anchor wallet is low on testnet ETH; auto-anchoring paused until it is topped up", 503);
    }
    const db = getDb();
    if (db.tamper) throw new OrbitError("Restore the ledger before anchoring: refusing to anchor tampered history", 409);
    const covers = db.ledger.length;
    const root = prefixRoot(db, covers);
    const cfg = chainConfig();
    if (!cfg?.privateKey) {
      return mutate((tx) => recordCheckpoint(tx, { covers, merkleRoot: root, onChain: false, network: "local only (no chain configured)" }));
    }
    const r = await publishRoot(cfg, root, covers);
    return mutate((tx) =>
      recordCheckpoint(tx, {
        covers,
        merkleRoot: root,
        onChain: true,
        chainId: cfg.network.chainId,
        network: cfg.network.name,
        contract: cfg.address,
        checkpointId: r.checkpointId,
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

/** Debounced auto-anchoring: a burst of writes produces one transaction ~45 s after the last write. */
export function scheduleAnchor(delayMs = 45_000) {
  const cfg = chainConfig();
  if (!cfg?.privateKey || process.env.ORBIT_AUTO_ANCHOR === "0") return;
  const s = svc();
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    s.timer = null;
    anchorNow({ auto: true }).catch((e) => console.error("[orbit] auto-anchor skipped:", e instanceof Error ? e.message : e));
  }, delayMs);
}

/** On server start: make sure the current ledger has an on-chain checkpoint. */
export function bootAnchor() {
  const s = svc();
  if (s.booted) return;
  s.booted = true;
  const db = getDb();
  const last = [...db.checkpoints].reverse().find((c) => c.onChain);
  if (!last || last.covers < db.ledger.length - 1) scheduleAnchor(2_000);
}

export interface AnchorCheck {
  checkpoint: Checkpoint;
  status: "match" | "mismatch" | "unreachable" | "local";
  onChainRoot?: string;
  recomputedRoot: string;
  detail: string;
}

/** Compare the ledger as it is now against roots stored on-chain. Detects any rewrite of history. */
export async function checkAnchors(db: Db, limit = 4): Promise<AnchorCheck[]> {
  const cps = db.checkpoints.slice(-limit);
  return Promise.all(
    cps.map(async (cp): Promise<AnchorCheck> => {
      const recomputed = cp.covers <= db.ledger.length ? prefixRoot(db, cp.covers) : "";
      if (!cp.onChain || cp.checkpointId === undefined || !cp.contract) {
        return { checkpoint: cp, status: "local", recomputedRoot: recomputed, detail: "Local checkpoint only: not independently verifiable" };
      }
      const network = networkById(cp.chainId!);
      if (!network) return { checkpoint: cp, status: "unreachable", recomputedRoot: recomputed, detail: "Unknown network" };
      try {
        const cfg = chainConfig();
        const rpc = cfg && network.chainId === cfg.network.chainId ? cfg.rpc : undefined;
        const onChain = await readCheckpoint(network, cp.contract, cp.checkpointId, rpc);
        const ok = onChain.merkleRoot === recomputed && onChain.ledgerLength === cp.covers;
        return {
          checkpoint: cp,
          status: ok ? "match" : "mismatch",
          onChainRoot: onChain.merkleRoot,
          recomputedRoot: recomputed,
          detail: ok ? `Root of entries 0–${cp.covers - 1} matches ${network.name} checkpoint #${cp.checkpointId}` : `History changed after it was anchored: ${network.name} checkpoint #${cp.checkpointId} holds ${onChain.merkleRoot.slice(0, 12)}…, ledger now hashes to ${recomputed.slice(0, 12)}…`,
        };
      } catch (e) {
        return { checkpoint: cp, status: "unreachable", recomputedRoot: recomputed, detail: `Could not reach ${network.name}: ${e instanceof Error ? e.message.split("\n")[0] : "error"}` };
      }
    }),
  );
}
