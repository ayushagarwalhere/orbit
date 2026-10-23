import { balances, batchConsumed, custody } from "@/lib/domain.ts";
import { MATERIAL_FACTORS } from "@/lib/factors.ts";
import { verifyLedger } from "@/lib/ledger.ts";
import { getDb } from "@/lib/store.ts";
import { trustReport } from "@/lib/verify.ts";
import { ConsoleClient, type ConsoleData } from "./ConsoleClient.tsx";

export const dynamic = "force-dynamic";

export default function ConsolePage() {
  const db = getDb();
  const bal = balances(db);
  const integrity = verifyLedger(db);
  const reports = new Map(db.products.map((p) => [p.id, trustReport(db, p, integrity)]));
  const data: ConsoleData = {
    actors: db.actors.filter((a) => a.role !== "protocol").map((a) => ({ id: a.id, name: a.name, role: a.role, city: a.place.city, balance: bal.get(a.id) ?? 0 })),
    products: db.products.map((p) => {
      const c = custody(db, p.id);
      return { id: p.id, name: p.name, emoji: p.emoji, brandId: p.brandId, stage: c.stage, holderId: c.holderId, pendingRecipientId: c.pendingRecipientId ?? null };
    }),
    batches: db.batches.map((b) => ({
      id: b.id,
      material: b.material,
      label: MATERIAL_FACTORS[b.material].label,
      remainingKg: Math.round((b.massKg - batchConsumed(db, b.id)) * 1000) / 1000,
      recycledPct: b.massKg ? Math.round((b.recycledKg / b.massKg) * 100) : 0,
      producerId: b.producerId,
    })),
    claims: db.claims.map((c) => {
      const p = db.products.find((x) => x.id === c.productId);
      const r = reports.get(c.productId)?.claims.find((x) => x.claim.id === c.id);
      return { id: c.id, productId: c.productId, productName: p?.name ?? c.productId, kind: c.kind, statement: c.statement, status: r?.status ?? "PENDING", attestedBy: c.attestations.map((a) => a.auditorId) };
    }),
    materials: Object.entries(MATERIAL_FACTORS).map(([id, f]) => ({ id, label: f.label })),
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Partner console</h1>
        <p className="mt-1 max-w-2xl text-ink-soft">
          Act as any participant. Every action is checked against custody, role and mass-balance rules, then signed with that actor&apos;s key and appended to the ledger.
        </p>
      </div>
      <ConsoleClient data={data} />
    </div>
  );
}
