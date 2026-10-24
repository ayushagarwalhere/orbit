import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";

// Pure crypto helpers. Runs identically in Node and in the browser verifier.

/** Deterministic JSON: object keys sorted, undefined dropped, no whitespace (JCS-style). */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(backend.sha256(typeof input === "string" ? utf8ToBytes(input) : input));
}

export function hashObject(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

// ---------- Ed25519 keys ----------

export function randomPrivateKey(): string {
  return bytesToHex(randomBytes(32));
}

export function publicKeyOf(privateKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(privateKeyHex)));
}

/**
 * Pluggable Ed25519 backend. Default: audited pure-JS @noble/curves (works everywhere, incl. the
 * browser verifier). Servers install Node's native implementation via crypto-node.ts, which is
 * ~100x faster. Ed25519 is deterministic (RFC 8032), so both produce byte-identical signatures.
 */
export interface Ed25519Backend {
  sign(hashHex: string, privateKeyHex: string): string;
  verify(hashHex: string, signatureHex: string, publicKeyHex: string): boolean;
  sha256(data: Uint8Array): Uint8Array;
}

const nobleBackend: Ed25519Backend = {
  sign: (h, k) => bytesToHex(ed25519.sign(hexToBytes(h), hexToBytes(k))),
  verify: (h, sig, pk) => {
    try {
      // Strict RFC 8032 (zip215: false) so the browser accepts exactly what OpenSSL accepts.
      return ed25519.verify(hexToBytes(sig), hexToBytes(h), hexToBytes(pk), { zip215: false });
    } catch {
      return false;
    }
  },
  sha256: (d) => sha256(d),
};
let backend: Ed25519Backend = nobleBackend;

export function setEd25519Backend(b: Ed25519Backend) {
  backend = b;
}

export function signHash(hashHex: string, privateKeyHex: string): string {
  return backend.sign(hashHex, privateKeyHex);
}

export function verifySignature(hashHex: string, signatureHex: string, publicKeyHex: string): boolean {
  return backend.verify(hashHex, signatureHex, publicKeyHex);
}

// ---------- Merkle tree ----------
// parent = sha256(left || right) over raw 32-byte values, so the Solidity contract can verify
// proofs with sha256(abi.encodePacked(a, b)). Odd nodes are paired with themselves.

function parentBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  return backend.sha256(concatBytes(left, right));
}

function parent(left: string, right: string): string {
  return bytesToHex(parentBytes(hexToBytes(left), hexToBytes(right)));
}

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "0".repeat(64);
  let level = leaves.map(hexToBytes);
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(parentBytes(level[i], level[i + 1] ?? level[i]));
    level = next;
  }
  return bytesToHex(level[0]);
}

/**
 * Append-only Merkle tree with the same shape as merkleRoot(). Appending a leaf recomputes only
 * the right edge, so keeping the root current costs O(log n) per ledger entry instead of O(n).
 */
export class IncrementalMerkle {
  private levels: Uint8Array[][] = [];
  get size() {
    return this.levels[0]?.length ?? 0;
  }
  append(leafHex: string) {
    if (!this.levels.length) this.levels.push([]);
    this.levels[0].push(hexToBytes(leafHex));
    for (let l = 0; this.levels[l].length > 1; l++) {
      const row = this.levels[l];
      const pi = (row.length - 1) >> 1;
      const left = row[2 * pi];
      const up = (this.levels[l + 1] ??= []);
      up[pi] = parentBytes(left, row[2 * pi + 1] ?? left);
      up.length = pi + 1;
    }
  }
  root(): string {
    if (!this.levels.length) return "0".repeat(64);
    return bytesToHex(this.levels[this.levels.length - 1][0]);
  }
}

export interface ProofStep {
  sibling: string;
  left: boolean; // sibling sits on the left
}

export function merkleProof(leaves: string[], index: number): ProofStep[] {
  const proof: ProofStep[] = [];
  let level = leaves.slice();
  let i = index;
  while (level.length > 1) {
    const isRight = i % 2 === 1;
    const siblingIndex = isRight ? i - 1 : i + 1;
    proof.push({ sibling: level[siblingIndex] ?? level[i], left: isRight });
    const next: string[] = [];
    for (let j = 0; j < level.length; j += 2) next.push(parent(level[j], level[j + 1] ?? level[j]));
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}

export function rootFromProof(leaf: string, proof: ProofStep[]): string {
  let h = leaf;
  for (const p of proof) h = p.left ? parent(p.sibling, h) : parent(h, p.sibling);
  return h;
}

export function verifyMerkleProof(leaf: string, proof: ProofStep[], root: string): boolean {
  return rootFromProof(leaf, proof) === root;
}
