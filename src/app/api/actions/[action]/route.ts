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
//    Ed25519 key. The server verifies it (signature, freshness, nonce) and can never forge one.
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
    if (action === "anchor") return anchorNow();

    if (!isDemoMode()) throw new OrbitError("Demo controls are disabled on this deployment", 403);
    switch (action) {
      case "tamper":
        return mutate((tx) => tamper(tx.db, Number(body.index), body.mode === "rewrite" ? "rewrite" : "edit", tx.sequencerKey));
      case "restore":
        return mutate((tx) => restore(tx.db));
      case "reset":
        resetDb();
        scheduleAnchor(2_000);
        return { ok: true };
      default:
        throw new OrbitError(`Unknown action ${action}`, 404);
    }
  });
}
