import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: "Orbit · Verifiable circular supply chains",
  description: "Digital product passports with signed lifecycle tracking, recycling traceability and automatic greenwashing detection.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/ledger", label: "Ledger" },
  { href: "/console", label: "Console" },
  { href: "/rewards", label: "Rewards" },
  { href: "/verify", label: "Verify" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <OrbitMark />
              <span className="text-lg">Orbit</span>
            </Link>
            <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-muted">
          Orbit prototype · Built for the IEEE ClimateChain Global Hackathon · Sustainable Supply Chains track. Demo data and illustrative emission factors.
        </footer>
      </body>
    </html>
  );
}

function OrbitMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <circle cx="13" cy="13" r="5" fill="#127a52" />
      <ellipse cx="13" cy="13" rx="11.5" ry="5" fill="none" stroke="#0d1f1a" strokeWidth="1.6" transform="rotate(-25 13 13)" />
      <circle cx="23" cy="9" r="2" fill="#0d1f1a" />
    </svg>
  );
}
