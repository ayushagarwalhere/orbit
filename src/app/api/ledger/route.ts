import { handle } from "@/lib/api.ts";
import { verifyLedger } from "@/lib/ledger.ts";
import { getDb } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

// GET /api/ledger — full ledger, public keys and an integrity report. Anyone can re-verify.
// ?from=N returns only entries N.. so witnesses can download incrementally.
export async function GET(req: Request) {
  return handle(() => {
    const db = getDb();
    const r = verifyLedger(db);
    const from = Math.max(0, Number(new URL(req.url).searchParams.get("from") ?? 0) || 0);
    return {
      ledgerId: db.ledgerId,
      integrity: { ok: r.ok, checked: r.checked, merkleRoot: r.merkleRoot, issues: r.issues },
      checkpoints: db.checkpoints,
      publicKeys: Object.fromEntries(r.keys), // from on-ledger registrations
      total: db.ledger.length,
      from,
      entries: from ? db.ledger.slice(from) : db.ledger,
    };
  });
}
