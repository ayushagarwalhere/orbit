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

// ---------- Merkle tree: RFC 6962 / RFC 9162 (Certificate Transparency) ----------
// leaf = SHA-256(0x00 || entryHash), node = SHA-256(0x01 || left || right); the split point is the
// largest power of two below the size. Domain separation stops a node being passed off as a leaf,
// inclusion proofs are bound to (index, tree size), and consistency proofs show that a later root
// only appends to an earlier one. OrbitAnchor.sol verifies the same proofs natively.

const LEAF = new Uint8Array([0]);
const NODE = new Uint8Array([1]);

function leafBytes(entryHash: Uint8Array): Uint8Array {
  return backend.sha256(concatBytes(LEAF, entryHash));
}
function nodeBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  return backend.sha256(concatBytes(NODE, left, right));
}
const largestPow2Below = (n: number) => {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
};
const EMPTY_ROOT = () => bytesToHex(backend.sha256(new Uint8Array()));

export function leafHash(entryHashHex: string): string {
  return bytesToHex(leafBytes(hexToBytes(entryHashHex)));
}

/**
 * Append-only RFC 6962 tree. Complete power-of-two subtrees are cached as leaves arrive, so any
 * root, inclusion proof or consistency proof costs O(log² n) and appending costs O(log n).
 */
export class MerkleTree {
  private levels: Uint8Array[][] = [[]]; // levels[h][i] = root of the complete subtree of 2^h leaves at i·2^h

  constructor(entryHashes: string[] = []) {
    for (const h of entryHashes) this.append(h);
  }
  get size(): number {
    return this.levels[0].length;
  }
  append(entryHashHex: string) {
    let idx = this.levels[0].length;
    this.levels[0].push(leafBytes(hexToBytes(entryHashHex)));
    for (let h = 0; idx & 1; h++) {
      const up = (this.levels[h + 1] ??= []);
      up[idx >> 1] = nodeBytes(this.levels[h][idx - 1], this.levels[h][idx]);
      idx >>= 1;
    }
  }
  /** MTH(D[start : start+size]) */
  private sub(start: number, size: number): Uint8Array {
    if (size === 1) return this.levels[0][start];
    if ((size & (size - 1)) === 0 && start % size === 0) {
      const h = Math.log2(size);
      const cached = this.levels[h]?.[start / size];
      if (cached) return cached;
    }
    const k = largestPow2Below(size);
    return nodeBytes(this.sub(start, k), this.sub(start + k, size - k));
  }
  root(n = this.size): string {
    if (n < 0 || n > this.size) throw new Error("tree size out of range");
    return n === 0 ? EMPTY_ROOT() : bytesToHex(this.sub(0, n));
  }
  /** Audit path for leaf m in the tree of the first n leaves (RFC 9162 §2.1.3.1), leaf to root. */
  inclusionProof(m: number, n = this.size): string[] {
    if (m < 0 || m >= n || n > this.size) throw new Error("index out of range");
    const out: Uint8Array[] = [];
    const path = (m: number, start: number, size: number) => {
      if (size === 1) return;
      const k = largestPow2Below(size);
      if (m < k) {
        path(m, start, k);
        out.push(this.sub(start + k, size - k));
      } else {
        path(m - k, start + k, size - k);
        out.push(this.sub(start, k));
      }
    };
    path(m, 0, n);
    return out.map(bytesToHex);
  }
  /** Proof that the first m leaves are a prefix of the first n (RFC 9162 §2.1.4.1). */
  consistencyProof(m: number, n = this.size): string[] {
    if (m < 1 || m > n || n > this.size) throw new Error("sizes out of range");
    const out: Uint8Array[] = [];
    const subproof = (m: number, start: number, size: number, b: boolean) => {
      if (m === size) {
        if (!b) out.push(this.sub(start, size));
        return;
      }
      const k = largestPow2Below(size);
      if (m <= k) {
        subproof(m, start, k, b);
        out.push(this.sub(start + k, size - k));
      } else {
        subproof(m - k, start + k, size - k, false);
        out.push(this.sub(start, k));
      }
    };
    subproof(m, 0, n, true);
    return out.map(bytesToHex);
  }
}

export function merkleRoot(entryHashes: string[]): string {
  return new MerkleTree(entryHashes).root();
}

/** RFC 9162 §2.1.3.2: does `entryHash` sit at `index` in the tree of `size` leaves with this root? */
export function verifyInclusion(entryHashHex: string, index: number, size: number, path: string[], rootHex: string): boolean {
  if (!(index >= 0 && index < size)) return false;
  let fn = index;
  let sn = size - 1;
  let r = leafBytes(hexToBytes(entryHashHex));
  for (const p of path) {
    if (sn === 0) return false;
    const pb = hexToBytes(p);
    if (fn % 2 === 1 || fn === sn) {
      r = nodeBytes(pb, r);
      if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      r = nodeBytes(r, pb);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && bytesToHex(r) === rootHex;
}

/** RFC 9162 §2.1.4.2: is the tree of size `m` with `rootM` a prefix of the tree of size `n` with `rootN`? */
export function verifyConsistency(m: number, n: number, rootM: string, rootN: string, proof: string[]): boolean {
  if (!(m >= 1 && m <= n)) return false;
  if (m === n) return proof.length === 0 && rootM === rootN;
  const p = (m & (m - 1)) === 0 ? [rootM, ...proof] : proof.slice();
  if (!p.length) return false;
  let fn = m - 1;
  let sn = n - 1;
  while (fn % 2 === 1) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  let fr = hexToBytes(p[0]);
  let sr = hexToBytes(p[0]);
  for (const c of p.slice(1)) {
    if (sn === 0) return false;
    const cb = hexToBytes(c);
    if (fn % 2 === 1 || fn === sn) {
      fr = nodeBytes(cb, fr);
      sr = nodeBytes(cb, sr);
      if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else {
      sr = nodeBytes(sr, cb);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && bytesToHex(fr) === rootM && bytesToHex(sr) === rootN;
}
