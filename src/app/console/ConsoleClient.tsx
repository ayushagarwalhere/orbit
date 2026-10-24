"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { forgetGuest, guestRegistrationBody, loadGuest, newGuest, useAct, type Guest } from "@/components/act.tsx";
import { lintClaim } from "@/lib/greenwash.ts";
import type { ClaimKind, LifecycleStage, Role } from "@/lib/types.ts";

export interface ConsoleData {
  actors: { id: string; name: string; role: Role; city: string; balance: number }[];
  products: { id: string; name: string; emoji: string; brandId: string; stage: LifecycleStage; holderId: string; pendingRecipientId: string | null; recovery: Record<string, number> | null }[];
  batches: { id: string; material: string; label: string; remainingKg: number; recycledPct: number; producerId: string }[];
  claims: { id: string; productId: string; productName: string; kind: ClaimKind; statement: string; status: string; attestedBy: string[] }[];
  materials: { id: string; label: string }[];
}

const ROLE_ORDER: Role[] = ["supplier", "manufacturer", "logistics", "retailer", "consumer", "repairer", "recycler", "auditor"];
const ROLE_HELP: Record<Role, string> = {
  supplier: "Register raw material lots. Only recyclers can create recycled lots, so recycled content cannot be invented upstream.",
  manufacturer: "Build products from material lots (mass balance enforced), ship them, and publish sustainability claims.",
  logistics: "Receive shipments addressed to you and forward them. Distance and emissions are computed from signed locations.",
  retailer: "Receive stock and sell to consumers. The sale makes the buyer eligible for the return reward.",
  consumer: "Return products at end of life to earn their return reward as credits.",
  repairer: "Log repairs on products in use. Owners earn 15 credits for repairing instead of replacing, at most once per product every 30 days.",
  recycler: "Recycle returned products into new traceable recycled lots and earn 20 credits per kg recovered.",
  auditor: "Independently approve or reject claims. A rejection overrides the brand's claim.",
  protocol: "",
};

export function ConsoleClient({ data }: { data: ConsoleData }) {
  const [actorId, setActorId] = useState("lumen");
  const actor = data.actors.find((a) => a.id === actorId) ?? data.actors[0];
  const { act, error, busy } = useAct();
  const [last, setLast] = useState<string | null>(null);

  async function run(action: string, body: Record<string, unknown>, msg: string) {
    const res = await act<{ hash?: string; index?: number; id?: string }>(action, body, actor.id);
    if (res) setLast(`${msg}${res.index !== undefined ? ` · ledger #${res.index}` : res.id ? ` · ${res.id}` : ""}`);
  }

  const held = data.products.filter((p) => p.holderId === actor.id && p.stage !== "in-transit" && p.stage !== "recycled");
  const incoming = data.products.filter((p) => p.pendingRecipientId === actor.id);
  const name = (id: string) => data.actors.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="card h-fit p-3">
        <GuestPanel actors={data.actors} onPick={(id) => {
          setActorId(id);
          setLast(null);
        }} />
        <div className="label px-2 pb-2">Acting as</div>
        {ROLE_ORDER.map((role) => (
          <div key={role} className="mb-1">
            {data.actors
              .filter((a) => a.role === role)
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setActorId(a.id);
                    setLast(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${a.id === actorId ? "bg-accent text-on-accent" : "hover:bg-raised"}`}
                >
                  <span className="truncate">{a.name}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${a.id === actorId ? "text-on-accent/70" : "text-muted"}`}>{a.role}</span>
                </button>
              ))}
          </div>
        ))}
      </aside>

      <div className="space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="display text-4xl">{actor.name}</div>
              <div className="text-sm text-muted">
                {actor.role} · {actor.city} · {actor.balance} credits
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm text-ink-soft">{ROLE_HELP[actor.role]}</p>
          <p className="mt-3 rounded-lg border border-amber/30 bg-amber-soft px-3 py-2 text-xs text-amber">
            Demo mode: your browser holds role-play keys for every demo party, so you can act as anyone. Requests are still signed here and verified by the API. In production each key stays in its owner&apos;s wallet.
          </p>
          {last && <div className="mt-3 rounded-lg bg-leaf-soft px-3 py-2 text-sm font-medium text-leaf">✓ Signed in your browser with {actor.name}&apos;s key, verified and recorded: {last}</div>}
          {error && <div className="mt-3 rounded-lg bg-rust-soft px-3 py-2 text-sm font-medium text-rust">✕ Rejected by protocol rules: {error}</div>}
        </div>

        {incoming.length > 0 && (
          <Panel title="Incoming shipments">
            {incoming.map((p) => (
              <ItemRow key={p.id} p={p}>
                <button className="btn btn-primary text-xs" disabled={busy} onClick={() => run("receive", { productId: p.id, actorId: actor.id }, `Received ${p.name}`)}>
                  📥 Confirm receipt
                </button>
              </ItemRow>
            ))}
          </Panel>
        )}

        {(actor.role === "supplier" || actor.role === "recycler") && <BatchForm data={data} actorId={actor.id} recycler={actor.role === "recycler"} busy={busy} run={run} />}
        {actor.role === "manufacturer" && <ManufactureForm data={data} actorId={actor.id} busy={busy} run={run} />}

        {held.length > 0 && (
          <Panel title="In your custody">
            {held.map((p) => (
              <ItemRow key={p.id} p={p}>
                <HeldActions p={p} actorRole={actor.role} actorId={actor.id} data={data} busy={busy} run={run} />
              </ItemRow>
            ))}
          </Panel>
        )}

        {actor.role === "repairer" && (
          <Panel title="Products in use near you">
            {data.products
              .filter((p) => p.stage === "in-use")
              .map((p) => (
                <ItemRow key={p.id} p={p} sub={`owned by ${name(p.holderId)}`}>
                  <RepairAction p={p} actorId={actor.id} busy={busy} run={run} />
                </ItemRow>
              ))}
          </Panel>
        )}

        {actor.role === "manufacturer" && <ClaimForm data={data} actorId={actor.id} busy={busy} run={run} />}
        {actor.role === "auditor" && <AuditPanel data={data} actorId={actor.id} busy={busy} run={run} />}

        {actor.role === "consumer" && (
          <div className="card p-5 text-sm">
            You have <b>{actor.balance} credits</b>.{" "}
            <Link href="/rewards" className="font-semibold text-leaf underline">
              Spend them on rewards →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

type Run = (action: string, body: Record<string, unknown>, msg: string) => Promise<void>;

/** A judge can join as a consumer whose private key is generated in, and never leaves, this browser. */
function GuestPanel({ actors, onPick }: { actors: ConsoleData["actors"]; onPick: (id: string) => void }) {
  const { act, busy, error } = useAct();
  const [guest, setGuest] = useState<Guest | null>(null);
  useEffect(() => setGuest(loadGuest()), []);
  const registered = guest && actors.some((a) => a.id === guest.id);
  return (
    <div className="mb-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs">
      {registered ? (
        <>
          <div className="font-semibold text-ink">You: {guest!.name}</div>
          <div className="mt-1 text-muted">Your key was generated in this browser and has never been sent anywhere.</div>
          <button className="btn btn-primary mt-2 w-full text-xs" onClick={() => onPick(guest!.id)}>
            Act as me
          </button>
        </>
      ) : (
        <>
          <div className="font-semibold text-ink">Join as yourself</div>
          <div className="mt-1 text-muted">Get a consumer identity whose private key is created here, in your browser. The server only ever sees your public key.</div>
          <button
            className="btn btn-primary mt-2 w-full text-xs"
            disabled={busy}
            onClick={async () => {
              forgetGuest();
              const g = await newGuest("Guest judge");
              const ok = await act("register-actor", guestRegistrationBody(g), g.id);
              if (ok) {
                setGuest(g);
                onPick(g.id);
              }
            }}
          >
            {busy ? "Creating…" : "Create my key & join"}
          </button>
          {error && <div className="mt-1 text-rust">{error}</div>}
        </>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ItemRow({ p, sub, children }: { p: ConsoleData["products"][number]; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
      <span className="text-2xl">{p.emoji}</span>
      <div className="min-w-0 flex-1">
        <Link href={`/passport/${p.id}`} className="font-semibold hover:underline">
          {p.name}
        </Link>
        <div className="text-xs text-muted">
          {p.id} · {p.stage}
          {sub ? ` · ${sub}` : ""}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function HeldActions({ p, actorRole, actorId, data, busy, run }: { p: ConsoleData["products"][number]; actorRole: Role; actorId: string; data: ConsoleData; busy: boolean; run: Run }) {
  const [to, setTo] = useState("");
  const [mode, setMode] = useState("ship");
  if (p.stage === "in-use" && actorRole === "consumer") {
    const recyclers = data.actors.filter((a) => a.role === "recycler");
    return (
      <>
        <select aria-label="Recipient" className="field w-auto text-xs" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Return to…</option>
          {recyclers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary text-xs" disabled={busy || !to} onClick={() => run("return", { productId: p.id, actorId, toId: to }, `Returned ${p.name}, return reward earned`)}>
          ↩ Return
        </button>
      </>
    );
  }
  if (p.stage === "returned" && actorRole === "recycler") {
    return <RecycleAction p={p} actorId={actorId} busy={busy} run={run} />;
  }
  if (p.stage === "in-stock" && actorRole === "retailer") {
    const consumers = data.actors.filter((a) => a.role === "consumer");
    return (
      <>
        <select aria-label="Recipient" className="field w-auto text-xs" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Sell to…</option>
          {consumers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary text-xs" disabled={busy || !to} onClick={() => run("sell", { productId: p.id, actorId, toId: to }, `Sold ${p.name}`)}>
          🛍 Sell
        </button>
      </>
    );
  }
  if (p.stage === "manufactured" || p.stage === "in-stock") {
    const targets = data.actors.filter((a) => (a.role === "logistics" || a.role === "retailer") && a.id !== actorId);
    return (
      <>
        <select aria-label="Recipient" className="field w-auto text-xs" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Ship to…</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select aria-label="Transport mode" className="field w-auto text-xs" value={mode} onChange={(e) => setMode(e.target.value)}>
          {["ship", "rail", "truck", "air"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <button className="btn btn-primary text-xs" disabled={busy || !to} onClick={() => run("ship", { productId: p.id, actorId, toId: to, mode }, `Shipped ${p.name} by ${mode}`)}>
          🚢 Ship
        </button>
      </>
    );
  }
  return <span className="text-xs text-muted">No action available</span>;
}

/** The recycler signs the mass it actually recovered per material (pre-filled with typical yields). */
function RecycleAction({ p, actorId, busy, run }: { p: ConsoleData["products"][number]; actorId: string; busy: boolean; run: Run }) {
  const [kg, setKg] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p.recovery ?? {}).map(([m, v]) => [m, String(v)])));
  return (
    <span className="flex flex-wrap items-center gap-2">
      {Object.keys(kg).map((m) => (
        <label key={m} className="flex items-center gap-1 text-[11px] text-muted">
          {m}
          <input aria-label={`Recovered ${m} in kg`} className="field w-20 py-1 text-xs" type="number" step="0.001" min="0" value={kg[m]} onChange={(e) => setKg({ ...kg, [m]: e.target.value })} />
          kg
        </label>
      ))}
      <button
        className="btn btn-primary text-xs"
        disabled={busy}
        onClick={() => run("recycle", { productId: p.id, actorId, recovered: Object.fromEntries(Object.entries(kg).map(([m, v]) => [m, Number(v)])) }, `Recycled ${p.name}: weighed output signed`)}
      >
        ♻ Sign recovered mass
      </button>
    </span>
  );
}

function RepairAction({ p, actorId, busy, run }: { p: ConsoleData["products"][number]; actorId: string; busy: boolean; run: Run }) {
  const [note, setNote] = useState("");
  return (
    <>
      <input className="field w-48 text-xs" placeholder="What was fixed?" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn btn-primary text-xs" disabled={busy || !note} onClick={() => run("repair", { productId: p.id, actorId, note }, `Repaired ${p.name}`)}>
        🔧 Log repair
      </button>
    </>
  );
}

function BatchForm({ data, actorId, recycler, busy, run }: { data: ConsoleData; actorId: string; recycler: boolean; busy: boolean; run: Run }) {
  const [material, setMaterial] = useState(data.materials[0].id);
  const [mass, setMass] = useState("100");
  const mine = data.batches.filter((b) => b.producerId === actorId);
  return (
    <Panel title={recycler ? "Register a recycled material lot" : "Register a material lot"}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          Material
          <select aria-label="Material" className="field mt-1" value={material} onChange={(e) => setMaterial(e.target.value)}>
            {data.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Mass (kg)
          <input aria-label="Mass in kg" className="field mt-1 w-28" type="number" min="0" value={mass} onChange={(e) => setMass(e.target.value)} />
        </label>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => run("create-batch", { producerId: actorId, material, massKg: Number(mass), recycledKg: recycler ? Number(mass) : 0 }, `Created ${mass} kg lot`)}
        >
          ⛏ Create lot
        </button>
      </div>
      {mine.length > 0 && (
        <div className="mt-2 text-xs text-muted">
          Your lots: {mine.map((b) => `${b.id} (${b.label}, ${b.remainingKg} kg left${b.recycledPct ? `, ${b.recycledPct}% recycled` : ""})`).join(" · ")}
        </div>
      )}
    </Panel>
  );
}

function ManufactureForm({ data, actorId, busy, run }: { data: ConsoleData; actorId: string; busy: boolean; run: Run }) {
  const available = data.batches.filter((b) => b.remainingKg > 0);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👟");
  const [category, setCategory] = useState("apparel");
  const [deposit, setDeposit] = useState("30");
  const [co2e, setCo2e] = useState("1");
  const [rows, setRows] = useState<{ batchId: string; massKg: string }[]>([{ batchId: available[0]?.id ?? "", massKg: "0.3" }]);
  const preview = useMemo(() => {
    let mass = 0;
    let rec = 0;
    for (const r of rows) {
      const b = data.batches.find((x) => x.id === r.batchId);
      const m = Number(r.massKg) || 0;
      mass += m;
      rec += b ? (m * b.recycledPct) / 100 : 0;
    }
    return { mass, pct: mass ? (rec / mass) * 100 : 0 };
  }, [rows, data.batches]);

  return (
    <Panel title="Manufacture a product">
      <div className="grid gap-2 sm:grid-cols-[80px_1fr_140px]">
        <input className="field text-center text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
        <input className="field" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Product category" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
          {["apparel", "battery", "electronics", "packaging"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="label mt-2">Bill of materials (drawn from signed lots)</div>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <select aria-label="Material lot" className="field" value={r.batchId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, batchId: e.target.value } : x)))}>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} · {b.label} · {b.remainingKg} kg left · {b.recycledPct}% recycled
              </option>
            ))}
          </select>
          <input aria-label="Kilograms from this lot" className="field w-28" type="number" step="0.01" value={r.massKg} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, massKg: e.target.value } : x)))} />
          <button className="btn btn-ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn btn-ghost text-xs" onClick={() => setRows([...rows, { batchId: available[0]?.id ?? "", massKg: "0.1" }])}>
        + Add material
      </button>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          Return reward (credits, funded by EPR fee)
          <input aria-label="Return reward in credits" className="field mt-1" type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </label>
        <label className="text-xs">
          Factory emissions (kg CO2e, self-reported)
          <input aria-label="Factory emissions in kg CO2e" className="field mt-1" type="number" step="0.1" value={co2e} onChange={(e) => setCo2e(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-sm text-ink-soft">
          {preview.mass.toFixed(3)} kg · <b className="text-leaf">{preview.pct.toFixed(1)}% recycled</b> by mass balance
        </span>
        <button
          className="btn btn-primary"
          disabled={busy || !name}
          onClick={() =>
            run(
              "manufacture",
              { brandId: actorId, name, emoji, category, inputs: rows.map((r) => ({ batchId: r.batchId, massKg: Number(r.massKg) })), depositCredits: Number(deposit), co2eKg: Number(co2e) },
              `Manufactured ${name}`,
            )
          }
        >
          🏭 Manufacture & sign passport
        </button>
      </div>
    </Panel>
  );
}

const KINDS: { id: ClaimKind; label: string; placeholder: string }[] = [
  { id: "RECYCLED_CONTENT", label: "Recycled content (%)", placeholder: "40" },
  { id: "CARBON_FOOTPRINT", label: "Carbon footprint (kg CO2e)", placeholder: "2.5" },
  { id: "ORIGIN", label: "Country of manufacture", placeholder: "BD" },
  { id: "ETHICAL_LABOR", label: "Labour standard", placeholder: "SA8000" },
  { id: "REPAIRABILITY", label: "Repairability (0-10)", placeholder: "7" },
];

function ClaimForm({ data, actorId, busy, run }: { data: ConsoleData; actorId: string; busy: boolean; run: Run }) {
  const mine = data.products.filter((p) => p.brandId === actorId);
  const [productId, setProductId] = useState(mine[0]?.id ?? "");
  const [kind, setKind] = useState<ClaimKind>("RECYCLED_CONTENT");
  const [value, setValue] = useState("");
  const [statement, setStatement] = useState("");
  const lint = lintClaim(statement);
  if (!mine.length) return null;
  return (
    <Panel title="Publish a sustainability claim">
      <div className="grid gap-2 sm:grid-cols-3">
        <select aria-label="Product" className="field" value={productId} onChange={(e) => setProductId(e.target.value)}>
          {mine.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name} ({p.id})
            </option>
          ))}
        </select>
        <select aria-label="Claim type" className="field" value={kind} onChange={(e) => setKind(e.target.value as ClaimKind)}>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input className="field" placeholder={KINDS.find((k) => k.id === kind)?.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <input className="field" placeholder="Consumer-facing wording, e.g. “Made with 40% recycled polyester”" value={statement} onChange={(e) => setStatement(e.target.value)} />
      {lint.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-soft p-3 text-xs text-amber">
          {lint.map((l) => (
            <li key={l.term}>
              ⚠ <b>“{l.term}”</b>: {l.reason}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">The claim is checked against the ledger as soon as it is published, so overclaiming shows up on the passport straight away.</span>
        <button className="btn btn-primary" disabled={busy || !value || !statement} onClick={() => run("issue-claim", { productId, issuerId: actorId, kind, value, statement }, `Claim published on ${productId}`)}>
          📣 Publish claim
        </button>
      </div>
    </Panel>
  );
}

function AuditPanel({ data, actorId, busy, run }: { data: ConsoleData; actorId: string; busy: boolean; run: Run }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const open = data.claims.filter((c) => !c.attestedBy.includes(actorId));
  return (
    <Panel title={`Claims awaiting your audit (${open.length})`}>
      {open.length === 0 && <div className="text-sm text-muted">Nothing to audit.</div>}
      {open.map((c) => (
        <div key={c.id} className="rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/passport/${c.productId}`} className="text-sm font-semibold hover:underline">
              {c.productName} · {c.kind.replace("_", " ").toLowerCase()}
            </Link>
            <span className="text-xs text-muted">
              {c.id} · engine says {c.status.toLowerCase()}
            </span>
          </div>
          <div className="mt-1 text-sm">“{c.statement}”</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="field flex-1 text-xs" placeholder="Audit note" value={notes[c.id] ?? ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
            <button className="btn btn-primary text-xs" disabled={busy || !notes[c.id]} onClick={() => run("attest", { claimId: c.id, auditorId: actorId, verdict: "APPROVE", note: notes[c.id] }, `Approved ${c.id}`)}>
              Approve
            </button>
            <button className="btn btn-danger text-xs" disabled={busy || !notes[c.id]} onClick={() => run("attest", { claimId: c.id, auditorId: actorId, verdict: "REJECT", note: notes[c.id] }, `Rejected ${c.id}`)}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </Panel>
  );
}
