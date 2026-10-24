import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ActionButton } from "@/components/act.tsx";
import { Bar, ENTRY_META, GRADE_COLOR, GradeBadge, RoleTag, STATUS_COLOR, StagePill, StatusPill, dateTime, fmt, short } from "@/components/ui.tsx";
import { WorldMap, type MapStop } from "@/components/WorldMap.tsx";
import { avoidedCo2e, carbonFootprint, custody, getActor, journey, materialLines, productEntries, productMass, provenRecycledPct } from "@/lib/domain.ts";
import { checkAnchors } from "@/lib/chain.ts";
import { verifyLedger } from "@/lib/ledger.ts";
import { getDb } from "@/lib/store.ts";
import type { Place } from "@/lib/types.ts";
import { trustReport } from "@/lib/verify.ts";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  RECYCLED_CONTENT: "Recycled content",
  CARBON_FOOTPRINT: "Carbon footprint",
  ORIGIN: "Origin",
  ETHICAL_LABOR: "Labour standards",
  REPAIRABILITY: "Repairability",
};

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const p = db.products.find((x) => x.id === id);
  if (!p) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/passport/${p.id}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0e1613", light: "#f3f1ea" } });

  const integrity = verifyLedger(db);
  const anchorChecks = (await checkAnchors(db)).filter((a) => a.status !== "ignored");
  // Show a mismatch from any trusted party first; otherwise the most recent trusted checkpoint.
  const anchor = anchorChecks.find((a) => a.status === "mismatch") ?? anchorChecks.at(-1);
  const trust = trustReport(db, p, integrity);
  const brand = getActor(db, p.brandId);
  const c = custody(db, p.id);
  const holder = getActor(db, c.holderId);
  const lines = materialLines(db, p);
  const mass = productMass(p);
  const cf = carbonFootprint(db, p);
  const recycled = provenRecycledPct(db, p);
  const avoided = avoidedCo2e(db, p);
  const entries = productEntries(db, p.id);
  const keyOf = new Map(db.actors.map((a) => [a.id, a]));
  const recyclers = db.actors.filter((a) => a.role === "recycler");

  // Forward traceability: what did this product become?
  const recoveredLots = db.batches.filter((b) => b.sourceProductIds.includes(p.id));
  const reborn = db.products.filter((q) => q.inputs.some((i) => recoveredLots.some((b) => b.id === i.batchId)));
  // Backward: which products did this one's material come from?
  const ancestors = [...new Set(lines.flatMap((l) => l.batch.sourceProductIds))].map((pid) => db.products.find((q) => q.id === pid)).filter(Boolean);

  const j = journey(db, p);
  const stops: MapStop[] = j.map((s, i) => ({ place: s.place, label: s.label, kind: s.type === "SOURCE" ? "source" : i === j.length - 1 ? "current" : "event" }));
  const routes: [Place, Place][] = [];
  const made = j.find((s) => s.type === "MANUFACTURED");
  for (const s of j) if (s.type === "SOURCE" && made) routes.push([s.place, made.place]);
  const lifecycle = j.filter((s) => s.type !== "SOURCE");
  for (let i = 1; i < lifecycle.length; i++) routes.push([lifecycle[i - 1].place, lifecycle[i].place]);
  // In transit or returned: draw the leg towards the party it is heading to.
  const headingTo = c.pendingRecipientId ?? (c.stage === "returned" ? c.holderId : undefined);
  if (headingTo && lifecycle.length) {
    const dest = getActor(db, headingTo).place;
    stops.forEach((s) => s.kind === "current" && (s.kind = "event"));
    stops.push({ place: dest, label: "destination", kind: "current" });
    routes.push([lifecycle[lifecycle.length - 1].place, dest]);
  }

  return (
    <div className="space-y-10">
      {anchor?.status === "mismatch" && (
        <div className="rounded-xl border border-rust bg-rust-soft p-4 text-sm font-semibold text-rust">
          ⚠ This ledger no longer matches a root published on {anchor.network}. History was rewritten after it was anchored, even though every local signature still checks out.{" "}
          <Link href="/ledger" className="underline">
            Inspect ledger
          </Link>
        </div>
      )}
      {!trust.integrity.ok && (
        <div className="rounded-xl border border-rust bg-rust-soft p-4 text-sm font-semibold text-rust">
          ⚠ Tampering detected. {trust.integrity.passportTampered ? "The passport record no longer matches the hash signed at manufacture." : `${trust.integrity.badEntries} ledger entr${trust.integrity.badEntries > 1 ? "ies fail" : "y fails"} signature or hash checks.`}{" "}
          <Link href="/ledger" className="underline">
            Inspect ledger
          </Link>
        </div>
      )}

      {/* Header */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-[80px]" style={{ background: `color-mix(in oklab, ${GRADE_COLOR[trust.grade]} 22%, transparent)` }} />
        <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <div className="label">Digital product passport · {p.id}</div>
            <h1 className="display mt-3 text-[clamp(2.75rem,6vw,5rem)]">
              <span className="mr-3 align-middle text-[0.8em]">{p.emoji}</span>
              {p.name}
            </h1>
            <p className="mt-3 max-w-xl text-ink-soft">
              by <span className="font-medium text-ink">{brand.name}</span> · {p.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <StagePill stage={c.stage} />
              <span className="text-muted">
                Held by <span className="text-ink">{holder.name}</span>
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>GS1 Digital Link</span>
              <span className="hash break-all">id.gs1.org/01/{p.gtin}/21/{p.serial}</span>
            </div>
            {anchor && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {anchor.status === "match" ? (
                  <span className="chip border-leaf/30 bg-leaf-soft text-leaf">⚓ Anchored on {anchor.network} · #{anchor.id}</span>
                ) : anchor.status === "local" ? (
                  <span className="chip border-amber/30 bg-amber-soft text-amber">⚓ Local checkpoint only</span>
                ) : anchor.status === "mismatch" ? (
                  <span className="chip border-rust/40 bg-rust-soft text-rust">✕ Differs from on-chain anchor</span>
                ) : (
                  <span className="chip border-amber/30 bg-amber-soft text-amber">⚓ Chain unreachable</span>
                )}
                {anchor.explorerTx && (
                  <a href={anchor.explorerTx} target="_blank" className="text-accent hover:underline">
                    view transaction ↗
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <GradeBadge grade={trust.grade} score={trust.score} size="lg" />
              <div className="label mt-3">Trust {trust.score}/100</div>
            </div>
            <div className="w-28 text-center">
              <div className="paper overflow-hidden rounded-xl p-1.5" dangerouslySetInnerHTML={{ __html: qr }} />
              <div className="mt-2 text-[11px] text-muted">Scan to open</div>
            </div>
          </div>
        </div>
        <div className={`relative mt-6 rounded-xl border px-4 py-3 text-sm ${trust.claims.some((x) => x.status === "CONTRADICTED") || !trust.integrity.ok ? "border-rust/30 bg-rust-soft" : "border-line bg-raised"}`}>
          <span className="label mr-2">Verdict</span>
          {trust.summary}
        </div>
        <details className="relative mt-3 rounded-xl border border-line bg-raised px-4 py-3 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Why {trust.score}/100 (grade {trust.grade})
          </summary>
          <table className="mt-3 w-full text-[13px]">
            <tbody>
              {trust.breakdown.map((b) => (
                <tr key={b.label} className="border-t border-line/60">
                  <td className="py-1.5 pr-3 text-ink-soft">{b.label}</td>
                  <td className={`py-1.5 text-right font-mono tabular-nums ${b.points < 0 ? "text-rust" : b.points > 0 ? "text-leaf" : "text-muted"}`}>
                    {b.points > 0 ? "+" : ""}
                    {Number.isInteger(b.points) ? b.points : b.points.toFixed(1)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line font-bold">
                <td className="py-1.5 pr-3">Score</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{trust.score}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-muted">Grades: A ≥ 85 · B ≥ 70 · C ≥ 50 · D ≥ 30 · E below. The verifier page re-derives this score in your browser.</p>
        </details>
      </section>

      {/* Claims */}
      <section>
        <h2 className="display mb-5 text-4xl">
          Claims, <em className="text-accent">checked</em>
        </h2>
        {trust.claims.length === 0 && <div className="card p-5 text-sm text-muted">No claims issued for this product.</div>}
        <div className="grid gap-3 md:grid-cols-2">
          {[...trust.claims]
            .sort((x, y) => (x.status === "CONTRADICTED" ? 0 : 1) - (y.status === "CONTRADICTED" ? 0 : 1))
            .map((r) => (
              <div key={r.claim.id} className="card overflow-hidden p-5" style={{ boxShadow: `inset 3px 0 0 ${STATUS_COLOR[r.status]}` }}>
                <div className="flex items-center justify-between gap-2">
                  <StatusPill status={r.status} />
                  <div className="label">{KIND_LABEL[r.claim.kind]}</div>
                </div>
                <div className="mt-3 text-[16px] font-medium leading-snug">“{r.claim.statement}”</div>
                <ul className="mt-4 space-y-1.5 text-[13px]">
                  {r.evidence.map((e) => (
                    <li key={e} className="flex gap-2 text-ink-soft">
                      <span className="text-leaf">✓</span>
                      {e}
                    </li>
                  ))}
                  {r.reasons.map((e) => (
                    <li key={e} className={`flex gap-2 ${r.status === "CONTRADICTED" ? "font-medium text-rust" : "text-amber"}`}>
                      <span>{r.status === "CONTRADICTED" ? "✕" : "◷"}</span>
                      {e}
                    </li>
                  ))}
                  {r.caveats.map((cv) => (
                    <li key={cv} className="flex gap-2 text-amber">
                      <span>ⓘ</span>
                      {cv}
                    </li>
                  ))}
                  {r.lint.map((l) => (
                    <li key={l.term} className="flex gap-2 text-amber">
                      <span>⚠</span>
                      <span>
                        <b>“{l.term}”</b>: {l.reason}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
                  {r.claim.id} · issued by {getActor(db, r.claim.issuerId).name}
                  {r.claim.evidenceHash && <> · evidence sha256 {short(r.claim.evidenceHash, 8)}</>}
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* Materials + carbon */}
      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-3xl">Materials & provenance</h2>
            <span className="text-sm text-muted">{fmt(mass, 3)} kg total</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">Material</th>
                  <th className="font-medium">Lot</th>
                  <th className="font-medium">Origin</th>
                  <th className="text-right font-medium">kg</th>
                  <th className="w-28 pl-3 font-medium">Recycled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium">
                      {l.label}
                      {l.closedLoop && <span className="ml-1.5 rounded bg-leaf-soft px-1.5 py-0.5 text-[10px] font-bold text-leaf">CLOSED LOOP</span>}
                    </td>
                    <td className="hash">{l.batch.id}</td>
                    <td className="text-ink-soft">
                      {getActor(db, l.batch.producerId).name}, {l.origin.country}
                    </td>
                    <td className="text-right tabular-nums">{fmt(l.massKg, 3)}</td>
                    <td className="pl-3">
                      <Bar
                        parts={[
                          { value: l.recycledKg, color: "#5ee0a0", label: "recycled" },
                          { value: l.massKg - l.recycledKg, color: "#34473f", label: "virgin" },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-leaf-soft px-4 py-3">
            <div className="display text-5xl text-leaf">{fmt(recycled, 1)}%</div>
            <div className="text-sm text-ink-soft">recycled content, proven by mass balance across signed material lots</div>
          </div>
          {(ancestors.length > 0 || reborn.length > 0) && (
            <div className="mt-3 space-y-1 text-sm">
              {ancestors.map((a) => (
                <div key={a!.id}>
                  ↖ Material recovered from{" "}
                  <Link className="font-semibold text-leaf underline" href={`/passport/${a!.id}`}>
                    {a!.name} ({a!.id})
                  </Link>
                </div>
              ))}
              {reborn.map((q) => (
                <div key={q.id}>
                  ↘ Material reborn as{" "}
                  <Link className="font-semibold text-leaf underline" href={`/passport/${q.id}`}>
                    {q.name} ({q.id})
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="display text-3xl">Carbon footprint</h2>
          <div className="display mt-3 text-6xl">
            {fmt(cf.total, 2)} <span className="font-sans text-base text-muted">kg CO₂e</span>
          </div>
          <div className="mt-3">
            <Bar
              parts={[
                { value: cf.materials, color: "#c8f169", label: "Materials" },
                { value: cf.manufacturing, color: "#f4be4f", label: "Manufacturing & repair" },
                { value: cf.transport, color: "#7cc4ff", label: "Transport" },
              ]}
            />
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Materials · from lots signed by suppliers & recyclers"v={`${fmt(cf.materials, 2)} kg`} dot="#c8f169" />
            <Row k="Factory & repair · self-reported" v={`${fmt(cf.manufacturing, 2)} kg`} dot="#f4be4f" />
            <Row k={`Transport · ${cf.legs.length} leg${cf.legs.length === 1 ? "" : "s"}, from registered sites`} v={`${fmt(cf.transport, 3)} kg`} dot="#7cc4ff" />
          </dl>
          {cf.legs.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-xs text-muted">
              {cf.legs.map((l, i) => (
                <li key={i} className={l.check === "contradicted" ? "rounded-lg border border-rust/30 bg-rust-soft p-2 text-rust" : ""}>
                  {getActor(db, l.from).place.city} → {getActor(db, l.to).place.city}: {fmt(l.distanceKm, 0)} km by{" "}
                  {l.check === "contradicted" ? (
                    <>
                      <s>{l.declaredMode}</s> <b>{l.mode}</b> · {l.note}
                    </>
                  ) : (
                    <>
                      {l.mode} {l.check === "consistent" ? <span className="text-leaf">· ✓ arrival time fits</span> : <span className="text-amber">· awaiting receipt</span>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {avoided > 0 && (
            <div className="mt-4 rounded-xl bg-leaf-soft px-4 py-3 text-sm">
              <b className="text-leaf">{fmt(avoided, 2)} kg CO2e avoided</b> by using recycled instead of virgin material.
            </div>
          )}
        </div>
      </section>

      {/* Journey */}
      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="card p-4">
          <h2 className="display mb-3 px-1 text-3xl">Journey</h2>
          <WorldMap stops={stops} routes={routes} />
          <div className="mt-2 flex gap-4 px-1 text-xs text-muted">
            <span>
              <span className="inline-block h-2 w-2 rounded-full bg-[#e0b77a]" /> material source
            </span>
            <span>
              <span className="inline-block h-2 w-2 rounded-full bg-ink" /> lifecycle event
            </span>
            <span>
              <span className="inline-block h-2 w-2 rounded-full bg-accent" /> latest
            </span>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="display text-3xl">End of life</h2>
          <p className="mt-2 text-sm text-ink-soft">{p.endOfLife}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Repairability" v={`${p.repairabilityScore}/10`} />
            <Row k="Warranty" v={`${p.warrantyYears} year${p.warrantyYears === 1 ? "" : "s"}`} />
            <Row k="Return reward" v={`${p.depositCredits} credits`} />
          </dl>
          {c.stage === "in-use" && (
            <div className="mt-4 rounded-xl border border-line p-3">
              <div className="text-sm font-semibold">Return as {holder.name}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recyclers.map((r) => (
                  <ActionButton key={r.id} action="return" actorId={holder.id} body={{ productId: p.id, toId: r.id }} className="btn btn-ghost text-xs">
                    ↩ to {r.name}
                  </ActionButton>
                ))}
              </div>
            </div>
          )}
          {c.stage === "returned" && (
            <div className="mt-4">
              <ActionButton action="recycle" actorId={holder.id} body={{ productId: p.id }}>
                ♻ Recycle as {holder.name}
              </ActionButton>
            </div>
          )}
          <a href={`/api/passport/${p.id}`} target="_blank" className="mt-4 block text-sm font-semibold text-leaf">
            Download machine-readable passport (JSON-LD) →
          </a>
        </div>
      </section>

      {/* Timeline */}
      <section className="card p-5">
        <h2 className="display text-3xl">Signed event trail</h2>
        <p className="text-sm text-muted">Each entry is chained to the one before it by its hash. The party who recorded it signed the instruction behind it, and Orbit&apos;s sequencer signed the entry.</p>
        <ol className="mt-4 space-y-0">
          {entries.map((e) => {
            const a = keyOf.get(e.actorId);
            const bad = integrity.badIndexes.has(e.index);
            return (
              <li key={e.index} className="relative flex gap-4 pb-4 pl-1">
                <div className="flex flex-col items-center">
                  <div className={`grid h-8 w-8 place-items-center rounded-full text-sm ${bad ? "bg-rust-soft" : "bg-paper"}`}>{ENTRY_META[e.type].icon}</div>
                  <div className="w-px flex-1 bg-line" />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{ENTRY_META[e.type].label}</span>
                    {a && <RoleTag role={a.role} />}
                    <span className="text-sm text-ink-soft">{a?.name}</span>
                    <span className="ml-auto text-xs text-muted">{dateTime(e.timestamp)}</span>
                  </div>
                  <EntryDetail data={e.data} names={(x) => keyOf.get(x)?.name} />
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
                    <span className="hash">#{e.index}</span>
                    <span className="hash">hash {short(e.hash, 12)}</span>
                    <span className="hash">sig {short(e.signature, 12)}</span>
                    <span className={`font-semibold ${bad ? "text-rust" : "text-leaf"}`}>{bad ? "✕ invalid" : "✓ signature valid"}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Row({ k, v, dot }: { k: string; v: string; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-ink-soft">
        {dot && <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />}
        {k}
      </dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

function EntryDetail({ data, names }: { data: Record<string, unknown>; names: (id: string) => string | undefined }) {
  const parts: string[] = [];
  if (data.to) parts.push(`to ${names(String(data.to)) ?? data.to}`);
  if (data.mode) parts.push(`by ${data.mode}`);
  if (data.distanceKm) parts.push(`${fmt(Number(data.distanceKm), 0)} km`);
  if (data.note) parts.push(String(data.note));
  if (data.verdict) parts.push(`verdict: ${data.verdict}`);
  if (data.kind) parts.push(`${String(data.kind).toLowerCase().replace("_", " ")}: ${data.value}`);
  if (data.amount) parts.push(`${data.amount} credits (${String(data.reason ?? data.reward ?? "").replace(/-/g, " ")})`);
  if (data.recoveredKg) parts.push(`${fmt(Number(data.recoveredKg), 3)} kg recovered`);
  if (data.co2eKg) parts.push(`${data.co2eKg} kg CO2e`);
  if (!parts.length) return null;
  return <div className="mt-0.5 text-sm text-ink-soft">{parts.join(" · ")}</div>;
}
