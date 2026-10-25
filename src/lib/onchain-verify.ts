// Asks the deployed OrbitAnchor contract itself to check a passport's proofs.
// The browser builds RFC 6962 proofs from the downloaded ledger; the contract's own Solidity code
// (verifyInclusion / verifyConsistency) decides whether they hold against the roots it stores.
// These are read-only calls: free, no wallet, no transaction.
import type { OnChainCheckpoint } from "./anchor-read.ts";
import { MerkleTree, sha256Hex } from "./crypto.ts";
import type { Check } from "./passport-verify.ts";
import type { LedgerEntry } from "./types.ts";

export interface ContractVerifier {
  verifyInclusion(checkpointId: number, entryHash: string, index: number, path: string[]): Promise<boolean>;
  verifyConsistency(older: number, newer: number, proof: string[]): Promise<boolean>;
}

export interface ContractCheckInput {
  /** The ledger as served by any node. Not trusted: the contract rejects proofs built from a rewritten one. */
  ledger: LedgerEntry[];
  /** The passport's checkpoint, read from the chain. */
  checkpoint: OnChainCheckpoint;
  /** Checkpoints by trusted submitters (operator and named witnesses) for this ledger. */
  trusted: OnChainCheckpoint[];
  /** Ledger indexes of the passport's events. */
  eventIndexes: number[];
  contract: ContractVerifier;
  /** Cap on inclusion calls, to stay polite to public RPCs. */
  maxEvents?: number;
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function contractChecks(input: ContractCheckInput): Promise<Check[]> {
  const { ledger, checkpoint: cp, contract } = input;
  const out: Check[] = [];
  if (cp.ledgerLength > ledger.length) {
    return [{ label: "Contract: inclusion", ok: false, detail: `The node served ${ledger.length} entries but checkpoint #${cp.id} covers ${cp.ledgerLength}: events withheld` }];
  }
  const tree = new MerkleTree(ledger.map((e) => e.hash));

  // 1. Each passport event is a leaf of the anchored tree, at the index it claims.
  const indexes = [...new Set(input.eventIndexes)].filter((i) => i >= 0 && i < cp.ledgerLength).sort((a, b) => a - b).slice(0, input.maxEvents ?? 40);
  const results = await inBatches(indexes, 8, async (i) => ({ i, ok: await contract.verifyInclusion(cp.id, ledger[i].hash, i, tree.inclusionProof(i, cp.ledgerLength)) }));
  const failed = results.filter((r) => !r.ok).map((r) => `#${r.i}`);
  out.push({
    label: "Contract: events are in the anchored ledger",
    ok: indexes.length > 0 && failed.length === 0,
    detail: !indexes.length
      ? "No passport events fall inside this checkpoint"
      : failed.length
        ? `OrbitAnchor.verifyInclusion returned false for ${failed.join(", ")}: these entries are not what was anchored`
        : `OrbitAnchor.verifyInclusion returned true for all ${indexes.length} events against checkpoint #${cp.id}`,
  });

  // 2. Control: the same call with a forged entry must fail, so the "true" above means something.
  if (indexes.length) {
    const i = indexes[0];
    const forged = sha256Hex(`forged:${ledger[i].hash}`);
    const accepted = await contract.verifyInclusion(cp.id, forged, i, tree.inclusionProof(i, cp.ledgerLength));
    out.push({
      label: "Contract: rejects a forged entry",
      ok: !accepted,
      detail: accepted ? "The contract accepted a forged entry hash: its proof check is broken" : `Same call with entry #${i} swapped for a forged hash returned false`,
    });
  }

  // 3. Every trusted checkpoint extends the one before it: a chain of on-chain consistency proofs.
  const usable = [...new Map([...input.trusted, cp].map((c) => [c.id, c])).values()]
    .filter((c) => c.ledgerLength <= ledger.length)
    .sort((a, b) => a.ledgerLength - b.ledgerLength || a.id - b.id);
  if (usable.length < 2) {
    out.push({ label: "Contract: append-only history", ok: "warn", detail: "Only one trusted checkpoint so far, so there is nothing to compare yet" });
    return out;
  }
  const pairs = usable.slice(1).map((b, k) => [usable[k], b] as const);
  const consistent = await inBatches(pairs, 6, async ([a, b]) => ({
    a,
    b,
    ok: await contract.verifyConsistency(a.id, b.id, a.ledgerLength === b.ledgerLength ? [] : tree.consistencyProof(a.ledgerLength, b.ledgerLength)),
  }));
  const broken = consistent.find((r) => !r.ok);
  out.push({
    label: "Contract: append-only history",
    ok: !broken,
    detail: broken
      ? `OrbitAnchor.verifyConsistency(#${broken.a.id}, #${broken.b.id}) returned false: the served ledger rewrites history that was already anchored`
      : `OrbitAnchor.verifyConsistency returned true for ${pairs.length} consecutive pair${pairs.length === 1 ? "" : "s"}: ${usable.length} trusted checkpoints (${usable[0].ledgerLength} → ${usable[usable.length - 1].ledgerLength} entries) form one append-only history`,
  });
  return out;
}
