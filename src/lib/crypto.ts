import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

/** Deterministic JSON: object keys sorted, no whitespace. Same input -> same hash everywhere. */
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
  return bytesToHex(sha256(typeof input === "string" ? utf8ToBytes(input) : input));
}

export function hashObject(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

/**
 * Demo key custody: keys are derived from the actor id so the demo is reproducible.
 * In production each actor holds its own key (wallet / HSM / DID) and Orbit only stores public keys.
 */
export function demoPrivateKey(actorId: string): Uint8Array {
  return sha256(utf8ToBytes(`orbit-demo-key:${actorId}`));
}

export function publicKeyFor(actorId: string): string {
  return bytesToHex(ed25519.getPublicKey(demoPrivateKey(actorId)));
}

export function signHash(hashHex: string, actorId: string): string {
  return bytesToHex(ed25519.sign(hexToBytes(hashHex), demoPrivateKey(actorId)));
}

export function verifySignature(hashHex: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), hexToBytes(hashHex), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

/** Binary Merkle root over hex leaves (last leaf duplicated on odd levels, Bitcoin-style). */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("");
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

/** Merkle inclusion proof: sibling hashes from leaf up to root. */
export function merkleProof(leaves: string[], index: number): { sibling: string; left: boolean }[] {
  const proof: { sibling: string; left: boolean }[] = [];
  let level = leaves.slice();
  let i = index;
  while (level.length > 1) {
    const isRight = i % 2 === 1;
    const siblingIndex = isRight ? i - 1 : i + 1;
    proof.push({ sibling: level[siblingIndex] ?? level[i], left: isRight });
    const next: string[] = [];
    for (let j = 0; j < level.length; j += 2) next.push(sha256Hex(level[j] + (level[j + 1] ?? level[j])));
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyMerkleProof(leaf: string, proof: { sibling: string; left: boolean }[], root: string): boolean {
  let h = leaf;
  for (const p of proof) h = p.left ? sha256Hex(p.sibling + h) : sha256Hex(h + p.sibling);
  return h === root;
}
