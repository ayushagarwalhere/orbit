import { handle } from "@/lib/api.ts";
import { anchorNow, scheduleAnchor } from "@/lib/chain.ts";
import { restore, tamper } from "@/lib/demo.ts";
import { SIGNED_ACTIONS } from "@/lib/dispatch.ts";
import { OrbitError } from "@/lib/domain.ts";
import { isDemoMode, mutate, resetDb, submitSigned } from "@/lib/store.ts";
import type { SignedRequest } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

// POST /api/actions/:action
//  - Supply chain actions require { request, signature }: an instruction signed by the actor's own
//    Ed25519 key. The server verifies it (signature, freshness, nonce). In production the server never
//    holds actor keys; in demo mode it generated the role-play keys, so it could sign as them.
//  - "anchor" publishes the current Merkle root on-chain. Anyone may trigger it; it only commits.
//  - "tamper", "restore", "reset" exist only in demo mode (ORBIT_DEMO_MODE != 0).
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (SIGNED_ACTIONS.includes(action)) {
      const result = submitSigned(action, body as unknown as SignedRequest);
      scheduleAnchor();
      return result;
    }
    if (action === "anchor") {
      // Anchoring spends gas: at most one manual anchor every 30 s, whoever asks.
      const g = globalThis as unknown as { __orbitLastManualAnchor?: number };
      if (g.__orbitLastManualAnchor && Date.now() - g.__orbitLastManualAnchor < 30_000) throw new OrbitError("Anchored moments ago; try again in a few seconds", 429);
      g.__orbitLastManualAnchor = Date.now();
      return anchorNow();
    }

    if (!isDemoMode()) throw new OrbitError("Demo controls are disabled on this deployment", 403);
    switch (action) {
      case "tamper":
        return mutate((tx) => tamper(tx.db, Number(body.index), body.mode === "rewrite" ? "rewrite" : body.mode === "erase" ? "erase" : "edit", tx.sequencerKey));
      case "restore": {
        const r = mutate((tx) => restore(tx.db));
        scheduleAnchor();
        return r;
      }
      case "reset": {
        // Shared demo: at most one reset per 2 minutes, so one visitor can't wipe another's session.
        const g = globalThis as unknown as { __orbitLastReset?: number };
        if (g.__orbitLastReset && Date.now() - g.__orbitLastReset < 120_000) throw new OrbitError("The demo was reset less than 2 minutes ago; try again shortly", 429);
        g.__orbitLastReset = Date.now();
        resetDb();
        scheduleAnchor(2_000);
        return { ok: true };
      }
      default:
        throw new OrbitError(`Unknown action ${action}`, 404);
    }
  });
}
