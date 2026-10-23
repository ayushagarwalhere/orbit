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
  merkleRoot: string; // hex without 0x
  ledgerLength: number;
  timestamp: number;
}

export async function readCheckpoint(n: Network, address: string, id: number, rpcOverride?: string): Promise<OnChainCheckpoint> {
  const client = createPublicClient({ chain: viemChain(n, rpcOverride), transport: http(rpcOverride ?? n.rpc, { timeout: 10_000 }) });
  const [root, len, ts] = await client.readContract({ address: address as `0x${string}`, abi: ANCHOR_ABI, functionName: "checkpoints", args: [BigInt(id)] });
  return { merkleRoot: root.slice(2), ledgerLength: Number(len), timestamp: Number(ts) };
}
