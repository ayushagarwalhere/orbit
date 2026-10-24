import { baseUrl, handle } from "@/lib/api.ts";
import { getProduct } from "@/lib/domain.ts";
import { exportPassport } from "@/lib/passport.ts";
import { getDb } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

// GET /api/passport/:id — machine-readable Digital Product Passport, checkable against the chain.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => {
    const db = getDb();
    return exportPassport(db, getProduct(db, id), baseUrl(req));
  });
}
