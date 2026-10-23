import { handle } from "@/lib/api.ts";
import { verifyLedger } from "@/lib/ledger.ts";
import { getDb } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

// GET /api/ledger — full ledger, public keys and an integrity report. Anyone can re-verify.
export async function GET() {
  return handle(() => {
    const db = getDb();
    const r = verifyLedger(db);
    return {
      integrity: { ok: r.ok, checked: r.checked, merkleRoot: r.merkleRoot, issues: r.issues },
      checkpoints: db.checkpoints,
      publicKeys: Object.fromEntries(r.keys), // from on-ledger registrations
      entries: db.ledger,
    };
  });
}
