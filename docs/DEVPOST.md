# Orbit: green claims, checked against the supply chain

**Track:** Sustainable Supply Chains · **Tagline:** A product passport that checks the label against what everyone else in the supply chain signed.

## Inspiration
A hoodie in a shop says *"70% recycled, carbon neutral, ethically made."* You can't check any of it. Neither can the regulator, and often neither can the brand's own buyers. The European Commission found that **53% of green claims were vague, misleading or unfounded, and 40% had no evidence at all**. The EU is about to make digital product passports mandatory: for batteries from February 2027, with textiles to follow. Most passport projects *store* what the brand says. We wanted one that **checks** it. ([Problem statement](PROBLEM_STATEMENT.md))

## What it does
Scan the hoodie's QR code and Orbit's passport tells you:

| The label says | Orbit finds | Because |
| --- | --- | --- |
| 70% recycled | **6.7%** | The fibre suppliers' signed lots show 0.05 kg recycled out of 0.75 kg |
| Shipped by sea | **Flown** | The retailer signed for it 24 hours after it left, 2,892 km away |
| Carbon neutral, 1.2 kg | **13.4 kg CO₂e** | Recomputed from the signed lots, published spinning and dyeing factors, and the real transport mode |
| Ethically made | **Audit rejected** | The auditor's signed verdict |

**Grade E, 0/100.** The page shows every point gained and lost, so nobody has to take the score on faith. An honest T-shirt in the same demo gets an A.

The idea is simple: **check the brand's claims against what someone else signed.** Each party in the chain (supplier, factory, carrier, retailer, auditor, repairer, recycler) signs its own step with its own key. Orbit then works out recycled content, carbon and custody from those signatures, using public rules.

It covers the whole circular loop:
- **Lifecycle tracking** from fibre lot to recycler, with a journey map.
- **Recycling traceability:** a recycler signs the mass it recovered, which can't exceed what went in. Those recovered lots become a new battery with **93% recycled content**, provable back to the original passport.
- **Circular incentives:** returning, repairing and recycling earn non-transferable credits, redeemable for repairs, transit top-ups or tree planting. In a real scheme the brand's EPR fee would fund them. Credits exist only because of a signed event. Repairs earn at most once per product every 30 days.
- **Check any claim:** paste a line from any label. Orbit flags wording banned under EU Directive 2024/825 (like "eco-friendly" or "carbon neutral") and says what signed data it would need to check the rest.
- **Join as yourself:** a judge can become a consumer whose key is created in their own browser, then buy and return a product for its reward.

## Why you can trust the passport
A passport is only useful if the company running it can't quietly edit it. So:
1. **Orbit can't sign for anyone.** Every step carries the actor's own signature. (In the demo, the server holds the role-play actors' keys; guests keep their own.)
2. **Everything Orbit derives can be recomputed** from those signatures. Change a distance or a credit, and recomputing exposes it.
3. **A fingerprint of the whole history is anchored on a public blockchain** (Base Sepolia). Witnesses can anchor it from their own wallets too, in one click from the Verify page with any browser wallet (so far the only named witness is a second wallet of ours). If Orbit deletes the failed audit and rebuilds everything after it, the fingerprints stop matching. The Ledger page lets you try this attack live.
4. **Your browser checks everything itself.** The Verify page downloads the ledger, matches it to the on-chain fingerprint, re-checks every signature, confirms the passport leaves nothing out, and re-derives every verdict.
5. **Then the contract checks it too.** "Verify on-chain" sends the Merkle proofs to the deployed OrbitAnchor contract, whose own Solidity code confirms each event is in the anchored history and that every checkpoint only appends to the one before. It also has to reject a forged entry, so a "yes" means something. Free and read-only, no wallet needed.

## Impact
If 5% of EU textiles and batteries carried Orbit-style passports by 2030, we project about **0.08 Mt CO₂e avoided per year**, with a plausible range of 0.01–0.25 Mt. Most of it comes from longer textile life and more fibre-to-fibre recycling. One pilot (an apparel brand with 100,000 garments a year and an e-bike brand with 20,000 packs) would avoid about **48 t CO₂e a year**. The biggest unknown is how many people actually repair. Our central case assumes 5% repair uptake; France's and Austria's repair bonuses suggest even that may be high. Every input is sourced in our [impact assessment](IMPACT.md), and the in-app Impact page reproduces the arithmetic.

## How we built it
- **Next.js 15, React 19, TypeScript, Tailwind v4**
- **Ed25519 signatures:** native Node crypto on the server, audited `@noble` libraries in the browser, tested to be byte-identical.
- **Replay:** the append-only ledger is the only stored state. All state is rebuilt by replaying the signed instructions through the same rules the API uses.
- **Anchoring:** RFC 6962 Merkle roots, the same scheme as Certificate Transparency, sent to our **OrbitAnchor** contract (Solidity, source verified on Sourcify). Anyone can anchor; verifiers trust only Orbit's operator and named witnesses, pinned in code.
- **Standards:** passport exports validate against the official UNTP DPP 0.5.0 JSON schema (a test runs it in CI). Data models also follow GS1 EPCIS 2.0 / Digital Link, EU ESPR and Battery Regulation passport fields, and GLEC transport factors.
- **66 unit tests and 3 on-chain tests, run by CI on every push.** They cover signature attacks, input hardening, replay catching operator forgeries, the erase-and-rebuild attack, passports that omit or forge events, and RFC 6962 proofs. The on-chain job deploys the contract and runs a differential test: Solidity and TypeScript must agree on every inclusion and consistency proof, honest and tampered, for every tree size up to 24 (over 1,000 contract calls).
- **Static analysis:** Slither (102 detectors) reports 0 findings on the contract.
- **Measured at 10,000 entries:** a signed write takes about 0.7 ms. An anchor costs about 146k gas whatever the volume, roughly $0.002–$0.02 on Base mainnet.

## Challenges we ran into
- **The operator problem.** A signed database can be rewritten by whoever holds the key. Outside reviewers attacked our early versions twice. They found forgeable passports, unverified derived data, and passports that could leave events out. Each time we rebuilt the trust model and added a regression test.
- **The oracle problem.** Signatures prove who said something, not that it's true. Our answer is to make the *other party* supply the evidence: the recipient's arrival time, the supplier's lot, the auditor's verdict. We label what is still self-reported, such as factory energy. Our [security assessment](SECURITY.md) lists what remains possible.

## Accomplishments that we're proud of
- The greenwashed hoodie is caught four ways, and the grade explains itself.
- The hardest insider attack (erase an audit, then rebuild all later history through the real rules) passes every local check and is caught only by the on-chain fingerprints.
- A closed loop: a recycled battery whose 93% recycled content is proven, not declared.
- Lighthouse scores 100 for accessibility, best practices and SEO on all 7 pages (automated checks, not user testing).

## What we learned
Traceability alone doesn't create accountability. Accountability comes from checking claims against data that someone *other than the claimant* signed, and from letting anyone, not just the operator, re-check the record.

## What's next for Orbit
- User testing with shoppers and supply-chain staff ([test kit](USER_TESTING.md))
- Outside witnesses: auditors, recyclers, NGOs ([witness guide](WITNESS_GUIDE.md))
- Actors' keys in their own wallets, with accredited onboarding
- Signed scale weights and carrier pickup signatures at every handover
- A pilot with one brand, measuring repair and return uptake first

## Gallery images
In [`docs/images`](images): `architecture.png` (the diagram), `01-home-globe.jpg` (thumbnail), `02-hoodie-caught.jpg`, `03-verifier-passes.jpg`, `04-tamper-caught.jpg`, `05-chain-checkpoints.jpg`.

## Try it
- **Live demo:** [orbit-yp30.onrender.com](https://orbit-yp30.onrender.com). It's on free hosting, so the first visit after a quiet spell can take about 50 s to wake up.
- **Contract:** [OrbitAnchor v3 on Base Sepolia](https://sepolia.basescan.org/address/0x8a9bd10b411a5509916dbe812fd803611c2f9151), [source verified on Sourcify](https://repo.sourcify.dev/84532/0x8A9BD10b411A5509916dbe812fd803611C2F9151).
- **Run it:**
  ```
  git clone https://github.com/ayushagarwalhere/orbit && cd orbit
  npm install && npm run dev
  ```
- **3-minute path:**
  1. Overview → *See a greenwashed product get caught*
  2. Ledger → try the three tamper attacks
  3. Verify → let your browser check the hoodie
  4. Console → *Create my key & join* and return something for its reward
