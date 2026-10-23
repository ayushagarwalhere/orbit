// Public networks the anchor can live on. Shared by the server and the browser verifier, so the
// verifier reads the chain through a public RPC it chose itself, not through Orbit's server.

export interface Network {
  key: string;
  chainId: number;
  name: string;
  rpc: string;
  explorer: string;
}

export const NETWORKS: Network[] = [
  { key: "base-sepolia", chainId: 84532, name: "Base Sepolia", rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
  { key: "sepolia", chainId: 11155111, name: "Ethereum Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io" },
  { key: "polygon-amoy", chainId: 80002, name: "Polygon Amoy", rpc: "https://rpc-amoy.polygon.technology", explorer: "https://amoy.polygonscan.com" },
  { key: "localhost", chainId: 31337, name: "Local Hardhat", rpc: "http://127.0.0.1:8545", explorer: "" },
];

/**
 * Orbit's published OrbitAnchor deployments. The verifier reads roots ONLY from these addresses,
 * never from an address supplied inside a passport, so a forged passport can't point it at a
 * contract its forger controls.
 */
export const OFFICIAL_ANCHORS: Record<number, string> = {
  84532: "0x9735e3824f7dafb5d2302ed4796c644534688a06", // Base Sepolia
};

export function networkByKey(key: string): Network | undefined {
  return NETWORKS.find((n) => n.key === key);
}

export function networkById(chainId: number): Network | undefined {
  return NETWORKS.find((n) => n.chainId === chainId);
}

export function txUrl(n: Network | undefined, hash?: string) {
  return n?.explorer && hash ? `${n.explorer}/tx/${hash}` : undefined;
}

export function addressUrl(n: Network | undefined, address?: string) {
  return n?.explorer && address ? `${n.explorer}/address/${address}` : undefined;
}

export const ANCHOR_ABI = [
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "merkleRoot", type: "bytes32" },
      { name: "ledgerLength", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "checkpoints",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "merkleRoot", type: "bytes32" },
      { name: "ledgerLength", type: "uint64" },
      { name: "timestamp", type: "uint64" },
    ],
  },
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "operator", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "event",
    name: "Anchored",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "merkleRoot", type: "bytes32", indexed: true },
      { name: "ledgerLength", type: "uint64", indexed: false },
    ],
  },
] as const;
