"use client";

import { useState } from "react";
import { OFFICIAL_ANCHORS, networkById, txUrl } from "@/lib/networks.ts";
import dynamic from "next/dynamic";
import type { Check, ChainReader } from "@/lib/passport-verify.ts";

const WitnessPanel = dynamic(() => import("./WitnessPanel.tsx").then((m) => m.WitnessPanel), { ssr: false });

/* eslint-disable @typescript-eslint/no-explicit-any */
function chainFor(doc: any): { reader?: ChainReader; chainId?: number } {
  const chainId = doc?.proof?.anchor?.chainId ? Number(doc.proof.anchor.chainId) : undefined;
  const network = chainId ? networkById(chainId) : undefined;
  const trusted = chainId ? OFFICIAL_ANCHORS[chainId] : undefined;
  if (!network || !trusted) return { chainId };
  // Public RPC chosen here; contract address pinned in code. The ledger comes from Orbit's server,
  // but is authenticated against roots read straight from the chain, so it can't be faked.
  return {
    chainId,
    reader: {
      checkpoint: async (id) => (await import("@/lib/anchor-read.ts")).readCheckpoint(network, trusted.contract, id),
      ledgerCheckpoints: async (ledgerId) => (await import("@/lib/anchor-read.ts")).readLedgerCheckpoints(network, trusted.contract, ledgerId),
      ledger: async () => {
        const r = await fetch("/api/ledger", { cache: "no-store" });
        if (!r.ok) throw new Error("ledger unavailable");
        return (await r.json()).entries;
      },
    },
  };
}

export function VerifyClient({ products }: { products: { id: string; name: string; emoji: string }[] }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Check[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [chainId, setChainId] = useState<number | undefined>();

  async function run(doc: any) {
    setRunning(true);
    setResults([]);
    try {
      const { reader, chainId } = chainFor(doc);
      const network = chainId ? networkById(chainId) : undefined;
      setChainId(chainId);
      const { verifyPassport } = await import("@/lib/passport-verify.ts");
      setResults(await verifyPassport(doc, { trusted: chainId ? OFFICIAL_ANCHORS[chainId] : undefined, chainId, chain: reader, explorer: (tx) => txUrl(network, tx) }, setResults));
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
            <p>Results appear here. Your browser does all the work, with trust roots pinned in its code:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Reads Orbit&apos;s checkpoint from the pinned contract and checks the pinned operator submitted it</li>
              <li>Downloads the ledger and re-hashes it: its Merkle root must equal the on-chain root</li>
              <li>Checks it matches every checkpoint by Orbit and by named witnesses</li>
              <li>Re-checks every signature and replays every instruction through the rules</li>
              <li>Checks the passport leaves nothing out, then re-derives every verdict and the grade</li>
            </ol>
          </div>
        )}
        {results && (
          <>
            <div className={`rounded-xl px-4 py-3 font-bold ${running ? "bg-raised text-ink-soft" : failed ? "bg-rust-soft text-rust" : warned ? "bg-amber-soft text-amber" : "bg-leaf-soft text-leaf"}`}>
              {running ? "Verifying…" : failed ? `✕ ${failed} of ${results.length} checks failed` : warned ? `✓ ${results.length - warned} checks passed · ${warned} caveat${warned > 1 ? "s" : ""} below` : `✓ All ${results.length} checks passed`}
            </div>
            <ul className="mt-3 max-h-[480px] space-y-1 overflow-y-auto text-sm">
              {results.map((r, i) => (
                <li key={i} className="flex gap-2 rounded-lg px-2 py-1 hover:bg-raised">
                  <span className={r.ok === true ? "text-leaf" : r.ok === "warn" ? "text-amber" : "font-bold text-rust"}>{r.ok === true ? "✓" : r.ok === "warn" ? "ⓘ" : "✕"}</span>
                  <div className="min-w-0">
                    <div className="font-medium">{r.label}</div>
                    <div className="hash truncate" title={r.detail}>
                      {r.detail}{" "}
                      {r.link && (
                        <a href={r.link} target="_blank" className="text-accent underline">
                          view ↗
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {!running && !failed && results.length > 0 && chainId && networkById(chainId) && OFFICIAL_ANCHORS[chainId] && <WitnessPanel network={networkById(chainId)!} trusted={OFFICIAL_ANCHORS[chainId]} />}
          </>
        )}
      </div>
    </div>
  );
}
