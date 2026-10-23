import { CircleDashed, ShieldAlert, ShieldCheck } from "lucide-react";
import type { EntryType, LifecycleStage, Role } from "@/lib/types.ts";
import type { ClaimStatus } from "@/lib/verify.ts";

export const fmt = (n: number, d = 1) => n.toLocaleString("en", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const short = (h: string, n = 10) => `${h.slice(0, n)}…`;
export const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Status colour for a trust grade. */
export const GRADE_COLOR: Record<string, string> = { A: "#5ee0a0", B: "#a6e37a", C: "#f4be4f", D: "#ff9a6b", E: "#ff7a66" };

export function GradeBadge({ grade, score, size = "md" }: { grade: string; score?: number; size?: "md" | "lg" }) {
  const c = GRADE_COLOR[grade];
  const label = `Trust grade ${grade}${score !== undefined ? `, ${score} of 100` : ""}`;
  if (size === "lg") {
    const pct = score ?? 0;
    return (
      <div className="relative grid h-36 w-36 shrink-0 place-items-center rounded-full" aria-label={label} role="img" style={{ background: `conic-gradient(${c} ${pct * 3.6}deg, #24322c 0)` }}>
        <div className="absolute inset-[3px] rounded-full bg-surface" />
        <span className="display relative text-[7.5rem] leading-[0.8]" style={{ color: c }}>
          {grade}
        </span>
      </div>
    );
  }
  return (
    <div
      className="display grid h-11 w-11 shrink-0 place-items-center rounded-full text-[28px] leading-none"
      aria-label={label}
      role="img"
      style={{ color: c, background: `color-mix(in oklab, ${c} 13%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 35%, transparent)` }}
    >
      {grade}
    </div>
  );
}

const STATUS: Record<ClaimStatus, { color: string; label: string; Icon: typeof ShieldCheck }> = {
  VERIFIED: { color: "#5ee0a0", label: "Verified", Icon: ShieldCheck },
  PENDING: { color: "#f4be4f", label: "Pending evidence", Icon: CircleDashed },
  CONTRADICTED: { color: "#ff7a66", label: "Contradicted", Icon: ShieldAlert },
};
export const STATUS_COLOR = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.color])) as Record<ClaimStatus, string>;

export function StatusPill({ status }: { status: ClaimStatus }) {
  const s = STATUS[status];
  return (
    <span className="chip" style={{ color: s.color, background: `color-mix(in oklab, ${s.color} 12%, transparent)`, borderColor: `color-mix(in oklab, ${s.color} 30%, transparent)` }}>
      <s.Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {s.label}
    </span>
  );
}

const STAGE_LABEL: Record<LifecycleStage, string> = {
  manufactured: "Manufactured",
  "in-transit": "In transit",
  "in-stock": "In stock",
  "in-use": "In use",
  returned: "Returned",
  recycled: "Recycled",
};
export function StagePill({ stage }: { stage: LifecycleStage }) {
  const c = stage === "recycled" ? "#5ee0a0" : stage === "in-transit" ? "#7cc4ff" : "#9baea5";
  return (
    <span className="chip" style={{ color: c, borderColor: `color-mix(in oklab, ${c} 30%, transparent)` }}>
      {stage === "in-transit" && <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ background: c }} />}
      {STAGE_LABEL[stage]}
    </span>
  );
}

export const ROLE_COLOR: Record<Role, string> = {
  supplier: "#e0b77a",
  manufacturer: "#edf2ec",
  logistics: "#7cc4ff",
  retailer: "#c4a1ff",
  consumer: "#ff9ec4",
  repairer: "#f4be4f",
  recycler: "#5ee0a0",
  auditor: "#b8c4bf",
  protocol: "#c8f169",
};

export function RoleTag({ role }: { role: Role }) {
  const c = ROLE_COLOR[role];
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: c, background: `color-mix(in oklab, ${c} 12%, transparent)` }}>
      {role}
    </span>
  );
}

export const ENTRY_META: Record<EntryType, { icon: string; label: string }> = {
  ACTOR_REGISTERED: { icon: "🔑", label: "Key registered" },
  BATCH_CREATED: { icon: "⛏", label: "Material lot created" },
  MANUFACTURED: { icon: "🏭", label: "Manufactured" },
  SHIPPED: { icon: "🚢", label: "Shipped" },
  RECEIVED: { icon: "📥", label: "Received" },
  SOLD: { icon: "🛍", label: "Sold" },
  REPAIRED: { icon: "🔧", label: "Repaired" },
  RETURNED: { icon: "↩", label: "Returned for recycling" },
  RECYCLED: { icon: "♻", label: "Recycled" },
  CLAIM_ISSUED: { icon: "📣", label: "Claim issued" },
  CLAIM_ATTESTED: { icon: "🔍", label: "Claim audited" },
  CREDIT_MINTED: { icon: "🪙", label: "Credits minted" },
  CREDIT_REDEEMED: { icon: "🎁", label: "Credits redeemed" },
  ANCHORED: { icon: "⚓", label: "Anchored on-chain" },
};

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "leaf" | "rust" }) {
  const color = tone === "leaf" ? "text-leaf" : tone === "rust" ? "text-rust" : "text-ink";
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className={`display mt-2 text-5xl tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Bar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-raised">
      {parts.map((p) =>
        p.value > 0 ? <div key={p.label} className="rounded-full" title={`${p.label}: ${fmt(p.value, 2)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null,
      )}
    </div>
  );
}

export function PageHeader({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="label text-accent">{kicker}</div>
      <h1 className="display mt-3 text-5xl sm:text-6xl">{title}</h1>
      {children && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{children}</p>}
    </div>
  );
}
