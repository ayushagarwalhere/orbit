# Orbit: green claims, checked against the supply chain

[![CI](https://github.com/ayushagarwalhere/orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/ayushagarwalhere/orbit/actions/workflows/ci.yml)

**A hoodie says "70% recycled, carbon neutral, ethically made". Orbit's passport for it says: 6.7% recycled, 13.4 kg CO₂e, labour audit rejected. Grade E.**

Orbit gives every product a digital product passport. The passport doesn't repeat what the brand says. It checks each claim against what *other* parties signed: the supplier who sold the fibre, the retailer who received the parcel, the auditor who visited the factory. If those signatures contradict the label, the passport says so, and shows why.

Built for the **IEEE ClimateChain Global Hackathon**, track **Sustainable Supply Chains**.

📄 [Problem statement](docs/PROBLEM_STATEMENT.md) · 🌍 [Climate impact](docs/IMPACT.md) · 🔐 [Security](docs/SECURITY.md) · 📝 [Devpost write-up](docs/DEVPOST.md) · 🧾 [Be a witness](docs/WITNESS_GUIDE.md)

## How the hoodie gets caught

| The label says | Who contradicts it | What the passport shows |
| --- | --- | --- |
| "70% recycled" | The fibre suppliers' signed lots: only 0.05 kg of the 0.75 kg used was recycled | **6.7% recycled**: contradicted |
| Shipped by sea | The retailer signed for it **24 hours** after it left, 2,892 km away. Ships don't go that fast. | **Misdeclared: it went by air** |
| "Carbon neutral, 1.2 kg" | Recomputed from the signed lots, published processing factors and the real transport mode | **13.4 kg CO₂e**: contradicted |
| "Ethically made" | An independent auditor's signed verdict | **Audit rejected** |

The passport scores this **E (0/100)** and lists every point gained and lost, so the grade can be checked. An honest product in the same demo, the Orbit Tee, gets an A. A battery goes through its whole life (sold, repaired, returned, recycled), and its recovered materials become a new battery with **93% recycled content**, provable back to the original passport.

| The hoodie's passport | The erase attack, caught by the chain |
| --- | --- |
| ![The EcoCloud Hoodie's passport: grade E, 0/100, with the reasons](docs/images/02-hoodie-caught.jpg) | ![The Ledger page after the erase attack: local checks pass, both on-chain fingerprints disagree](docs/images/04-tamper-caught.jpg) |
| **Your browser verifies it** | **Fingerprints on Base Sepolia** |
| ![The Verify page: all checks pass and every verdict is re-derived](docs/images/03-verifier-passes.jpg) | ![Checkpoints from Orbit's operator and the demo witness, read live from the chain](docs/images/05-chain-checkpoints.jpg) |

## Why you can believe the passport

Anyone who can edit a database can make a passport say anything. Orbit makes that visible:

1. **Every party signs its own step** with its own key. Orbit can't sign for them.
2. **Everything else is recomputed from those signatures by public rules**: distances, recycled content, credits. If Orbit changes a number, recomputing exposes it.
3. **A fingerprint of the whole history goes on a public blockchain** (Base Sepolia), from Orbit's wallet and from **witnesses' own wallets**. If Orbit deletes the failed audit and rebuilds everything after it, the fingerprints stop matching.
4. **Your browser checks all of this itself**, on the Verify page. It doesn't trust Orbit's server.

The Ledger page lets you try three attacks and see each one caught. After verifying, anyone with a browser wallet can **become a witness** in one click: the browser re-checks the whole ledger, then anchors its fingerprint from their own wallet.

## Circular incentives

Returning, repairing and recycling earn **non-transferable credits**, redeemable for repairs, transit top-ups or tree planting. In a real scheme the brand's EPR fee would fund the return reward. Credits only appear as a consequence of a signed return, repair or recovery, so Orbit can't mint them from nothing. Repairs earn credit at most once per product every 30 days. ([Why not a tradable token](#why-credits-are-not-a-tradable-token).)

## Try it (3 minutes)

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 65 tests
```

1. **Overview**: on a wide screen, drag the globe beside the headline. It shows every city where a party signs and the routes products actually took on the ledger, with the misdeclared leg in red. Then **"See a greenwashed product get caught"**: the hoodie's passport and the "Why 0/100" breakdown. Further down, **Check any claim**: paste a line from a real label and see whether EU rules ban the wording and what signed data Orbit would test it against.
2. **Ledger → tamper simulator**: three attacks, three defences.
   - An intruder edits a credit, and a hash breaks.
   - Orbit itself shortens a freight leg and re-signs. Recomputing gives 2,892 km again.
   - Orbit erases the failed audit and rebuilds all later history through the real rules. Every local check passes; only the on-chain fingerprints disagree.

   Simulations stay in memory and undo themselves after 90 s.
3. **Verify**: load the hoodie. Your browser rebuilds the ledger, checks it against the chain and re-derives every verdict. Then click **"Verify on-chain"**: your browser builds the Merkle proofs and the deployed OrbitAnchor contract checks them with its own Solidity code (read-only, free, no wallet), including a forged entry it must reject. With a wallet holding a little Base Sepolia ETH, you can then anchor it yourself as a witness.
4. **Console → "Create my key & join"**: become a consumer whose key never leaves your browser, buy something and return it for the reward.

**Live contract:** [OrbitAnchor v3 on Base Sepolia](https://sepolia.basescan.org/address/0x8a9bd10b411a5509916dbe812fd803611c2f9151), with source verified on [Sourcify](https://repo.sourcify.dev/84532/0x8A9BD10b411A5509916dbe812fd803611C2F9151). Its history shows checkpoints from Orbit's operator and from a witness wallet. That witness is a second wallet run by our team, to show the role; we're inviting outside witnesses ([guide](docs/WITNESS_GUIDE.md)).

> A fresh clone makes its own keys and a new ledger, so nothing in it is anchored on our contract until you set up a wallet (below).

## Impact

If 5% of EU textiles and batteries carried Orbit-style passports by 2030, we project about **0.08 Mt CO₂e avoided per year** (plausible range 0.01–0.25), mostly from longer textile life and more fibre-to-fibre recycling. The biggest uncertainty is how many people actually repair. Every input is sourced in [IMPACT.md](docs/IMPACT.md), and the in-app Impact page reproduces the arithmetic.

---

## For developers

### Anchor on a public testnet

```bash
npm run wallet            # creates Orbit's anchor wallet in .env.local and prints its address
# fund it with a little Base Sepolia ETH from a faucet
npm run deploy:anchor     # deploys OrbitAnchor, writes ORBIT_ANCHOR_ADDRESS to .env.local
npm run dev               # anchors on boot, then at most every 10 minutes while there are new events
```

Add your deployment and operator address to `OFFICIAL_ANCHORS` in `src/lib/networks.ts`, so the browser verifier trusts them.

**Witness** (any auditor, recycler, NGO or judge, from their own wallet). Details in [WITNESS_GUIDE.md](docs/WITNESS_GUIDE.md):

```bash
npm run witness -- --file ledger.jsonl --check-only   # verify a ledger file: no wallet, no gas
npm run wallet -- --witness                           # creates your witness wallet; fund it from a faucet
npm run witness                                       # verify, then anchor from your own wallet
```

### How it works

![How Orbit checks a green claim: parties sign, rules derive, the ledger is anchored on Base Sepolia, witnesses and your browser re-check](docs/images/architecture.png)

<sub>Source: [docs/images/architecture.html](docs/images/architecture.html)</sub>

- **The ledger is the only source of truth.** No other state is stored. Actors, lots, products, claims, audits, credits and checkpoints are rebuilt by **replaying** the signed instructions through the same rules as the live API (`replay.ts`). The same replay acts as a verifier: if anyone, Orbit included, alters a derived value or adds an entry with no instruction behind it, replay names the field that differs.
- **Writes** (`dispatch.ts`) check:
  - the signature against the registered key
  - the ledger id
  - 5-minute freshness and a single-use nonce
  - no impersonation
  - strict schemas: unknown fields are rejected, and requests are capped at 16 KB

  Then the rules run (`actions.ts`).
- **Merkle trees** follow **RFC 6962**, as in Certificate Transparency. `OrbitAnchor` can also verify inclusion and consistency proofs in Solidity.
- **The browser verifier** (`passport-verify.ts`):
  1. Reads the checkpoint from Orbit's pinned contract and checks it came from Orbit's pinned operator.
  2. Downloads the ledger and re-hashes it; the root must equal the on-chain root.
  3. Checks it against every checkpoint from Orbit and named witnesses.
  4. Re-checks every signature and replays every instruction.
  5. Checks the passport leaves no anchored event out.
  6. Re-derives every verdict and the grade.

  If no named witness has anchored the ledger yet, it shows a warning.
- **Counter-party cross-checks** (`domain.ts`):
  - the recipient's signed arrival time tests the declared transport mode
  - lot lineage tests recycled content
  - auditors' signatures test labour claims
  - self-reported inputs (factory energy) are labelled as such

The full threat model, including what is still possible, is in [SECURITY.md](docs/SECURITY.md).

### Why a blockchain, and why only fingerprints

A signed database proves who said what, but whoever runs it can rewrite history and re-sign it. The "erase" attack does exactly that, and passes every local check, replay included. The chain adds:

- **timestamps nobody can revise**
- **open anchoring**, so witnesses publish from their own wallets and Orbit's wallet has no special rights
- **roots any browser can read directly** through a public RPC

Only fingerprints go on-chain (a 32-byte root, the ledger id and its length), and one transaction covers any number of events. The demo ledger itself is public, though: the passport page offers a public view (supplier names, lots and quantities hidden) and a regulator and recycler view, and [SECURITY.md](docs/SECURITY.md) describes the commitment-based design a real deployment would need.

### Emission factors and sources

Published averages, defined in [`src/lib/factors.ts`](src/lib/factors.ts). A real deployment would replace them with supplier data. The passport states the boundary: cradle-to-gate materials, garment processing, the factory's declared energy, and transport to the retailer. Use and end of life are excluded. Page numbers are the documents' printed page numbers.

| Factor | Value | Source |
| --- | --- | --- |
| Organic cotton fibre | 1.5 kg CO₂e/kg (recycled cotton 0.8) | Textile Exchange/Sphera, [LCA for Cotton](https://textileexchange.org/app/uploads/2026/03/Cotton-LCA-Technical-Report.pdf) (2026), Tables 5-2 (p.87), 5-7 (pp.98–99) |
| Conventional cotton fibre | 1.8 | Textile Exchange, [LCA of Organic Cotton Fiber](https://textileexchange.org/app/uploads/2025/01/the-life-cycle-assessment-of-organic-cotton-fiber_38172.pdf) (2014), p.10 |
| Polyester yarn | 5.5 (recycled PET fibre 3.0) | Textile Exchange/SCS, [LCA for Polyester](https://textileexchange.org/app/uploads/2026/06/Polyester-LCA-Technical-Report.pdf) (2026), Tables E-3, E-5, E-6 (pp.27, 29) |
| Spinning (cotton) · knitting · dyeing and finishing | 4.2 · 0.4 · 5.6 kg CO₂e/kg textile, ×1/0.85 for cutting waste | Cotton Inc./thinkstep, [LCA Update of Cotton Fiber and Fabric](https://cottontoday.cottoninc.com/wp-content/uploads/2019/11/2016-LCA-Full-Report-Update.pdf) (2017), Table 4-4 (p.79); Sandin et al., [Mistra Future Fashion 2019:05](https://research.chalmers.se/publication/514322/file/514322_Fulltext.pdf), Table 3.4 (p.50), p.52 |
| Aluminium | 14.8 (recycled 0.6) | International Aluminium Institute, [2023 intensity](https://international-aluminium.org/global-aluminium-industry-greenhouse-gas-emissions-intensity-reduction-continues-with-total-emissions-below-2020-peak) and [recycling factsheet](https://aluminium.org.au/wp-content/uploads/2024/10/IAI-Factsheet-Claim-3_GHG-Saving_external.pdf) |
| Copper | 4.0 (recycled 0.8, our estimate) | International Copper Association, [Copper Environmental Profile](https://internationalcopper.org/wp-content/uploads/2023/05/ICA-LCI-GlobalSummary-202305-F.pdf) (2023), Table 4 |
| LFP cells | 9.2 (recycled 3.6: the paper's best-case 61% cut from recycling) | Llamas-Orozco et al., [PNAS Nexus 2(11)](https://academic.oup.com/pnasnexus/article/2/11/pgad361/7344002) (2023), Fig. 3B: 56 kg/kWh of battery pack × ~0.165 kWh/kg (our assumption) |
| Steel | 2.3 (scrap EAF 0.7) | worldsteel, [Sustainability Indicators](https://worldsteel.org/wider-sustainability/sustainability-indicators-2024-report/) (2025) |
| ABS | 2.9 (recycled 1.4, our estimate) | Franklin Associates for ACC, [Cradle-to-Gate LCA of ABS](https://americanchemistry.com/content/download/12625/file/Cradle-to-Gate-Life-Cycle-Analysis-of-Acrylonitrile-Butadiene-Styrene-ABS-Resin.pdf) (2022), Table 7 |
| Truck · rail · container ship (industry average / Asia–North Europe lane) · air (long / short haul) | 0.115 · 0.030 · 0.009 / 0.005 · 0.82 / 1.36 kg CO₂e per t-km (well-to-wheel) | [GLEC Framework v3.0](https://knowledgeplatform.ecta.com/wp-content/uploads/2023/09/2023_GLEC_FRAMEWORK_v3.0_September.pdf) (2023): air Table 1 p.85, rail p.88, road p.91, sea Table 16 p.99 (10 t/TEU, p.50) |
| Distances | air: great circle + 95 km; road and rail: ×1.2; Europe–Asia sea legs via Gibraltar and Suez, other sea legs great circle (a lower bound) | GLEC v3.0 p.38; detour index range 1.2–1.6 (Cole and King 1968), as cited in Boscoe et al., [Professional Geographer 64(2)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3835347) (2012) |

The recycled factors for copper and ABS are our estimates; we found no primary source. Recycled metal values are gate-to-gate, so they understate collection.

### Quality checks

CI runs on every push: type-check, 65 unit tests and a production build, plus a **contract job**. That job rebuilds `OrbitAnchor.json` from the Solidity source and fails if it differs, deploys the contract to a local EVM node (Anvil), and runs `npm run test:chain`, which includes a **differential test**: Solidity and TypeScript must give the same answer for every RFC 6962 inclusion and consistency proof, honest and tampered, for every tree size up to 24 (over 1,000 contract calls).

Static analysis: [Slither](https://github.com/crytic/slither) 0.11.6 on `OrbitAnchor.sol` (solc 0.8.26, optimizer 200 runs) runs 102 detectors and reports **0 findings**.

Lighthouse 12.6 (mobile, simulated throttling) on all 7 pages of a production build: **accessibility 100, best practices 100, SEO 100** on every page; performance 82–90. These are automated checks, not user testing.

### Scalability

Measured with `node scripts/bench.ts 10000` on an idle Windows laptop (Node 24); a busy machine ran 3–5× slower. Gas figures come from our Base Sepolia transactions.

| Operation | Cost |
| --- | --- |
| Signed write (verify, validate, apply rules, append) | ≈ 0.7 ms |
| Integrity check after a write (incremental) | ≈ 1 ms at 10,000 entries |
| Full audit from scratch, replay included | ≈ 0.9 ms per entry (9 s for 10,000) |
| Passport export | ≈ 17 ms at 10,000 entries |
| On-chain anchor | ≈ 146k gas, whatever the number of events; ≈ $0.002–$0.02 on Base mainnet |

The browser verifier downloads the whole ledger. That's fine at demo scale. Production would use one ledger per brand or consortium (`ledgerId` already separates them on-chain), plus signed snapshots, so the download doesn't grow forever.

### Why credits are not a tradable token

- **They reward behaviour, not speculation.** A tradable token invites farming and wash-trading, and a reward worth a different amount next week stops working as an incentive.
- **Regulation.** A transferable token with market value can fall under the EU's MiCA rules. Closed-loop rewards are treated differently.
- **They're still accountable.** Replay rejects any credit the rules don't produce, and every mint sits inside the anchored roots.
- **There's an on-chain path if a scheme wants one.** `OrbitAnchor.verifyInclusion` would let a non-transferable token mint only against an anchored `RETURNED` or `RECYCLED` event.

### API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/passport/:id` | JSON-LD passport that validates against the official UNTP DPP 0.5.0 JSON schema (`tests/untp.test.ts`), with inclusion proofs and an anchor reference. It has no VC securing proof; integrity comes from the anchored ledger. |
| `GET` | `/api/ledger[?from=N]` | Entries, `ledgerId`, registered keys and an integrity report |
| `GET` | `/api/proof?m=&n=` | RFC 6962 consistency proof (optional: the verifier computes roots itself) |
| `POST` | `/api/actions/{create-batch, manufacture, ship, receive, sell, repair, return, recycle, issue-claim, attest, redeem, register-actor}` | `{ request: {action, ledger, actorId, body, nonce, issuedAt}, signature }`, signed by the actor. Only consumers may self-register, as `guest-…`, at most 20 per 10 minutes. |
| `POST` | `/api/actions/anchor` | Publishes the current root. Rate-limited, and a no-op if nothing changed. |
| `POST` | `/api/actions/{tamper, restore, reset}`, `GET /api/demo/keys` | Demo mode only (on in dev; `ORBIT_DEMO_MODE=1` in production) |

### Stack and standards

Next.js 15 · React 19 · TypeScript · Tailwind v4 · native Ed25519/SHA-256 on the server and audited `@noble/curves` / `@noble/hashes` in the browser (byte-identical, strict RFC 8032) · `viem` · Solidity 0.8.26.

Standards: UNTP Digital Product Passport 0.5.0 (exports validate against its JSON schema; not checked against the UNTP Playground's semantic tests) · GS1 EPCIS 2.0 & Digital Link (restricted-range demo GTINs) · RFC 6962 / 9162 · EU ESPR 2024/1781 · EU Battery Regulation 2023/1542 · EU Directive 2024/825 (greenwashing) · GLEC Framework.

### Project layout

```
src/lib/          core engine (framework-free, unit tested)
  dispatch.ts     the single write path: validation, signatures, freshness, nonce, ledger id
  actions.ts      protocol rules (custody, roles, mass balance, recovery bounds, credits)
  replay.ts       deterministic replay: rebuilds all state, verifies every derived entry
  ledger.ts       append, incremental integrity checks, the ledger's Merkle tree
  domain.ts       custody, mass balance, carbon, transport cross-checks
  verify.ts       claim checks + trust score with breakdown
  passport-verify.ts  trustless passport verification (browser + tests)
  witness-browser.ts  re-check and anchor from a visitor's own wallet
  greenwash.ts    EU 2024/825 wording rules + "check any claim"
  chain.ts / anchor-read.ts / networks.ts   anchoring, chain reads, pinned trust roots
  crypto.ts       canonical JSON, Ed25519/SHA-256, RFC 6962 Merkle tree
contracts/        OrbitAnchor.sol (v3)
scripts/          wallet, deploy, witness, fund, live verify, bench
tests/            core, storage, RFC 6962, verifier and on-chain tests
docs/             problem, impact, security, Devpost, witness guide, user-testing kit
```

### Limitations

- **Demo keys.** In demo mode the server holds the role-play actors' keys. Guest consumers keep their own; in production every key would stay with its owner.
- **Demo witness.** The only witness so far is our own second wallet.
- **Self-reported data.** Factory energy is self-reported and labelled as such. Emission factors are published averages (sourced in the table above), and garment processing uses industry defaults rather than each factory's own data.
- **Physical facts.** A recycler can overstate its yield up to the input mass, and a shipper can record a shipment early. Signed scale weights and carrier pickup signatures would fix this.

Full list: [SECURITY.md](docs/SECURITY.md).

## Inspiration & prior art

We studied these open-source projects before designing Orbit. All code here is our own.
[eclipse-tractusx/digital-product-pass](https://github.com/eclipse-tractusx/digital-product-pass) · [openepcis/openepcis-dpp-ready](https://github.com/openepcis/openepcis-dpp-ready) · [artiso-ai/dppvalidator](https://github.com/artiso-ai/dppvalidator) · [faizack/Supply-Chain-Blockchain](https://github.com/faizack/Supply-Chain-Blockchain) · [geraldinabeutnagel/ChainTrace](https://github.com/geraldinabeutnagel/ChainTrace)

## License

MIT
