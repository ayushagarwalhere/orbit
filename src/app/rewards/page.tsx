import Link from "next/link";
import { ActionButton } from "@/components/act.tsx";
import { PageHeader, RoleTag, Stat, dateTime, fmt } from "@/components/ui.tsx";
import { REWARDS } from "@/lib/actions.ts";
import { balances, custody } from "@/lib/domain.ts";
import { getDb } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  "return-reward": "Return reward for bringing a product back",
  "deposit-refund": "Return reward for bringing a product back",
  "material-recovered": "Material recovered at recycling",
  "repair-instead-of-replace": "Repaired instead of replaced",
};

export default function RewardsPage() {
  const db = getDb();
  const bal = balances(db);
  const actor = (id: string) => db.actors.find((a) => a.id === id);
  const board = [...bal.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const consumers = db.actors.filter((a) => a.role === "consumer");
  const history = db.ledger.filter((e) => e.type === "CREDIT_MINTED" || e.type === "CREDIT_REDEEMED").reverse();
  const minted = history.filter((e) => e.type === "CREDIT_MINTED").reduce((s, e) => s + Number(e.data.amount), 0);
  const redeemed = history.filter((e) => e.type === "CREDIT_REDEEMED").reduce((s, e) => s + Number(e.data.amount), 0);

  const brands = db.actors
    .filter((a) => a.role === "manufacturer")
    .map((b) => {
      const ps = db.products.filter((p) => p.brandId === b.id);
      const sold = ps.filter((p) => db.ledger.some((e) => e.type === "SOLD" && e.subjectId === p.id)).length;
      const back = ps.filter((p) => ["returned", "recycled"].includes(custody(db, p.id).stage)).length;
      const closedLoop = ps.filter((p) => p.inputs.some((i) => db.batches.find((x) => x.id === i.batchId)?.sourceProductIds.length)).length;
      return { brand: b, made: ps.length, sold, back, closedLoop };
    });

  return (
    <div className="space-y-6">
      <PageHeader kicker="Circular economy incentives" title={<>Circularity <em className="text-accent">rewards</em></>}>
          Credits are minted by the protocol, not by brands, and only against a matching signed event: a repair, a return or a recycler&apos;s signed record of recovered material. Each mint references the hash of the event that triggered it and sits inside the Merkle root anchored on-chain, so the total supply is publicly auditable.
      </PageHeader>

      <div className="card grid gap-4 p-5 text-sm md:grid-cols-3">
        <div>
          <div className="label">Why not a tradable token?</div>
          <p className="mt-2 text-ink-soft">A return reward has to be worth the same next week. A tradable token invites farming, wash-trading and price swings, so credits are deliberately non-transferable.</p>
        </div>
        <div>
          <div className="label">Regulation</div>
          <p className="mt-2 text-ink-soft">A transferable token with market value can fall under the EU&apos;s MiCA rules. Closed-loop rewards redeemable within a limited network are treated differently.</p>
        </div>
        <div>
          <div className="label">On-chain if a scheme wants it</div>
          <p className="mt-2 text-ink-soft">OrbitAnchor can verify an event&apos;s inclusion on-chain, so a token contract could mint only against an anchored return or recycling proof. No operator could mint from nothing.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Credits minted" value={fmt(minted, 0)} tone="leaf" />
        <Stat label="Credits redeemed" value={fmt(redeemed, 0)} />
        <Stat label="Earning actors" value={String(board.length)} />
        <Stat label="Products returned" value={String(db.ledger.filter((e) => e.type === "RETURNED").length)} sub="each earning a return reward" />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="display text-3xl">Consumer wallets</h2>
          <div className="mt-3 space-y-4">
            {consumers.map((c) => {
              const owned = db.products.filter((p) => custody(db, p.id).holderId === c.id && custody(db, p.id).stage === "in-use");
              return (
                <div key={c.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.name}</div>
                    <div className="display text-4xl text-accent">{bal.get(c.id) ?? 0} <span className="font-sans text-sm text-muted">cr</span></div>
                  </div>
                  {owned.length > 0 && (
                    <div className="mt-1 text-xs text-muted">
                      Returnable:{" "}
                      {owned.map((p) => (
                        <Link key={p.id} href={`/passport/${p.id}`} className="mr-2 text-leaf underline">
                          {p.emoji} {p.name} (+{p.depositCredits})
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {REWARDS.map((r) => (
                      <ActionButton key={r.id} action="redeem" actorId={c.id} body={{ rewardId: r.id }} className="btn btn-ghost text-xs">
                        {r.label} · {r.cost}
                      </ActionButton>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="display text-3xl">Leaderboard</h2>
            <ol className="mt-3 space-y-2">
              {board.map(([id, v], i) => {
                const a = actor(id);
                return (
                  <li key={id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 font-bold text-muted">{i + 1}</span>
                    <span className="font-medium">{a?.name ?? id}</span>
                    {a && <RoleTag role={a.role} />}
                    <span className="ml-auto font-bold tabular-nums">{v}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card p-5">
            <h2 className="display text-3xl">Brand circularity</h2>
            <table className="table mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="font-medium">Brand</th>
                  <th className="text-right font-medium">Made</th>
                  <th className="text-right font-medium">Sold</th>
                  <th className="text-right font-medium">Came back</th>
                  <th className="text-right font-medium">Closed-loop</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.brand.id} className="border-t border-line">
                    <td className="py-2 font-medium">{b.brand.name}</td>
                    <td className="text-right">{b.made}</td>
                    <td className="text-right">{b.sold}</td>
                    <td className="text-right">{b.back}</td>
                    <td className="text-right">{b.closedLoop}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="display text-3xl">Credit history</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {history.map((e) => {
            const minted = e.type === "CREDIT_MINTED";
            const who = actor(minted ? String(e.data.to) : e.actorId);
            return (
              <li key={e.index} className="flex flex-wrap items-center gap-3 py-2">
                <span className={`w-16 font-bold tabular-nums ${minted ? "text-leaf" : "text-rust"}`}>
                  {minted ? "+" : "−"}
                  {String(e.data.amount)}
                </span>
                <span className="font-medium">{who?.name}</span>
                <span className="text-muted">{minted ? REASON[String(e.data.reason)] ?? String(e.data.reason) : String(e.data.label)}</span>
                {typeof e.data.productId === "string" && (
                  <Link href={`/passport/${e.data.productId}`} className="hash text-leaf underline">
                    {e.data.productId}
                  </Link>
                )}
                <span className="ml-auto text-xs text-muted">{dateTime(e.timestamp)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
