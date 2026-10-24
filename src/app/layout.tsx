import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { NavLinks, Providers } from "@/components/client.tsx";
import { verifyLedger } from "@/lib/ledger.ts";
import { latestCheckpoint } from "@/lib/passport.ts";
import { getDb } from "@/lib/store.ts";
import "./globals.css";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Orbit · Verifiable circular supply chains",
  description: "Digital product passports with actor-signed lifecycle tracking, on-chain anchoring, recycling traceability and automatic greenwashing detection.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const ok = verifyLedger(db).ok;
  const cp = latestCheckpoint(db);
  return (
    <html lang="en" className={`${instrument.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <header className="sticky top-3 z-40 px-3">
            <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-full border border-line bg-bg/70 py-1.5 pl-4 pr-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.35)] backdrop-blur-xl">
              <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Orbit home">
                <OrbitMark />
                <span className="display text-[22px] leading-none">Orbit</span>
              </Link>
              <NavLinks />
              <Link
                href="/ledger"
                className={`chip hidden shrink-0 border sm:inline-flex ${ok ? "border-leaf/30 bg-leaf-soft text-leaf" : "border-rust/40 bg-rust-soft text-rust"}`}
                title={cp?.onChain ? `Anchored on ${cp.network}` : "Not yet anchored on a public chain"}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${ok ? "live-dot bg-leaf" : "bg-rust"}`} />
                {ok ? "Chain intact" : "Tampered"} · #{db.ledger.length}
              </Link>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 py-10 sm:px-6">
              <div>
                <div className="display text-5xl text-ink">
                  Every product, <em className="text-accent">verified.</em>
                </div>
                <p className="mt-3 max-w-md text-sm text-muted">
                  Built for the IEEE ClimateChain Global Hackathon, Sustainable Supply Chains track. Demo data; emission factors are sourced published averages.
                </p>
              </div>
              <div className="flex gap-5 text-sm text-ink-soft">
                <Link href="/verify" className="hover:text-ink">
                  Verify a passport
                </Link>
                <a href="https://github.com/ayushagarwalhere/orbit" className="hover:text-ink" target="_blank">
                  Source on GitHub
                </a>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}

function OrbitMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden>
      <circle cx="13" cy="13" r="5" fill="#c8f169" />
      <ellipse cx="13" cy="13" rx="11.5" ry="5" fill="none" stroke="#edf2ec" strokeOpacity=".7" strokeWidth="1.4" transform="rotate(-25 13 13)" />
      <circle cx="23" cy="9" r="2" fill="#edf2ec" />
    </svg>
  );
}
