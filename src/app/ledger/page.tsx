import Link from "next/link";
import { ActionButton } from "@/components/act.tsx";
import { ENTRY_META, RoleTag, dateTime, short } from "@/components/ui.tsx";
import { verifyLedger } from "@/lib/ledger.ts";
import { getDb } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export default function LedgerPage() {
  const db = getDb();
  const r = verifyLedger(db);
  const actors = new Map(db.actors.map((a) => [a.id, a]));
  const products = new Map(db.products.map((p) => [p.id, p]));
  const claims = new Map(db.claims.map((c) => [c.id, c]));
  const linkFor = (subjectId: string) => {
    if (products.has(subjectId)) return `/passport/${subjectId}`;
    const c = claims.get(subjectId);
    if (c) return `/passport/${c.productId}`;
    return null;
  };

  // A few interesting entries for the tamper demo.
  const pick = (pred: (i: number) => boolean, label: string) => {
    const i = db.ledger.findIndex((_, idx) => pred(idx));
    return i >= 0 ? { index: i, label } : null;
  };
  const suggestions = [
    pick((i) => db.ledger[i].type === "CLAIM_ATTESTED" && db.ledger[i].data.verdict === "REJECT", "Flip a failed labour audit to APPROVE"),
    pick((i) => db.ledger[i].type === "SHIPPED" && db.ledger[i].data.mode === "air", "Hide an air-freight leg (distance → 1 km)"),
    pick((i) => db.ledger[i].type === "CREDIT_MINTED", "Inflate a credit payout ×10"),
    pick((i) => db.ledger[i].type === "BATCH_CREATED" && db.ledger[i].data.recycledKg === 0, "Relabel a virgin material lot as recycled"),
  ].filter(Boolean) as { index: number; label: string }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Ledger</h1>
        <p className="mt-1 max-w-2xl text-ink-soft">
          An append-only log. Each entry stores the hash of the one before it and is signed with the recording actor&apos;s Ed25519 key. If anyone edits any past record, the hashes and signatures stop matching and the edit is caught.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className={`card p-5 ${r.ok ? "" : "border-rust"}`}>
          <div className="label">Integrity</div>
          <div className={`mt-1 text-2xl font-black ${r.ok ? "text-leaf" : "text-rust"}`}>{r.ok ? "✓ Intact" : "✕ Tampered"}</div>
          <div className="mt-1 text-sm text-muted">
            {r.checked} entries re-hashed, {r.checked} signatures checked
          </div>
          {!r.ok && (
            <ul className="mt-2 space-y-1 text-sm text-rust">
              {r.issues.map((i, k) => (
                <li key={k}>
                  #{i.index}: {i.problem} ({i.detail})
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <div className="label">Current Merkle root</div>
          <div className="mt-1 hash break-all">{r.merkleRoot}</div>
          <div className="mt-3 label">Checkpoints</div>
          <ul className="mt-1 space-y-1 text-xs">
            {db.checkpoints.slice(-3).map((c) => (
              <li key={c.index} className="hash">
                ⚓ {c.index} entries · {short(c.merkleRoot, 14)} · {c.network}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <ActionButton action="anchor" className="btn btn-ghost text-xs">
              ⚓ Anchor checkpoint now
            </ActionButton>
          </div>
        </div>
        <div className="card p-5">
          <div className="label">Tamper simulator</div>
          <p className="mt-1 text-sm text-ink-soft">Edit a past entry like a dishonest insider would. The insider can change the data but cannot forge the original signer&apos;s key.</p>
          {db.tamper ? (
            <div className="mt-3 space-y-2">
              <div className="text-sm font-semibold text-rust">Entry #{db.tamper.index} has been altered.</div>
              <ActionButton action="restore" className="btn btn-primary text-xs">
                Restore original
              </ActionButton>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {suggestions.map((s) => (
                <ActionButton key={s.index} action="tamper" body={{ index: s.index }} className="btn btn-ghost w-full justify-start text-left text-xs">
                  ✎ #{s.index}: {s.label}
                </ActionButton>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="py-2 font-medium">Event</th>
                <th className="py-2 font-medium">Signed by</th>
                <th className="py-2 font-medium">Subject</th>
                <th className="py-2 font-medium">Time</th>
                <th className="py-2 font-medium">Hash / prev</th>
                <th className="px-4 py-2 font-medium">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {db.ledger
                .slice()
                .reverse()
                .map((e) => {
                  const a = actors.get(e.actorId);
                  const bad = r.badIndexes.has(e.index);
                  const href = linkFor(e.subjectId);
                  return (
                    <tr key={e.index} className={bad ? "bg-rust-soft" : ""}>
                      <td className="px-4 py-2 hash">{e.index}</td>
                      <td className="py-2 whitespace-nowrap">
                        {ENTRY_META[e.type].icon} {ENTRY_META[e.type].label}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {a && <RoleTag role={a.role} />} {a?.name}
                        </div>
                      </td>
                      <td className="py-2 hash">
                        {href ? (
                          <Link href={href} className="text-leaf underline">
                            {e.subjectId}
                          </Link>
                        ) : (
                          e.subjectId
                        )}
                      </td>
                      <td className="py-2 whitespace-nowrap text-xs text-muted">{dateTime(e.timestamp)}</td>
                      <td className="py-2">
                        <div className="hash">{short(e.hash, 12)}</div>
                        <div className="hash opacity-60">↖ {short(e.prevHash, 12)}</div>
                      </td>
                      <td className={`px-4 py-2 text-xs font-bold ${bad ? "text-rust" : "text-leaf"}`}>{bad ? "✕ FAIL" : "✓"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
