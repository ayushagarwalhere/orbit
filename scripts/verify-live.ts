// Runs the browser verifier from Node against a running Orbit node and the real chain, for every
// product passport. Usage: ORBIT_URL=http://localhost:3000 npm run verify:live
/* eslint-disable @typescript-eslint/no-explicit-any */
import "../src/lib/crypto-node.ts";
import { readCheckpoint, readLedgerCheckpoints } from "../src/lib/anchor-read.ts";
import { OFFICIAL_ANCHORS, networkById } from "../src/lib/networks.ts";
import { verifyPassport } from "../src/lib/passport-verify.ts";
const base = (process.env.ORBIT_URL ?? "http://localhost:3000").replace(/\/$/, "");
for (let i = 0; i < 20; i++) { try { if ((await fetch(base + "/api/ledger")).ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }
const ledger = await (await fetch(base + "/api/ledger")).json();
const ids = [...new Set(ledger.entries.filter((e: any) => e.type === "MANUFACTURED").map((e: any) => e.subjectId))] as string[];
for (const id of ids) {
  const doc = await (await fetch(`${base}/api/passport/${id}`)).json();
  const chainId = Number(doc.proof?.anchor?.chainId);
  const network = networkById(chainId)!; const trusted = OFFICIAL_ANCHORS[chainId];
  const checks = await verifyPassport(doc, { trusted, chainId, chain: {
    checkpoint: (n) => readCheckpoint(network, trusted.contract, n),
    ledgerCheckpoints: (l) => readLedgerCheckpoints(network, trusted.contract, l),
    ledger: async () => (await (await fetch(base + "/api/ledger")).json()).entries } });
  const bad = checks.filter(c => c.ok !== true);
  console.log(`${doc.credentialSubject.product?.name ?? id}: ${checks.length - bad.length}/${checks.length} passed`, bad.map(c => `[${c.ok}] ${c.label}: ${c.detail}`).join(" | "));
}
process.exitCode = 0;
