"use client";

import { useState } from "react";
import { hashObject, verifySignature } from "@/lib/crypto.ts";

interface Result {
  label: string;
  ok: boolean;
  detail: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function verifyDoc(doc: any): Result[] {
  const out: Result[] = [];
  const subj = doc?.credentialSubject;
  if (!subj) return [{ label: "Document", ok: false, detail: "Not an Orbit passport (missing credentialSubject)" }];

  const core = subj.passportCore;
  const recomputed = hashObject(core);
  out.push({ label: "Passport record", ok: recomputed === subj.passportHash, detail: `sha256(passportCore) = ${recomputed.slice(0, 16)}…` });

  const events: any[] = subj.traceabilityEvents ?? [];
  const made = events.find((e) => e.type === "MANUFACTURED");
  out.push({
    label: "Passport hash signed at manufacture",
    ok: !!made && made.data?.passportHash === recomputed,
    detail: made ? `MANUFACTURED #${made.index} commits ${String(made.data?.passportHash).slice(0, 16)}…` : "no manufacture event",
  });

  for (const e of events) {
    const body = { index: e.index, type: e.type, subjectId: e.subjectId, actorId: e.actorId, timestamp: e.timestamp, place: e.place, data: e.data, prevHash: e.prevHash };
    const h = hashObject(body);
    const hashOk = h === e.hash;
    const sigOk = verifySignature(e.hash, e.signature, e.signerPublicKey);
    out.push({
      label: `#${e.index} ${e.type}`,
      ok: hashOk && sigOk,
      detail: !hashOk ? `content hash ${h.slice(0, 12)}… ≠ recorded ${String(e.hash).slice(0, 12)}…` : !sigOk ? "Ed25519 signature invalid for signer key" : `signed by ${e.actorId} · ${String(e.signature).slice(0, 16)}…`,
    });
  }
  return out;
}

export function VerifyClient({ products }: { products: { id: string; name: string; emoji: string }[] }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load(id: string) {
    setErr(null);
    const res = await fetch(`/api/passport/${id}`);
    const json = await res.json();
    setText(JSON.stringify(json, null, 2));
    setResults(verifyDoc(json));
  }
  function run() {
    setErr(null);
    try {
      setResults(verifyDoc(JSON.parse(text)));
    } catch {
      setErr("Invalid JSON");
      setResults(null);
    }
  }

  const passed = results?.filter((r) => r.ok).length ?? 0;
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
          <button className="btn btn-primary" onClick={run} disabled={!text}>
            Verify in browser
          </button>
          {err && <span className="text-sm text-rust">{err}</span>}
        </div>
      </div>
      <div className="card p-4">
        {!results && <div className="text-sm text-muted">Results appear here. Nothing is sent to a server during verification.</div>}
        {results && (
          <>
            <div className={`rounded-xl px-4 py-3 font-bold ${passed === results.length ? "bg-leaf-soft text-leaf" : "bg-rust-soft text-rust"}`}>
              {passed === results.length ? `✓ All ${results.length} checks passed` : `✕ ${results.length - passed} of ${results.length} checks failed`}
            </div>
            <ul className="mt-3 max-h-[480px] space-y-1 overflow-y-auto text-sm">
              {results.map((r, i) => (
                <li key={i} className="flex gap-2 rounded-lg px-2 py-1 hover:bg-paper">
                  <span className={r.ok ? "text-leaf" : "font-bold text-rust"}>{r.ok ? "✓" : "✕"}</span>
                  <div className="min-w-0">
                    <div className="font-medium">{r.label}</div>
                    <div className="hash truncate">{r.detail}</div>
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
