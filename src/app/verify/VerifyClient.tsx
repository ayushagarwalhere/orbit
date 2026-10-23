"use client";

import { useState } from "react";
import { readCheckpoint } from "@/lib/anchor-read.ts";
import { PROTOCOL_ID, authMismatch, verifyRequest } from "@/lib/auth.ts";
import { hashObject, rootFromProof, verifySignature, type ProofStep } from "@/lib/crypto.ts";
import { hashEntry } from "@/lib/ledger.ts";
import { networkById, txUrl } from "@/lib/networks.ts";
import type { LedgerEntry } from "@/lib/types.ts";

interface Result {
  label: string;
  ok: boolean | "warn";
  detail: string;
  link?: string;
}

type ProvenEntry = LedgerEntry & { merkleProof: ProofStep[] | null };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function verifyDoc(doc: any, onProgress: (r: Result[]) => void): Promise<Result[]> {
  const out: Result[] = [];
  const push = (r: Result) => {
    out.push(r);
    onProgress([...out]);
  };
  const subj = doc?.credentialSubject;
  if (!subj) return [{ label: "Document", ok: false, detail: "Not an Orbit passport (missing credentialSubject)" }];
  const anchor = doc.proof?.anchor;
  const regs: ProvenEntry[] = subj.actorRegistrations ?? [];
  const events: ProvenEntry[] = subj.traceabilityEvents ?? [];

  // 1. Keys: only from registration entries, each self-signed (proof of key possession).
  const keys = new Map<string, string>();
  for (const e of regs) {
    const pk = String(e.data?.publicKey);
    const ok = hashEntry(e) === e.hash && !!e.auth && verifyRequest(e.auth, pk) && !authMismatch(e);
    if (ok) keys.set(e.subjectId, pk);
    push({ label: `Key of ${e.subjectId}`, ok, detail: ok ? `registered at #${e.index}, self-signed · ${pk.slice(0, 16)}…` : "registration entry is invalid" });
  }
  const seq = keys.get(PROTOCOL_ID);

  // 2. Passport record is the one committed at manufacture.
  const recomputed = hashObject(subj.passportCore);
  const made = events.find((e) => e.type === "MANUFACTURED");
  push({ label: "Passport record", ok: !!made && recomputed === subj.passportHash && made.data?.passportHash === recomputed, detail: `sha256(bill of materials…) = ${recomputed.slice(0, 16)}…, committed by MANUFACTURED #${made?.index}` });

  // 3. Every event: content hash, sequencer signature, actor's signed instruction and its binding.
  for (const e of events) {
    const hashOk = hashEntry(e) === e.hash;
    const seqOk = !!seq && verifySignature(e.hash, e.signature, seq);
    const isProtocol = e.actorId === PROTOCOL_ID;
    const actorKey = keys.get(e.actorId);
    const actorOk = isProtocol || (!!actorKey && !!e.auth && verifyRequest(e.auth, actorKey));
    const mismatch = isProtocol ? null : authMismatch(e);
    const ok = hashOk && seqOk && actorOk && !mismatch;
    push({
      label: `#${e.index} ${e.type}`,
      ok,
      detail: !hashOk
        ? "content does not match its hash"
        : !seqOk
          ? "sequencer signature invalid"
          : !actorOk
            ? `not signed by ${e.actorId}'s registered key`
            : mismatch
              ? `differs from what ${e.actorId} signed: ${mismatch}`
              : isProtocol
                ? "protocol entry, sequencer-signed"
                : `${e.actorId} signed this instruction · ${e.auth!.signature.slice(0, 14)}…`,
    });
  }

  // 4. Merkle inclusion of every entry in the anchored root.
  if (!anchor) {
    push({ label: "Anchor", ok: "warn", detail: "No checkpoint yet" });
    return out;
  }
  const all = [...regs, ...events];
  const covered = all.filter((e) => e.merkleProof);
  const proofsOk = covered.every((e) => rootFromProof(e.hash, e.merkleProof!) === anchor.merkleRoot);
  push({ label: "Merkle inclusion", ok: proofsOk, detail: `${covered.length} entries prove inclusion in root ${String(anchor.merkleRoot).slice(0, 16)}…` });
  const pending = all.length - covered.length;
  if (pending) push({ label: "Not yet anchored", ok: "warn", detail: `${pending} newer entr${pending === 1 ? "y is" : "ies are"} after the latest checkpoint` });

  // 5. The root itself, read straight from the blockchain via a public RPC chosen here, not by Orbit.
  const network = anchor.chainId ? networkById(Number(anchor.chainId)) : undefined;
  if (!anchor.onChain || !network || !anchor.contract) {
    push({ label: "On-chain root", ok: "warn", detail: "Checkpoint is local only; it cannot be independently timestamped" });
    return out;
  }
  try {
    const cp = await readCheckpoint(network, anchor.contract, Number(anchor.checkpointId));
    const ok = cp.merkleRoot === anchor.merkleRoot && cp.ledgerLength === anchor.covers;
    push({
      label: `On-chain root (${network.name})`,
      ok,
      detail: ok
        ? `OrbitAnchor checkpoint #${anchor.checkpointId} = ${cp.merkleRoot.slice(0, 16)}…, anchored ${new Date(cp.timestamp * 1000).toUTCString()}`
        : `Chain holds ${cp.merkleRoot.slice(0, 16)}… (${cp.ledgerLength} entries); passport claims ${String(anchor.merkleRoot).slice(0, 16)}…`,
      link: txUrl(network, anchor.txHash ?? undefined),
    });
  } catch (e) {
    push({ label: "On-chain root", ok: "warn", detail: `Could not reach ${network.name} RPC: ${e instanceof Error ? e.message.split("\n")[0] : "error"}` });
  }
  return out;
}

export function VerifyClient({ products }: { products: { id: string; name: string; emoji: string }[] }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run(json: unknown) {
    setRunning(true);
    setResults([]);
    try {
      setResults(await verifyDoc(json, setResults));
    } finally {
      setRunning(false);
    }
  }
  async function load(id: string) {
    setErr(null);
    const res = await fetch(`/api/passport/${id}`);
    const json = await res.json();
    setText(JSON.stringify(json, null, 2));
    run(json);
  }
  function runText() {
    setErr(null);
    try {
      run(JSON.parse(text));
    } catch {
      setErr("Invalid JSON");
      setResults(null);
    }
  }

  const failed = results?.filter((r) => r.ok === false).length ?? 0;
  const warned = results?.filter((r) => r.ok === "warn").length ?? 0;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          {products.map((p) => (
            <button key={p.id} className="btn btn-ghost text-xs" onClick={() => load(p.id)}>
              {p.emoji} {p.name}
            </button>
          ))}
        </div>
        <textarea
          className="field mt-3 h-[480px] font-mono text-[11px] leading-snug"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Load a passport above, or paste passport JSON here"
          spellCheck={false}
        />
        <div className="mt-2 flex items-center gap-3">
          <button className="btn btn-primary" onClick={runText} disabled={!text || running}>
            {running ? "Verifying…" : "Verify in browser"}
          </button>
          {err && <span className="text-sm text-rust">{err}</span>}
        </div>
      </div>
      <div className="card p-4">
        {!results && (
          <div className="space-y-2 text-sm text-muted">
            <p>Results appear here. Your browser does all the work:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Takes actor keys only from their self-signed registration entries</li>
              <li>Re-hashes every event and checks the sequencer&apos;s and the actor&apos;s signatures</li>
              <li>Checks each event matches exactly what the actor signed</li>
              <li>Proves every entry is in the Merkle root…</li>
              <li>…and reads that root directly from the public blockchain</li>
            </ol>
          </div>
        )}
        {results && (
          <>
            <div className={`rounded-xl px-4 py-3 font-bold ${running ? "bg-raised text-ink-soft" : failed ? "bg-rust-soft text-rust" : "bg-leaf-soft text-leaf"}`}>
              {running ? "Verifying…" : failed ? `✕ ${failed} of ${results.length} checks failed` : `✓ All ${results.length - warned} checks passed${warned ? ` · ${warned} note${warned > 1 ? "s" : ""}` : ""}`}
            </div>
            <ul className="mt-3 max-h-[480px] space-y-1 overflow-y-auto text-sm">
              {results.map((r, i) => (
                <li key={i} className="flex gap-2 rounded-lg px-2 py-1 hover:bg-raised">
                  <span className={r.ok === true ? "text-leaf" : r.ok === "warn" ? "text-amber" : "font-bold text-rust"}>{r.ok === true ? "✓" : r.ok === "warn" ? "ⓘ" : "✕"}</span>
                  <div className="min-w-0">
                    <div className="font-medium">{r.label}</div>
                    <div className="hash truncate">
                      {r.detail}{" "}
                      {r.link && (
                        <a href={r.link} target="_blank" className="text-leaf underline">
                          tx
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
