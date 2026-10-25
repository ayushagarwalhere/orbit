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

/** The contract's own proof checks, called read-only (eth_call): free, no wallet. */
export function contractVerifier(n: Network, address: string, rpcOverride?: string) {
  const c = client(n, rpcOverride);
  const addr = address as `0x${string}`;
  const h = (x: string) => `0x${x}` as `0x${string}`;
  return {
    verifyInclusion: (checkpointId: number, entryHash: string, index: number, path: string[]) =>
      c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "verifyInclusion", args: [BigInt(checkpointId), h(entryHash), BigInt(index), path.map(h)] }),
    verifyConsistency: (older: number, newer: number, proof: string[]) =>
      c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "verifyConsistency", args: [BigInt(older), BigInt(newer), proof.map(h)] }),
  };
}

/** Every checkpoint anyone has published for one ledger (oldest first), read in pages of 200. */
export async function readLedgerCheckpoints(n: Network, address: string, ledgerId: string, rpcOverride?: string): Promise<{ operator: string; checkpoints: OnChainCheckpoint[] }> {
  const c = client(n, rpcOverride);
  const addr = address as `0x${string}`;
  const lid = `0x${ledgerId}` as `0x${string}`;
  const [total, operator] = await Promise.all([
    c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "countFor", args: [lid] }),
    c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "operator" }),
  ]);
  const out: OnChainCheckpoint[] = [];
  for (let from = 0; from < Number(total); from += 200) {
    const [ids, cps] = await c.readContract({ address: addr, abi: ANCHOR_ABI, functionName: "checkpointsFor", args: [lid, BigInt(from), 200n] });
    cps.forEach((cp, i) =>
      out.push({ id: Number(ids[i]), ledgerId: cp.ledgerId.slice(2), merkleRoot: cp.merkleRoot.slice(2), ledgerLength: Number(cp.ledgerLength), timestamp: Number(cp.timestamp), submitter: cp.submitter }),
    );
  }
  return { operator, checkpoints: out };
}
