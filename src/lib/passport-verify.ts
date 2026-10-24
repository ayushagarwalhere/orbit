// Independent passport verification. Runs in the browser (and in tests) with nothing from Orbit's
// server except the passport document and consistency proofs that are checked against on-chain
// roots. Trust roots (contract, operator, witnesses) are pinned in code, never taken from the
// document. It re-derives every claim verdict from the proven events instead of trusting the grade.
import type { OnChainCheckpoint } from "./anchor-read.ts";
import { PROTOCOL_ID, authMismatch, verifyRequest } from "./auth.ts";
import { hashObject, verifyConsistency, verifyInclusion, verifySignature } from "./crypto.ts";
import { hashEntry } from "./ledger.ts";
import { classifySubmitter, type TrustedDeployment } from "./networks.ts";
import { emptyDb } from "./replay.ts";
import type { Batch, Claim, Db, LedgerEntry, Material, Product } from "./types.ts";
import { evaluateClaim } from "./verify.ts";

export interface Check {
  label: string;
  ok: boolean | "warn";
  detail: string;
  link?: string;
}

export interface ChainReader {
  checkpoint(id: number): Promise<OnChainCheckpoint>;
  ledgerCheckpoints(ledgerId: string): Promise<{ operator: string; checkpoints: OnChainCheckpoint[] }>;
  consistency(m: number, n: number): Promise<string[]>;
}

type ProvenEntry = LedgerEntry & { merkleProof: { index: number; size: number; path: string[] } | null };
const SKEW_MS = 5 * 60 * 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Rebuild just enough state from the passport's own (proven) events to re-run the claim rules. */
export function dbFromPassport(doc: any): { db: Db; product: Product; claims: Claim[] } {
  const subj = doc.credentialSubject;
  const db = emptyDb();
  for (const e of subj.actorRegistrations as LedgerEntry[]) {
    db.actors.push({ id: e.subjectId, name: String(e.data.name), role: e.data.role as any, place: e.place!, publicKey: String(e.data.publicKey), description: "" });
  }
  const events = [...(subj.traceabilityEvents as LedgerEntry[])].sort((a, b) => a.index - b.index);
  for (const e of events) {
    if (e.type !== "BATCH_CREATED") continue;
    db.batches.push({
      id: e.subjectId,
      material: e.data.material as Material,
      massKg: Number(e.data.massKg),
      recycledKg: Number(e.data.recycledKg),
      producerId: e.actorId,
      place: e.place!,
      createdAt: e.timestamp,
      sourceProductIds: (e.data.sourceProductIds as string[]) ?? [],
    } satisfies Batch);
  }
  db.ledger = events;
  const core = subj.passportCore;
  const product: Product = { ...core, emoji: subj.product.emoji ?? "", description: subj.product.description ?? "", endOfLife: subj.product.endOfLife ?? "", createdAt: subj.product.createdAt ?? "" };
  db.products.push(product);
  const claims: Claim[] = (subj.conformityClaims as any[]).map((c) => ({
    id: c.id,
    productId: c.productId,
    kind: c.kind,
    statement: c.statement,
    value: c.value,
    issuerId: c.issuerId,
    evidenceHash: c.evidenceHash ?? undefined,
    createdAt: c.createdAt,
  }));
  db.claims.push(...claims);
  return { db, product, claims };
}

export async function verifyPassport(doc: any, opts: { trusted?: TrustedDeployment; chainId?: number; chain?: ChainReader; explorer?: (tx: string) => string | undefined }, onProgress?: (c: Check[]) => void): Promise<Check[]> {
  const out: Check[] = [];
  const push = (c: Check) => {
    out.push(c);
    onProgress?.([...out]);
  };
  const subj = doc?.credentialSubject;
  if (!subj) return [{ label: "Document", ok: false, detail: "Not an Orbit passport (missing credentialSubject)" }];
  const anchor = doc.proof?.anchor;
  const regs: ProvenEntry[] = subj.actorRegistrations ?? [];
  const events: ProvenEntry[] = subj.traceabilityEvents ?? [];

  // 1. Keys only from self-signed registration entries.
  const keys = new Map<string, string>();
  for (const e of regs) {
    const pk = String(e.data?.publicKey);
    const ok = hashEntry(e) === e.hash && !!e.auth && verifyRequest(e.auth, pk) && !authMismatch(e);
    if (ok) keys.set(e.subjectId, pk);
    push({ label: `Key of ${e.subjectId}`, ok, detail: ok ? `registered at #${e.index}, self-signed · ${pk.slice(0, 16)}…` : "registration entry is invalid" });
  }
  const seq = keys.get(PROTOCOL_ID);

  // 2. The passport record is the one committed at manufacture.
  const recomputed = hashObject(subj.passportCore);
  const made = events.find((e) => e.type === "MANUFACTURED");
  push({ label: "Passport record", ok: !!made && recomputed === subj.passportHash && made.data?.passportHash === recomputed, detail: `sha256(bill of materials…) = ${recomputed.slice(0, 16)}…, committed by MANUFACTURED #${made?.index}` });

  // 3. Every event: content hash, sequencer signature, the actor's own instruction, its binding and time.
  for (const e of events) {
    const hashOk = hashEntry(e) === e.hash;
    const seqOk = !!seq && verifySignature(e.hash, e.signature, seq);
    const signer = e.auth?.request.actorId;
    const signerKey = signer ? keys.get(signer) : undefined;
    const actorOk = !!e.auth && !!signerKey && verifyRequest(e.auth, signerKey);
    const mismatch = authMismatch(e);
    const skewOk = !e.auth || Math.abs(Date.parse(e.timestamp) - Date.parse(e.auth.request.issuedAt)) <= SKEW_MS;
    const ok = hashOk && seqOk && actorOk && !mismatch && skewOk;
    push({
      label: `#${e.index} ${e.type}`,
      ok,
      detail: !hashOk
        ? "content does not match its hash"
        : !seqOk
          ? "sequencer signature invalid"
          : !actorOk
            ? `no valid instruction signed by ${signer ?? "anyone"}`
            : mismatch
              ? `differs from what ${signer} signed: ${mismatch}`
              : !skewOk
                ? "recorded time differs from the signed time"
                : e.actorId === PROTOCOL_ID
                  ? `protocol entry caused by ${signer}'s signed instruction`
                  : `${signer} signed this instruction · ${e.auth!.signature.slice(0, 14)}…`,
    });
  }

  // 4. Re-derive every claim verdict here, from the proven events (don't trust the server's grade).
  try {
    const { db, product, claims } = dbFromPassport(doc);
    for (const c of claims) {
      const mine = evaluateClaim(db, c, product).status;
      const theirs = (subj.conformityClaims as any[]).find((x) => x.id === c.id)?.status;
      push({ label: `Verdict ${c.id} (${c.kind.toLowerCase().replace("_", " ")})`, ok: mine === theirs, detail: mine === theirs ? `re-derived in your browser: ${mine}` : `server says ${theirs}, but the proven events give ${mine}` });
    }
  } catch (err) {
    push({ label: "Claim verdicts", ok: false, detail: `could not re-derive: ${err instanceof Error ? err.message : String(err)}` });
  }

  // 5. Anchoring: the checkpoint must be on Orbit's pinned contract and submitted by Orbit's pinned operator.
  if (!anchor?.onChain || !opts.chain || !opts.trusted) {
    push({ label: "On-chain anchor", ok: "warn", detail: anchor?.onChain ? "No pinned deployment for this network" : "Checkpoint is local only; it cannot be independently timestamped" });
    return out;
  }
  if (String(anchor.contract).toLowerCase() !== opts.trusted.contract.toLowerCase()) {
    push({ label: "Anchor contract", ok: false, detail: `Passport points to ${anchor.contract}, not Orbit's published OrbitAnchor ${opts.trusted.contract}` });
    return out;
  }
  let cp: OnChainCheckpoint;
  try {
    cp = await opts.chain.checkpoint(Number(anchor.checkpointId));
  } catch (e) {
    push({ label: "On-chain anchor", ok: "warn", detail: `Could not reach the chain: ${e instanceof Error ? e.message.split("\n")[0] : "error"}` });
    return out;
  }
  const by = classifySubmitter(opts.trusted, cp.submitter);
  const anchorOk = by.role === "operator" && cp.merkleRoot === anchor.merkleRoot && cp.ledgerLength === anchor.covers && cp.ledgerId === anchor.ledgerId;
  push({
    label: "On-chain checkpoint",
    ok: anchorOk,
    detail: anchorOk
      ? `#${cp.id} by Orbit's pinned operator: ${cp.ledgerLength} entries, root ${cp.merkleRoot.slice(0, 16)}…, ${new Date(cp.timestamp * 1000).toUTCString()}`
      : by.role !== "operator"
        ? `checkpoint #${cp.id} was submitted by ${by.name}, not Orbit's pinned operator`
        : `chain holds root ${cp.merkleRoot.slice(0, 12)}… for ${cp.ledgerLength} entries; passport claims ${String(anchor.merkleRoot).slice(0, 12)}… for ${anchor.covers}`,
    link: anchor.txHash ? opts.explorer?.(anchor.txHash) : undefined,
  });
  if (!anchorOk) return out;

  // 6. Every event and key registration is included in that on-chain root (RFC 6962, index- and size-bound).
  const all = [...regs, ...events];
  const proven = all.filter((e) => e.merkleProof);
  const badProof = proven.find((e) => e.merkleProof!.size !== cp.ledgerLength || e.merkleProof!.index !== e.index || !verifyInclusion(e.hash, e.index, cp.ledgerLength, e.merkleProof!.path, cp.merkleRoot));
  push({ label: "Merkle inclusion", ok: !badProof, detail: badProof ? `#${badProof.index} is not in the anchored tree` : `${proven.length} entries proven in the on-chain root (RFC 6962)` });
  const pending = all.length - proven.length;
  if (pending) push({ label: "Not yet anchored", ok: "warn", detail: `${pending} newer entr${pending === 1 ? "y is" : "ies are"} after this checkpoint` });

  // 7. History has only ever been appended to: consistent with EVERY trusted checkpoint on-chain.
  try {
    const { checkpoints } = await opts.chain.ledgerCheckpoints(cp.ledgerId);
    let consistent = 0;
    let witnesses = 0;
    let ignored = 0;
    let failure: string | null = null;
    for (const other of checkpoints) {
      if (other.id === cp.id) continue;
      const role = classifySubmitter(opts.trusted, other.submitter).role;
      if (role === "unidentified") {
        ignored++;
        continue;
      }
      const [small, big] = other.ledgerLength <= cp.ledgerLength ? [other, cp] : [cp, other];
      let ok = false;
      try {
        const proof = await opts.chain.consistency(small.ledgerLength, big.ledgerLength);
        ok = verifyConsistency(small.ledgerLength, big.ledgerLength, small.merkleRoot, big.merkleRoot, proof);
      } catch {
        ok = false;
      }
      if (!ok && !failure) failure = `checkpoint #${other.id} (${classifySubmitter(opts.trusted, other.submitter).name}, ${other.ledgerLength} entries) is not a prefix/extension of this history`;
      if (ok) {
        consistent++;
        if (role === "witness") witnesses++;
      }
    }
    push({
      label: "Append-only history",
      ok: !failure,
      detail: failure ?? `consistent with all ${consistent} other trusted checkpoint${consistent === 1 ? "" : "s"} (${witnesses} by independent witnesses)${ignored ? `; ${ignored} by unidentified submitters ignored` : ""}`,
    });
  } catch (e) {
    push({ label: "Append-only history", ok: "warn", detail: `Could not list checkpoints: ${e instanceof Error ? e.message.split("\n")[0] : "error"}` });
  }
  return out;
}
