// Read-only access to OrbitAnchor. Safe in the browser: no keys, public RPC only.
import { createPublicClient, defineChain, http, type Chain } from "viem";
import { ANCHOR_ABI, type Network } from "./networks.ts";

export function viemChain(n: Network, rpcOverride?: string): Chain {
  const rpc = rpcOverride ?? n.rpc;
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: { name: n.key === "polygon-amoy" ? "POL" : "Ether", symbol: n.key === "polygon-amoy" ? "POL" : "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
}

export interface OnChainCheckpoint {
  id: number;
  ledgerId: string; // hex without 0x
  merkleRoot: string; // hex without 0x
  ledgerLength: number;
  timestamp: number;
  submitter: string;
}

function client(n: Network, rpcOverride?: string) {
  return createPublicClient({ chain: viemChain(n, rpcOverride), transport: http(rpcOverride ?? n.rpc, { timeout: 10_000 }) });
}

export async function readCheckpoint(n: Network, address: string, id: number, rpcOverride?: string): Promise<OnChainCheckpoint> {
  const [ledgerId, root, len, ts, submitter] = await client(n, rpcOverride).readContract({ address: address as `0x${string}`, abi: ANCHOR_ABI, functionName: "checkpoints", args: [BigInt(id)] });
  return { id, ledgerId: ledgerId.slice(2), merkleRoot: root.slice(2), ledgerLength: Number(len), timestamp: Number(ts), submitter };
}

/** The most recent checkpoints anyone has published for one ledger, newest last. */
export async function readLedgerCheckpoints(n: Network, address: string, ledgerId: string, limit = 6, rpcOverride?: string): Promise<{ operator: string; checkpoints: OnChainCheckpoint[] }> {
  const c = client(n, rpcOverride);
  const addr = address as `0x${string}`;
  const lid = `0x${ledgerId}` as `0x${string}`;
  const [total, operator] = await Promise.all([
    c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "countFor", args: [lid] }),
    c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "operator" }),
  ]);
  const n0 = Math.max(0, Number(total) - limit);
  const out = await Promise.all(
    Array.from({ length: Number(total) - n0 }, (_, k) =>
      c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "checkpointFor", args: [lid, BigInt(n0 + k)] }).then(([id, cp]) => ({
        id: Number(id),
        ledgerId: cp.ledgerId.slice(2),
        merkleRoot: cp.merkleRoot.slice(2),
        ledgerLength: Number(cp.ledgerLength),
        timestamp: Number(cp.timestamp),
        submitter: cp.submitter,
      })),
    ),
  );
  return { operator, checkpoints: out };
}
