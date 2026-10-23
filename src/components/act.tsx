"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newRequest, signRequest } from "@/lib/auth.ts";

// Demo wallet: in demo mode the console receives the demo actors' keys once, and every action is
// signed here in the browser. The server only ever sees { request, signature } and verifies it.
let walletPromise: Promise<Record<string, string>> | null = null;
function demoWallet(): Promise<Record<string, string>> {
  walletPromise ??= fetch("/api/demo/keys")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Demo wallet unavailable on this deployment"))))
    .then((j) => j.keys as Record<string, string>)
    .catch((e) => {
      walletPromise = null;
      throw e;
    });
  return walletPromise;
}

const UNSIGNED = new Set(["anchor", "tamper", "restore", "reset"]);

/** Signs (when needed) and posts to /api/actions/:action, then refreshes server components. */
export function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function act<T = unknown>(action: string, body: Record<string, unknown> = {}, actorId?: string): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      let payload: unknown = body;
      if (!UNSIGNED.has(action)) {
        if (!actorId) throw new Error("No acting party selected");
        const key = (await demoWallet())[actorId];
        if (!key) throw new Error(`No key for ${actorId}`);
        payload = signRequest(newRequest(action, actorId, body), key);
      }
      const res = await fetch(`/api/actions/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Request failed");
        return null;
      }
      startTransition(() => router.refresh());
      return json as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { act, error, busy, setError };
}

export function ActionButton({
  action,
  body,
  actorId,
  children,
  className = "btn btn-primary",
  confirm,
}: {
  action: string;
  body?: Record<string, unknown>;
  actorId?: string;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const { act, error, busy } = useAct();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={className}
        disabled={busy}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          act(action, body, actorId);
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && <span className="text-xs text-rust">{error}</span>}
    </span>
  );
}
