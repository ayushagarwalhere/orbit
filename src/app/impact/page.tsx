import { PageHeader, Stat, fmt } from "@/components/ui.tsx";
import { carbonFootprint } from "@/lib/domain.ts";
import { overview } from "@/lib/stats.ts";
import { getDb } from "@/lib/store.ts";
import { ImpactClient } from "./ImpactClient.tsx";

export const dynamic = "force-dynamic";

const DOC = "https://github.com/ayushagarwalhere/orbit/blob/main/docs/IMPACT.md";

export default function ImpactPage() {
  const db = getDb();
  const s = overview(db);
  const repairs = db.ledger.filter((e) => e.type === "REPAIRED").length;
  const returns = db.ledger.filter((e) => e.type === "RETURNED").length;
  const misdeclared = db.products.reduce((n, p) => n + carbonFootprint(db, p).legs.filter((l) => l.check === "contradicted").length, 0);
  const understated = s.products.reduce((kg, p) => {
    const c = p.trust.claims.find((x) => x.claim.kind === "CARBON_FOOTPRINT" && x.status === "CONTRADICTED");
    return c ? kg + Math.max(0, p.co2e - Number(c.claim.value)) : kg;
  }, 0);

  return (
    <div className="space-y-10">
      <PageHeader kicker="Climate impact" title={<>What it <em className="text-accent">avoids</em></>}>
        Orbit cuts emissions by making circular behaviour pay (return rewards, repair bonuses, recovery credits) and by making low-carbon claims checkable, so procurement can reward them. Below: what this demo&apos;s ledger measured, and a projection model you can adjust. Same formulas and sources as our{" "}
        <a href={DOC} target="_blank" className="text-accent underline">
          written assessment
        </a>
        .
      </PageHeader>

      <section>
        <div className="label mb-3">Measured on this demo&apos;s ledger</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="CO₂e avoided (attributional)" value={`${fmt(s.avoidedKg, 1)} kg`} sub="recycled vs virgin inputs of these products; not an effect caused by Orbit" tone="leaf" />
          <Stat label="Material recovered" value={`${fmt(s.recoveredKg, 2)} kg`} sub="into new traceable lots" />
          <Stat label="Repairs rewarded" value={String(repairs)} sub="life extended, not replaced" />
          <Stat label="Returns" value={String(returns)} sub="return reward paid" />
          <Stat label="Understatement caught" value={`${fmt(understated, 1)} kg`} sub={`CO₂e hidden by contradicted claims · ${misdeclared} misdeclared leg${misdeclared === 1 ? "" : "s"}`} tone="rust" />
        </div>
      </section>

      <section>
        <div className="label mb-3">Projection to 2030 (EU scale)</div>
        <ImpactClient />
      </section>
    </div>
  );
}
