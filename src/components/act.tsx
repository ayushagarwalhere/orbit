"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newRequest, signRequest } from "@/lib/auth.ts";
import { publicKeyOf, randomPrivateKey } from "@/lib/crypto.ts";

// Demo wallet: in demo mode the console receives the demo actors' keys once, and every action is
// signed here in the browser. The server only ever sees { request, signature } and verifies it.
interface Wallet {
  keys: Record<string, string>;
  ledgerId: string;
}
let walletPromise: Promise<Wallet> | null = null;
export function demoWallet(refresh = false): Promise<Wallet> {
  if (refresh) walletPromise = null;
  walletPromise ??= fetch("/api/demo/keys", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Demo wallet unavailable on this deployment"))))
    .then((j) => ({ keys: j.keys as Record<string, string>, ledgerId: String(j.ledgerId) }))
    .catch((e) => {
      walletPromise = null;
      throw e;
    });
  return walletPromise;
}

const UNSIGNED = new Set(["anchor", "tamper", "restore", "reset"]);

// ---------- guest consumer: a key generated in this browser that never leaves it ----------

export interface Guest {
  id: string;
  name: string;
  privateKey: string;
  ledgerId: string;
}
const GUEST_STORE = "orbit-guest";

export function loadGuest(): Guest | null {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_STORE) ?? "null") as Guest | null;
    return g && typeof g.privateKey === "string" ? g : null;
  } catch {
    return null;
  }
}
function guestKey(actorId: string): string | undefined {
  const g = typeof window === "undefined" ? null : loadGuest();
  return g && g.id === actorId ? g.privateKey : undefined;
}
export function forgetGuest() {
  try {
    localStorage.removeItem(GUEST_STORE);
  } catch {
    /* ignore */
  }
}
/** Creates a key pair in the browser and returns the self-signed registration to submit. */
export async function newGuest(name: string): Promise<Guest> {
  const wallet = await demoWallet();
  const g: Guest = { id: `guest-${randomPrivateKey().slice(0, 8)}`, name, privateKey: randomPrivateKey(), ledgerId: wallet.ledgerId };
  try {
    localStorage.setItem(GUEST_STORE, JSON.stringify(g));
  } catch {
    /* private mode: key lives for this page only */
  }
  return g;
}
export function guestRegistrationBody(g: Guest) {
  return {
    actorId: g.id,
    name: g.name,
    role: "consumer",
    publicKey: publicKeyOf(g.privateKey),
    place: { city: "Singapore", country: "SG", lat: 1.29, lng: 103.85 },
    description: "Guest consumer; key generated in the browser",
  };
}

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
        const wallet = await demoWallet();
        // A guest consumer's key lives only in this browser (never on the server).
        const key = guestKey(actorId) ?? wallet.keys[actorId];
        if (!key) throw new Error(`No key for ${actorId}`);
        payload = signRequest(newRequest(action, actorId, body, wallet.ledgerId), key);
      }
      let res = await fetch(`/api/actions/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      let json = await res.json();
      if (res.status === 409 && String(json.error).includes("different ledger") && actorId) {
        // The demo was reset since we last fetched the ledger id: re-sign for the current ledger once.
        const wallet = await demoWallet(true);
        const key = guestKey(actorId) ?? wallet.keys[actorId];
        res = await fetch(`/api/actions/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signRequest(newRequest(action, actorId, body, wallet.ledgerId), key)) });
        json = await res.json();
      }
      if (action === "reset" && res.ok) walletPromise = null;
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
