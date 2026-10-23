"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Posts to /api/actions/:action, surfaces errors, refreshes server components on success. */
export function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function act<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/actions/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Request failed");
        return null;
      }
      startTransition(() => router.refresh());
      return json as T;
    } catch {
      setError("Network error");
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
  children,
  className = "btn btn-primary",
  confirm,
}: {
  action: string;
  body?: Record<string, unknown>;
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
          act(action, body);
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && <span className="text-xs text-rust">{error}</span>}
    </span>
  );
}
