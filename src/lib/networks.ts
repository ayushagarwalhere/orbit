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
 * Trust roots, pinned in code (the browser verifier never takes them from a passport or the server):
 *  - contract: Orbit's published OrbitAnchor deployment
 *  - operator: Orbit's anchoring wallet; a passport's checkpoint must be submitted by it
 *  - witnesses: named parties whose own roots must also be consistent with history.
 * Anyone else can anchor too (the contract is open), but unknown submitters are informational only,
 * so a junk anchor can neither forge a passport nor grief verification.
 */
export interface TrustedDeployment {
  contract: string;
  operator: string;
  witnesses: { address: string; name: string }[];
}
export const OFFICIAL_ANCHORS: Record<number, TrustedDeployment> = {
  84532: {
    contract: "0x8a9bd10b411a5509916dbe812fd803611c2f9151", // Base Sepolia, OrbitAnchor v3 (source verified on Sourcify)
    operator: "0xC1eE3bE7FD0e5f10Db6eAbe0967BE354ec8054e6",
    witnesses: [{ address: "0x1eb7f4057C3689F790D3Bc69C69c9F1Fe58770Cd", name: "Demo witness (a second wallet run by the Orbit team to show the role)" }],
  },
};

export type SubmitterRole = "operator" | "witness" | "unidentified";
export function submitterRole(chainId: number | undefined, submitter: string, operatorFallback?: string): { role: SubmitterRole; name: string } {
  return classifySubmitter(chainId !== undefined ? OFFICIAL_ANCHORS[chainId] : undefined, submitter, operatorFallback);
}

export function classifySubmitter(t: TrustedDeployment | undefined, submitter: string, operatorFallback?: string): { role: SubmitterRole; name: string } {
  const a = submitter.toLowerCase();
  if ((t?.operator ?? operatorFallback)?.toLowerCase() === a) return { role: "operator", name: "Orbit operator" };
  const w = t?.witnesses.find((x) => x.address.toLowerCase() === a);
  if (w) return { role: "witness", name: w.name };
  return { role: "unidentified", name: `unidentified ${submitter.slice(0, 6)}…${submitter.slice(-4)}` };
}

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

const CHECKPOINT_TUPLE = [
  { name: "ledgerId", type: "bytes32" },
  { name: "merkleRoot", type: "bytes32" },
  { name: "ledgerLength", type: "uint64" },
  { name: "timestamp", type: "uint64" },
  { name: "submitter", type: "address" },
] as const;

export const ANCHOR_ABI = [
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ledgerId", type: "bytes32" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "ledgerLength", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  { type: "function", name: "checkpoints", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: CHECKPOINT_TUPLE },
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "countFor", stateMutability: "view", inputs: [{ name: "ledgerId", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "checkpointsFor",
    stateMutability: "view",
    inputs: [
      { name: "ledgerId", type: "bytes32" },
      { name: "from", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
    outputs: [
      { name: "ids", type: "uint256[]" },
      { name: "cps", type: "tuple[]", components: CHECKPOINT_TUPLE },
    ],
  },
  {
    type: "function",
    name: "verifyInclusion",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "entryHash", type: "bytes32" },
      { name: "index", type: "uint256" },
      { name: "path", type: "bytes32[]" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "verifyConsistency",
    stateMutability: "view",
    inputs: [
      { name: "older", type: "uint256" },
      { name: "newer", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  { type: "function", name: "operator", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "event",
    name: "Anchored",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "ledgerId", type: "bytes32", indexed: true },
      { name: "submitter", type: "address", indexed: true },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "ledgerLength", type: "uint64", indexed: false },
    ],
  },
] as const;
