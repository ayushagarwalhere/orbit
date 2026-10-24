import assert from "node:assert/strict";
import { test } from "node:test";
import "../src/lib/crypto-node.ts";
import { MerkleTree, merkleRoot, sha256Hex, verifyConsistency, verifyInclusion } from "../src/lib/crypto.ts";

const leaves = (n: number, salt = "") => Array.from({ length: n }, (_, i) => sha256Hex(`${salt}leaf-${i}`));

test("RFC 6962: every inclusion proof verifies for every size up to 70, and forgeries fail", () => {
  for (let n = 1; n <= 70; n++) {
    const L = leaves(n);
    const t = new MerkleTree(L);
    const root = t.root();
    assert.equal(root, merkleRoot(L));
    for (let m = 0; m < n; m++) {
      const path = t.inclusionProof(m);
      assert.ok(verifyInclusion(L[m], m, n, path, root), `n=${n} m=${m}`);
      if (n > 1) assert.equal(verifyInclusion(L[m], (m + 1) % n, n, path, root), false, "wrong index");
      assert.equal(verifyInclusion(sha256Hex("x"), m, n, path, root), false, "wrong leaf");
      if (path.length) assert.equal(verifyInclusion(L[m], m, n, [sha256Hex("y"), ...path.slice(1)], root), false, "tampered path");
      // Note: the size is bound by the checkpoint, which stores (root, size) together, as in RFC 9162.
      if (m === n - 1 && n > 1) assert.equal(verifyInclusion(L[m], m, n - 1, path, root), false, "index beyond size");
    }
  }
});

test("RFC 6962: every consistency proof verifies for every pair of sizes up to 50, and rewrites fail", () => {
  for (let n = 1; n <= 50; n++) {
    const L = leaves(n);
    const t = new MerkleTree(L);
    for (let m = 1; m <= n; m++) {
      const proof = t.consistencyProof(m);
      assert.ok(verifyConsistency(m, n, t.root(m), t.root(), proof), `m=${m} n=${n}`);
      if (m < n) {
        // A different history of the same old size must not be provably consistent.
        const forged = new MerkleTree([...leaves(m, "forged-"), ...L.slice(m)]);
        assert.equal(verifyConsistency(m, n, forged.root(m), t.root(), proof), false);
        assert.equal(verifyConsistency(m, n, t.root(m), forged.root(), proof), false);
      }
    }
  }
});

test("roots of earlier sizes equal the root of a fresh tree over that prefix", () => {
  const L = leaves(37);
  const t = new MerkleTree(L);
  for (let k = 1; k <= 37; k++) assert.equal(t.root(k), merkleRoot(L.slice(0, k)));
});

test("a leaf can never be passed off as an internal node (domain separation)", () => {
  const L = leaves(4);
  const t = new MerkleTree(L);
  // In an undomained tree, the concatenation of two leaf hashes could be presented as one leaf.
  assert.equal(verifyInclusion(t.root(2), 0, 3, t.inclusionProof(2, 3).slice(0, 1), t.root(3)), false);
});
