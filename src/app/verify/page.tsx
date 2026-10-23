import { getDb } from "@/lib/store.ts";
import { VerifyClient } from "./VerifyClient.tsx";

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  const db = getDb();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Independent verifier</h1>
        <p className="mt-1 max-w-2xl text-ink-soft">
          You don&apos;t have to trust Orbit&apos;s server. Load any passport and your browser re-checks every hash, every signature and every Merkle proof, then compares the root against the blockchain directly. Edit the JSON to watch it fail.
        </p>
      </div>
      <VerifyClient products={db.products.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }))} />
    </div>
  );
}
