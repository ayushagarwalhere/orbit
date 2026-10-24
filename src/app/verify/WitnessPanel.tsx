"use client";

import { useState } from "react";
import { anchorFromWallet, checkForWitness, type Eip1193 } from "@/lib/witness-browser.ts";
import { txUrl, type Network, type TrustedDeployment } from "@/lib/networks.ts";
import type { LedgerEntry } from "@/lib/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Be a witness from the browser: re-check the whole ledger here, then anchor its root from the
 * visitor's own wallet. Orbit never sees the key; the wallet signs the transaction.
 */
export function WitnessPanel({ network, trusted }: { network: Network; trusted: TrustedDeployment }) {
  const [state, setState] = useState<{ step: "idle" | "checking" | "signing" | "done" | "error"; msg?: string; tx?: string; account?: string }>({ step: "idle" });
  const eth = typeof window !== "undefined" ? ((window as any).ethereum as Eip1193 | undefined) : undefined;

  async function witness() {
    try {
      setState({ step: "checking", msg: "Downloading and re-checking the whole ledger in your browser…" });
      const entries: LedgerEntry[] = (await (await fetch("/api/ledger", { cache: "no-store" })).json()).entries;
      const checked = await checkForWitness(entries, network, trusted);
      if (!eth) throw new Error("No browser wallet found.");

      setState({ step: "signing", msg: "Confirm in your wallet. You pay a tiny Base Sepolia gas fee (testnet ETH, no real money)." });
      const { hash, account } = await anchorFromWallet(eth, network, trusted, checked);
      setState({ step: "done", tx: hash, account, msg: `You anchored all ${checked.size} entries from your own wallet, after matching ${checked.matched} trusted checkpoints.` });
    } catch (e) {
      const m = e instanceof Error ? e.message.split(String.fromCharCode(10))[0] : "Something went wrong";
      setState({ step: "error", msg: /User rejected|denied/i.test(m) ? "You cancelled in your wallet. Nothing was anchored." : m });
    }
  }

  const busy = state.step === "checking" || state.step === "signing";
  return (
    <div className="mt-4 rounded-xl border border-sky/30 bg-sky-soft/40 p-4 text-sm">
      <div className="font-bold text-ink">Become a witness</div>
      <p className="mt-1 text-ink-soft">
        Your browser re-checks the whole ledger, then publishes its fingerprint on {network.name} from <b>your own wallet</b>. After that, Orbit can&apos;t rewrite this history without
        contradicting you.
      </p>
      {state.step !== "done" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary text-xs" onClick={witness} disabled={busy || !eth}>
            {busy ? "Working…" : "Re-check and anchor from my wallet"}
          </button>
          {!eth && (
            <span className="text-[12px] text-muted">
              Needs a browser wallet (e.g. MetaMask) with a little Base Sepolia test ETH. No wallet? Use the{" "}
              <a className="text-accent underline" href="https://github.com/ayushagarwalhere/orbit/blob/main/docs/WITNESS_GUIDE.md" target="_blank">
                command-line witness
              </a>
              .
            </span>
          )}
        </div>
      )}
      {state.msg && <div className={`mt-2 text-[13px] ${state.step === "error" ? "text-rust" : state.step === "done" ? "text-leaf" : "text-ink-soft"}`}>{state.msg}</div>}
      {state.step === "done" && (
        <div className="mt-2 text-[13px] text-ink-soft">
          <a className="text-accent underline" href={txUrl(network, state.tx)} target="_blank">
            View your transaction ↗
          </a>{" "}
          · Your checkpoint shows as &ldquo;unidentified&rdquo; until Orbit lists you as a named witness. Send your address ({state.account?.slice(0, 6)}…{state.account?.slice(-4)}) to the team.
        </div>
      )}
    </div>
  );
}
