"use client";

import { useState } from "react";
import { addressUrl, classifySubmitter, type Network, type TrustedDeployment } from "@/lib/networks.ts";
import type { Check } from "@/lib/passport-verify.ts";
import type { LedgerEntry } from "@/lib/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ask the deployed contract: the browser builds RFC 6962 proofs from the downloaded ledger and the
 * OrbitAnchor contract's own Solidity code checks them against the roots it stores. Read-only calls.
 */
export function OnChainPanel({ doc, network, trusted }: { doc: any; network: Network; trusted: TrustedDeployment }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setErr(null);
    setChecks(null);
    try {
      const { readCheckpoint, readLedgerCheckpoints, contractVerifier } = await import("@/lib/anchor-read.ts");
      const { contractChecks } = await import("@/lib/onchain-verify.ts");
      const ledgerRes = await fetch("/api/ledger", { cache: "no-store" }).catch(() => null);
      if (!ledgerRes?.ok) {
        setErr(`Could not download the ledger from this Orbit server${ledgerRes ? ` (HTTP ${ledgerRes.status})` : ""}. The chain was not contacted.`);
        return;
      }
      const ledger = (await ledgerRes.json()).entries as LedgerEntry[];
      const cp = await readCheckpoint(network, trusted.contract, Number(doc.proof.anchor.checkpointId));
      const { checkpoints } = await readLedgerCheckpoints(network, trusted.contract, cp.ledgerId);
      const trustedCps = checkpoints.filter((c) => classifySubmitter(trusted, c.submitter).role !== "unidentified");
      const eventIndexes = (doc.credentialSubject?.traceabilityEvents ?? []).map((e: any) => Number(e.index));
      setChecks(await contractChecks({ ledger, checkpoint: cp, trusted: trustedCps, eventIndexes, contract: contractVerifier(network, trusted.contract) }));
    } catch (e) {
      setErr(`Could not reach ${network.name}: ${e instanceof Error ? e.message.split(String.fromCharCode(10))[0] : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  const failed = checks?.some((c) => c.ok === false);
  return (
    <div className="mt-4 rounded-xl border border-line bg-raised/60 p-4 text-sm">
      <div className="font-bold text-ink">Ask the contract</div>
      <p className="mt-1 text-ink-soft">
        Your browser builds the Merkle proofs; the{" "}
        <a className="text-accent underline" href={addressUrl(network, trusted.contract)} target="_blank">
          OrbitAnchor contract
        </a>{" "}
        on {network.name} checks them with its own code. Read-only, free, no wallet.
      </p>
      <button className="btn btn-ghost mt-3 text-xs" onClick={ask} disabled={busy}>
        {busy ? "Asking the contract…" : checks ? "Ask again" : "Verify on-chain"}
      </button>
      {err && <div className="mt-2 text-[13px] text-rust">{err}</div>}
      {checks && (
        <ul className="mt-3 space-y-1">
          {checks.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className={c.ok === true ? "text-leaf" : c.ok === "warn" ? "text-amber" : "font-bold text-rust"}>{c.ok === true ? "✓" : c.ok === "warn" ? "ⓘ" : "✕"}</span>
              <div className="min-w-0">
                <div className="font-medium">{c.label}</div>
                <div className="text-[12px] text-muted">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {checks && !failed && <div className="mt-2 text-[12px] text-muted">These answers come from Solidity running on {network.name}, not from Orbit&apos;s server or this page&apos;s JavaScript.</div>}
    </div>
  );
}
