import { Anchor, ArrowRight, ArrowUpRight, Coins, Fingerprint, Link2, Recycle, ScanLine } from "lucide-react";
import Link from "next/link";
import { Hash, MaskLines, Num, Reveal, Spotlight } from "@/components/client.tsx";
import { ENTRY_META, GradeBadge, StagePill, dateTime, fmt } from "@/components/ui.tsx";
import { latestCheckpoint } from "@/lib/passport.ts";
import { overview } from "@/lib/stats.ts";
import { getDb } from "@/lib/store.ts";
import { ClaimChecker } from "./ClaimChecker.tsx";
import { HeroGlobe } from "@/components/HeroGlobe.tsx";
import { globeData } from "@/lib/globe-data.ts";

export const dynamic = "force-dynamic";

const PILLARS = [
  { title: "Lifecycle tracking", body: "Every handover is an instruction signed by that party's own key, hash-chained to the one before it.", Icon: Link2 },
  { title: "Digital product passports", body: "Scan a QR code for materials, origin, footprint and custody. Exports as a machine-readable passport anyone can check against the public chain.", Icon: ScanLine },
  { title: "Recycling traceability", body: "Recovered material becomes new lots linked to their source product. Recycled content is proven by mass balance.", Icon: Recycle },
  { title: "Circular incentives", body: "Return rewards, repair bonuses and recovery credits are minted only against a matching signed event.", Icon: Coins },
];

const CATEGORY_HUE: Record<string, string> = { apparel: "#c4a1ff", battery: "#c8f169", electronics: "#7cc4ff", packaging: "#e0b77a" };

export default function Home() {
  const db = getDb();
  const s = overview(db);
  const cp = latestCheckpoint(db);
  const recent = db.ledger.slice(-8).reverse();
  const ticker = db.ledger.slice(-24).reverse();
  const actorName = (id: string) => db.actors.find((a) => a.id === id)?.name ?? id;
  const globe = globeData(db);

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative -mt-10 pb-6 pt-16">
        <div aria-hidden className="pointer-events-none absolute -top-32 bottom-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]">
          <div className="aurora-a absolute -left-[10%] -top-[30%] h-[70%] w-[60%] rounded-full bg-accent/20 blur-[90px]" />
          <div className="aurora-b absolute -right-[10%] top-[10%] h-[60%] w-[45%] rounded-full bg-leaf/15 blur-[90px]" />
          <div className="aurora-a absolute bottom-[-30%] left-[30%] h-[50%] w-[40%] rounded-full bg-sky/10 blur-[90px]" />
          <div className="absolute inset-0 [background-image:radial-gradient(#ffffff12_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />
        </div>
        {/* Interactive globe fills the right side on wide screens */}
        <div className="absolute right-[-1rem] top-14 z-10 hidden h-[min(30vw,440px)] w-[min(30vw,430px)] lg:block">
          <HeroGlobe nodes={globe.nodes} routes={globe.routes} className="h-full w-full" />
        </div>
        <div className="relative">
          <Reveal>
            <div className="label text-accent">IEEE ClimateChain · Sustainable supply chains</div>
          </Reveal>
          <h1 className="display mt-6 text-[clamp(3.25rem,8.5vw,8rem)]">
            <MaskLines
              lines={[
                <>Green claims,</>,
                <>
                  <em className="text-accent">checked</em> against
                </>,
                <>the supply chain.</>,
              ]}
            />
          </h1>
          <p className="mt-8 max-w-[52ch] text-lg leading-relaxed text-ink-soft">
              A hoodie says <span className="text-ink">&ldquo;70% recycled, carbon neutral, ethically made.&rdquo;</span> Orbit&apos;s passport checks each claim against what the fibre supplier, the retailer and the auditor signed. The hoodie fails all four.
          </p>
          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/passport/${s.products[1]?.product.id ?? s.products[0]?.product.id}`} className="btn btn-primary group">
                See a greenwashed product get caught <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/ledger" className="btn btn-ghost">
                Try to tamper with history
              </Link>
            </div>
            <ul className="mt-8 grid max-w-2xl gap-2 sm:grid-cols-2" aria-label="What the hoodie's label says versus what Orbit finds">
              {[
                ["70% recycled", "6.7% recycled", "From the suppliers' signed lots"],
                ["Shipped by sea", "Flown: 2,892 km in 24 h", "From the retailer's signed receipt"],
                ["Carbon neutral, 1.2 kg", "6.0 kg CO₂e", "Recomputed for the real route"],
                ["Ethically made", "Audit rejected", "From the auditor's signed verdict"],
              ].map(([label, found, why]) => (
                <li key={label} className="rounded-xl border border-line bg-surface/70 px-4 py-3 backdrop-blur">
                  <div className="text-[13px] text-muted line-through decoration-rust/70">{label}</div>
                  <div className="mt-0.5 font-semibold text-rust">{found}</div>
                  <div className="text-[12px] text-muted">{why}</div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Live ledger marquee */}
      <section aria-label="Latest ledger entries" className="marquee relative left-1/2 -mt-12 w-screen -translate-x-1/2 overflow-hidden border-y border-line bg-surface/60 py-3">
        <div aria-hidden className="[mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="marquee-track flex w-max gap-10">
            {[...ticker, ...ticker].map((e, i) => (
              <span key={i} className="hash flex items-center gap-2 whitespace-nowrap">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="text-accent/80">#{e.index}</span>
                <span>{e.hash.slice(0, 6)}…{e.hash.slice(-4)}</span>
                <span className="text-ink">{ENTRY_META[e.type].label}</span>
                <span className="text-muted">{e.subjectId}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Bento */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Reveal className="col-span-2 md:col-span-4 md:row-span-2">
          <Spotlight className="flex h-full flex-col justify-between p-7">
            <div className="flex items-start justify-between">
              <div className="label">CO₂e avoided by recycled inputs</div>
              <ArrowUpRight className="h-4 w-4 text-muted" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex items-end gap-3">
                <span className="display text-[clamp(4.5rem,11vw,9rem)] leading-[0.85] text-accent">
                  <Num value={s.avoidedKg} decimals={1} />
                </span>
                <span className="pb-3 text-xl text-ink-soft">kg CO₂e</span>
              </div>
              <p className="mt-4 max-w-md text-sm text-ink-soft">
                {fmt(s.recoveredKg, 2)} kg of material recovered into new recycled lots, each traceable to the passport it came from.
              </p>
            </div>
          </Spotlight>
        </Reveal>
        <Reveal className="col-span-2" delay={0.05}>
          <Link href="/ledger" className="block h-full">
            <Spotlight className="h-full p-5">
              <div className="flex items-start justify-between">
                <div className="label">Chain integrity</div>
                <Fingerprint className="h-4 w-4 text-muted" strokeWidth={1.5} />
              </div>
              <div className={`display mt-3 text-5xl ${s.integrity.ok ? "text-leaf" : "text-rust"}`}>
                <Num value={s.integrity.checked} />
              </div>
              <div className="mt-1 text-xs text-muted">{s.integrity.ok ? "entries · every hash & signature valid" : `${s.integrity.issues.length} problems detected`}</div>
            </Spotlight>
          </Link>
        </Reveal>
        <Reveal className="col-span-2" delay={0.1}>
          <Spotlight className="h-full p-5">
            <div className="flex items-start justify-between">
              <div className="label">Anchored on-chain</div>
              <Anchor className="h-4 w-4 text-muted" strokeWidth={1.5} />
            </div>
            {cp ? (
              <>
                <div className="display mt-3 text-3xl">{cp.onChain ? cp.network : "Local only"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  root <Hash value={cp.merkleRoot} /> · {cp.covers} entries
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-muted">No checkpoint yet</div>
            )}
          </Spotlight>
        </Reveal>
        {[
          { label: "Passports", value: db.products.length, sub: `${db.batches.length} material lots` },
          { label: "Claims verified", value: s.claimsVerified, sub: `of ${s.claimsTotal} checked against data` },
          { label: "Greenwashing caught", value: s.claimsContradicted, sub: "claims contradicted", tone: "text-rust" },
        ].map((k, i) => (
          <Reveal key={k.label} className="col-span-1 md:col-span-2" delay={0.05 * i}>
            <div className="card h-full p-5">
              <div className="label">{k.label}</div>
              <div className={`display mt-3 text-5xl ${k.tone ?? ""}`}>
                <Num value={k.value} />
              </div>
              <div className="mt-1 text-xs text-muted">{k.sub}</div>
            </div>
          </Reveal>
        ))}
      </section>

      {/* Products */}
      <section>
        <Reveal>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="display text-5xl">
              Product <em className="text-accent">passports</em>
            </h2>
            <p className="max-w-sm text-sm text-muted">Trust grade: points for claims backed by signed evidence and a traced lifecycle, minus contradicted claims, misdeclared transport and banned wording.</p>
          </div>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2">
          {s.products.map(({ product: p, brand, stage, trust, recycledPct, co2e }, i) => {
            const verified = trust.claims.filter((c) => c.status === "VERIFIED").length;
            const bad = trust.claims.some((c) => c.status === "CONTRADICTED");
            return (
              <Reveal key={p.id} delay={0.05 * i}>
                <Link href={`/passport/${p.id}`} className="group block">
                  <Spotlight as="article" className="overflow-hidden">
                    <div
                      className="relative flex h-40 items-center justify-center overflow-hidden border-b border-line"
                      style={{ background: `radial-gradient(120% 120% at 20% 0%, color-mix(in oklab, ${CATEGORY_HUE[p.category]} 18%, transparent), transparent 60%)` }}
                    >
                      <span className="text-7xl transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-110">{p.emoji}</span>
                      <div className="absolute right-4 top-4">
                        <GradeBadge grade={trust.grade} score={trust.score} />
                      </div>
                      <div className="absolute left-4 top-4">
                        <StagePill stage={stage} />
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                        <span className="hash">{p.id}</span>
                      </div>
                      <div className="text-sm text-muted">{brand.name}</div>
                      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-sm">
                        <MicroStat label="CO₂e" value={`${fmt(co2e, 1)} kg`} />
                        <MicroStat label="Recycled" value={`${fmt(recycledPct, 0)}%`} />
                        <MicroStat label="Claims" value={`${verified}/${trust.claims.length}`} tone={bad ? "text-rust" : "text-leaf"} />
                      </div>
                      <p className={`mt-3 text-xs ${bad ? "text-rust" : "text-ink-soft"}`}>{trust.summary}</p>
                    </div>
                  </Spotlight>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Check any claim */}
      <section>
        <Reveal>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="display text-5xl">
              Check <em className="text-accent">any</em> claim
            </h2>
            <p className="max-w-sm text-sm text-muted">Paste a line from a real label. See whether EU rules ban the wording, and what signed data Orbit would test it against.</p>
          </div>
        </Reveal>
        <ClaimChecker />
      </section>

      {/* Pillars */}
      <section className="grid gap-3 md:grid-cols-4">
        {PILLARS.map((p, i) => (
          <Reveal key={p.title} delay={0.06 * i}>
            <div className="card h-full p-6">
              <p.Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
              <div className="mt-6 font-semibold">{p.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* Activity */}
      <Reveal>
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="font-semibold">Latest ledger activity</h2>
            <Link href="/ledger" className="text-sm font-medium text-accent hover:underline">
              Full ledger →
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {recent.map((e) => (
              <li key={e.index} className="flex items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-raised">
                <span className="w-6 text-center">{ENTRY_META[e.type].icon}</span>
                <span className="hash w-10">#{e.index}</span>
                <span className="font-medium">{ENTRY_META[e.type].label}</span>
                <span className="truncate text-muted">
                  {actorName(e.actorId)} · {e.subjectId}
                </span>
                <span className="ml-auto hidden shrink-0 text-xs text-muted md:block">{dateTime(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>
    </div>
  );
}

function MicroStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`mt-0.5 font-medium tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
