import type { ClaimStatus } from "@/lib/verify.ts";
import type { EntryType, LifecycleStage, Role } from "@/lib/types.ts";

export const fmt = (n: number, d = 1) => n.toLocaleString("en", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const short = (h: string, n = 10) => `${h.slice(0, n)}…`;
export const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

const GRADE_STYLE: Record<string, string> = {
  A: "bg-leaf text-white",
  B: "bg-[#4f9b5a] text-white",
  C: "bg-amber text-white",
  D: "bg-[#c8541f] text-white",
  E: "bg-rust text-white",
};

export function GradeBadge({ grade, size = "md" }: { grade: string; size?: "md" | "lg" }) {
  const s = size === "lg" ? "h-16 w-16 text-3xl rounded-2xl" : "h-9 w-9 text-lg rounded-xl";
  return <div className={`grid shrink-0 place-items-center font-black ${s} ${GRADE_STYLE[grade]}`}>{grade}</div>;
}

const STATUS_STYLE: Record<ClaimStatus, string> = {
  VERIFIED: "bg-leaf-soft text-leaf",
  PENDING: "bg-amber-soft text-amber",
  CONTRADICTED: "bg-rust-soft text-rust",
};
const STATUS_LABEL: Record<ClaimStatus, string> = { VERIFIED: "✓ Verified", PENDING: "◷ Pending evidence", CONTRADICTED: "✕ Contradicted" };

export function StatusPill({ status }: { status: ClaimStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
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
  const c = stage === "recycled" ? "bg-leaf-soft text-leaf" : stage === "in-transit" ? "bg-sky-soft text-sky" : "bg-paper text-ink-soft";
  return <span className={`inline-flex rounded-full border border-line px-2.5 py-0.5 text-xs font-medium ${c}`}>{STAGE_LABEL[stage]}</span>;
}

export const ROLE_COLOR: Record<Role, string> = {
  supplier: "#8a6d3b",
  manufacturer: "#0d1f1a",
  logistics: "#1f5fa8",
  retailer: "#7a4fa0",
  consumer: "#c0577c",
  repairer: "#b26b00",
  recycler: "#127a52",
  auditor: "#4a5568",
  protocol: "#127a52",
};

export function RoleTag({ role }: { role: Role }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: ROLE_COLOR[role], background: `${ROLE_COLOR[role]}14` }}>
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
  ANCHORED: { icon: "⚓", label: "Ledger anchored" },
};

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "leaf" | "rust" }) {
  const color = tone === "leaf" ? "text-leaf" : tone === "rust" ? "text-rust" : "text-ink";
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Bar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper">
      {parts.map((p) => (
        <div key={p.label} title={`${p.label}: ${fmt(p.value, 2)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}
