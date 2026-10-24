"use client";

import NumberFlow from "@number-flow/react";
import { Copy } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{ style: { background: "#18221e", border: "1px solid #34473f", color: "#edf2ec", borderRadius: 14 } }}
      />
    </MotionConfig>
  );
}

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/ledger", label: "Ledger" },
  { href: "/console", label: "Console" },
  { href: "/rewards", label: "Rewards" },
  { href: "/verify", label: "Verify" },
];

/** Floating pill nav; the active indicator glides between links. */
export function NavLinks() {
  const path = usePathname();
  const active = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.href ?? (path.startsWith("/passport") ? "/" : "");
  return (
    <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto text-sm">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`relative rounded-full px-3.5 py-1.5 transition-colors ${active === n.href ? "text-ink" : "text-ink-soft hover:text-ink"}`}>
          {active === n.href && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-raised ring-1 ring-line-strong" transition={{ type: "spring", bounce: 0.15, duration: 0.5 }} />}
          <span className="relative">{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Fade-up on first scroll into view. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8%" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Headline lines slide up through a mask. */
export function MaskLines({ lines, className }: { lines: React.ReactNode[]; className?: string }) {
  return (
    <span className={className}>
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span className="block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.08 * i }}>
            {l}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Card with a pointer-following glow. */
export function Spotlight({ children, className = "", as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "article" }) {
  const ref = useRef<HTMLDivElement>(null);
  const Tag = as;
  return (
    <Tag
      ref={ref}
      className={`card spotlight ${className}`}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </Tag>
  );
}

export function Num({ value, decimals = 0, suffix, prefix }: { value: number; decimals?: number; suffix?: string; prefix?: string }) {
  return <NumberFlow value={value} format={{ maximumFractionDigits: decimals, minimumFractionDigits: 0 }} suffix={suffix} prefix={prefix} willChange />;
}

/** Seconds left until a deadline; refreshes the page when it passes. */
export function Countdown({ until, label }: { until: number; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (left === 0) router.refresh();
  }, [left, router]);
  return (
    <span className="chip border-amber/30 bg-amber-soft text-amber tabular-nums">
      {label} {left}s
    </span>
  );
}

/** Mono hash with an accent-tinted fingerprint; click to copy. */
export function Hash({ value, head = 6, tail = 4, className = "" }: { value: string; head?: number; tail?: number; className?: string }) {
  const short = value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  return (
    <button
      type="button"
      title={`${value} (click to copy)`}
      onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success("Hash copied", { description: `${value.slice(0, 24)}…` }))}
      className={`hash group inline-flex items-center gap-1 rounded hover:text-ink ${className}`}
    >
      <span>
        <span className="text-accent/80">{short.slice(0, 4)}</span>
        {short.slice(4)}
      </span>
      <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" strokeWidth={1.5} aria-hidden />
    </button>
  );
}
