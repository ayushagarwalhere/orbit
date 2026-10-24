import { handle } from "@/lib/api.ts";
import { anchorNow, scheduleAnchor } from "@/lib/chain.ts";
import { restore, tamper } from "@/lib/demo.ts";
import { SIGNED_ACTIONS } from "@/lib/dispatch.ts";
import { OrbitError } from "@/lib/domain.ts";
import { getDb, isDemoMode, mutate, resetDb, submitSigned } from "@/lib/store.ts";
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
    if (Number(req.headers.get("content-length") ?? 0) > 16_384) throw new OrbitError("Request too large", 413);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 16_384) throw new OrbitError("Request too large", 413);
    let body: Record<string, unknown> = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw new OrbitError("Body must be JSON", 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new OrbitError("Body must be a JSON object", 400);

    if (action === "register-actor") {
      // Open self-registration: at most 20 new guests per 10 minutes, so the ledger can't be flooded.
      const g = globalThis as unknown as { __orbitGuestRegs?: number[] };
      const now = Date.now();
      g.__orbitGuestRegs = (g.__orbitGuestRegs ?? []).filter((t) => now - t < 600_000);
      if (g.__orbitGuestRegs.length >= 20) throw new OrbitError("Too many new guests right now; try again in a few minutes", 429);
      // Count only registrations that succeed, so invalid requests can't lock others out.
      const result = submitSigned(action, body as unknown as SignedRequest);
      g.__orbitGuestRegs.push(now);
      scheduleAnchor();
      return result;
    }
    if (SIGNED_ACTIONS.includes(action)) {
      const result = submitSigned(action, body as unknown as SignedRequest);
      scheduleAnchor();
      return result;
    }
    if (action === "anchor") {
      // Anchoring spends gas: a manual anchor needs 5+ new entries or 2 minutes since the last one.
      // (Writes are auto-anchored anyway, so nothing is ever left unanchored for long.)
      const g = globalThis as unknown as { __orbitLastManualAnchor?: number };
      const db = getDb();
      const last = [...db.checkpoints].reverse().find((c) => c.onChain && c.ledgerId === db.ledgerId);
      const fresh = db.ledger.length - (last ? last.covers : 0);
      if (g.__orbitLastManualAnchor && Date.now() - g.__orbitLastManualAnchor < 120_000 && fresh < 5) throw new OrbitError("Anchored less than 2 minutes ago; new events are anchored automatically within 10 minutes", 429);
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
        scheduleAnchor(2_000, true);
        return { ok: true };
      }
      default:
        throw new OrbitError(`Unknown action ${action}`, 404);
    }
  });
}
