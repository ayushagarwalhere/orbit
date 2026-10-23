import Link from "next/link";
import { ENTRY_META, GradeBadge, StagePill, Stat, dateTime, fmt } from "@/components/ui.tsx";
import { overview } from "@/lib/stats.ts";
import { getDb } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    title: "Lifecycle tracking",
    body: "Every handover, from mine and farm to factory, ship, shop, repair and recycler, is an event signed by the actor's own key and chained to the one before it.",
    icon: "🔗",
  },
  {
    title: "Digital product passports",
    body: "Scan a QR code to see the full story: materials, origin, footprint and custody. It exports as a UNTP-style credential that anyone can verify offline.",
    icon: "🪪",
  },
  {
    title: "Recycling traceability",
    body: "Recyclers turn returned products into new recycled lots that link back to their source. Recycled content is proven by mass balance, not just declared.",
    icon: "♻️",
  },
  {
    title: "Circular incentives",
    body: "Deposit refunds and recovery credits are minted automatically when products are repaired, returned or recycled. Credits are spendable and auditable.",
    icon: "🪙",
  },
];

export default function Home() {
  const db = getDb();
  const s = overview(db);
  const recent = db.ledger.slice(-8).reverse();
  const actorName = (id: string) => db.actors.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="space-y-10">
      <section className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div>
          <div className="label mb-3 text-leaf">Sustainable Supply Chains</div>
          <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
            Sustainability claims, <span className="text-leaf">checked</span> against the supply chain.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-soft">
            Orbit gives every product a passport backed by a signed, tamper-evident ledger. It then checks each green claim against that record, so a recycled-content or carbon claim has to be proven before it is shown.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/passport/${s.products[0]?.product.id}`} className="btn btn-primary">
              Open a product passport →
            </Link>
            <Link href="/console" className="btn btn-ghost">
              Act as a supply chain partner
            </Link>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="label">Ledger integrity</div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.integrity.ok ? "bg-leaf-soft text-leaf" : "bg-rust-soft text-rust"}`}>
              {s.integrity.ok ? "ALL SIGNATURES VALID" : `${s.integrity.issues.length} PROBLEM(S)`}
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold">{db.ledger.length} entries</div>
          <div className="mt-1 text-sm text-muted">signed by {db.actors.length} actors with Ed25519 keys</div>
          <div className="mt-4 label">Merkle root</div>
          <div className="hash break-all">{s.integrity.merkleRoot}</div>
          <Link href="/ledger" className="mt-4 inline-block text-sm font-semibold text-leaf">
            Explore & tamper-test the ledger →
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Products tracked" value={String(db.products.length)} sub={`${db.batches.length} material lots`} />
        <Stat label="Claims verified" value={`${s.claimsVerified}/${s.claimsTotal}`} sub="checked against ledger" tone="leaf" />
        <Stat label="Greenwashing caught" value={String(s.claimsContradicted)} sub="claims contradicted" tone="rust" />
        <Stat label="Material recovered" value={`${fmt(s.recoveredKg, 2)} kg`} sub={`${fmt(s.avoidedKg, 1)} kg CO2e avoided`} tone="leaf" />
        <Stat label="Credits issued" value={fmt(s.credits, 0)} sub="for repair, return, recovery" />
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xl font-bold">Product passports</h2>
          <span className="text-sm text-muted">Trust grade = claims verified by evidence, minus contradictions</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {s.products.map(({ product: p, brand, stage, trust, recycledPct, co2e }) => (
            <Link key={p.id} href={`/passport/${p.id}`} className="card flex gap-4 p-4 transition hover:border-ink-soft">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-paper text-3xl">{p.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate font-semibold">{p.name}</div>
                  <StagePill stage={stage} />
                </div>
                <div className="text-sm text-muted">
                  {brand.name} · {p.id}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                  <span>♻ {fmt(recycledPct, 0)}% recycled</span>
                  <span>☁ {fmt(co2e, 1)} kg CO2e</span>
                  <span className={trust.claims.some((c) => c.status === "CONTRADICTED") ? "font-semibold text-rust" : ""}>{trust.summary}</span>
                </div>
              </div>
              <GradeBadge grade={trust.grade} />
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {PILLARS.map((p) => (
          <div key={p.title} className="card p-5">
            <div className="text-2xl">{p.icon}</div>
            <div className="mt-2 font-semibold">{p.title}</div>
            <p className="mt-1 text-sm text-ink-soft">{p.body}</p>
          </div>
        ))}
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Latest ledger activity</h2>
          <Link href="/ledger" className="text-sm font-semibold text-leaf">
            Full ledger →
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {recent.map((e) => (
            <li key={e.index} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-6 text-center">{ENTRY_META[e.type].icon}</span>
              <span className="w-12 hash">#{e.index}</span>
              <span className="font-medium">{ENTRY_META[e.type].label}</span>
              <span className="truncate text-muted">
                {actorName(e.actorId)} · {e.subjectId}
              </span>
              <span className="ml-auto hidden shrink-0 text-xs text-muted md:block">{dateTime(e.timestamp)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
