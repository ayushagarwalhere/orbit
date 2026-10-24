import { handle } from "@/lib/api.ts";
import { OrbitError } from "@/lib/domain.ts";
import { ledgerTree } from "@/lib/ledger.ts";
import { getDb } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

// GET /api/proof?m=<size>&n=<size>
// RFC 6962 consistency proof that the first m ledger entries are a prefix of the first n.
// Verifiers fetch these for every trusted checkpoint they find on-chain and check them against the
// on-chain roots, so the server can't fake one: a refusal or a bad proof is itself evidence.
export async function GET(req: Request) {
  return handle(() => {
    const u = new URL(req.url);
    const m = Number(u.searchParams.get("m"));
    const n = Number(u.searchParams.get("n"));
    const tree = ledgerTree(getDb());
    if (!Number.isInteger(m) || !Number.isInteger(n) || m < 1 || m > n || n > tree.size) throw new OrbitError(`No consistency proof for sizes ${m} → ${n}`, 404);
    return { m, n, proof: tree.consistencyProof(m, n), rootM: tree.root(m), rootN: tree.root(n) };
  });
}
