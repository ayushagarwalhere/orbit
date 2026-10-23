import { getDb } from "@/lib/store.ts";
import { PageHeader } from "@/components/ui.tsx";
import { VerifyClient } from "./VerifyClient.tsx";

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  const db = getDb();
  return (
    <div className="space-y-6">
      <PageHeader kicker="Don't trust, verify" title={<>Independent <em className="text-accent">verifier</em></>}>
          You don&apos;t have to trust Orbit&apos;s server. Load any passport and your browser re-checks every hash, every signature and every Merkle proof, then compares the root against the blockchain directly. Edit the JSON to watch it fail.
      </PageHeader>
      <VerifyClient products={db.products.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }))} />
    </div>
  );
}
