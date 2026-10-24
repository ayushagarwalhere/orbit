# Orbit: green claims, checked against the supply chain

**Track:** Sustainable Supply Chains · **Tagline:** Digital product passports built from instructions each party signs, re-derivable by anyone, anchored on-chain with RFC 6962 proofs, and checked automatically for greenwashing.

## Inspiration
The European Commission found that 53% of green claims it examined were vague, misleading or unfounded, and 40% had no supporting evidence at all. Brands publish "70% recycled" or "carbon neutral" labels, and consumers, regulators and even the brands' own buyers can't check them. Most traceability projects *record* supply chain data, but few use it to *check the claims* made about the product, and most ask you to trust the operator's database. The EU is now making Digital Product Passports mandatory: battery passports from February 2027, and textiles to follow under ESPR, likely around 2029. We wanted to show what a passport looks like when it's built for accountability rather than marketing. (Full context: [problem statement](PROBLEM_STATEMENT.md).)

## What it does
- **Lifecycle tracking:** every handover (material lot → factory → ship → retailer → consumer → repair → return → recycler) is an **instruction signed with that party's own Ed25519 key**. The API checks the signature, the ledger it was signed for, freshness, the nonce and strict input validation, then applies the protocol rules (custody, roles, mass balance).
- **The ledger is the only source of truth:** all state is rebuilt by **replaying** the signed instructions through the same rules. So anyone can re-derive every entry. If the operator alters a distance, inflates a credit or invents a recycled lot, replay names the exact field that differs.
- **Digital product passport:** a public QR page with materials, origin, carbon breakdown, journey map and the signed event trail. It exports as JSON-LD following the UNTP passport data model, with **RFC 6962 inclusion proofs**.
- **Recycling traceability:** recyclers **sign the mass they actually recovered** (it can't exceed what went in). That becomes new recycled lots linked to the source product, so a battery built from them proves its 93% recycled content back to its ancestor passport.
- **Claim verification engine (the core idea):** each claim is checked against data the brand doesn't control:
  - recycled % against mass balance of supplier- and recycler-signed lots
  - carbon against those lots, factory energy (flagged as self-reported) and every transport leg
  - transport legs cross-checked against the **recipient's signed arrival time**: declare "sea" for something that lands in 24 hours and you're caught
  - labour standards against an independent auditor's signature

  Contradictions are flagged, vague wording is linted against EU Directive 2024/825, and every product gets a trust grade from A to E.
- **Open, multi-party anchoring:** RFC 6962 Merkle roots go to `OrbitAnchor` v3 on Base Sepolia (source verified on Sourcify). **Anyone can anchor**, and the contract records who did. A witness program lets an auditor, recycler or NGO re-verify the whole ledger and anchor from its own wallet. In our demo the witness is a second wallet run by our team, labelled as such.
- **Verification that doesn't trust us:** the browser verifier pins Orbit's contract and operator address in code. It checks every key, signature, binding and signed time, and **re-derives every claim verdict itself** from the proven events. It proves each event's inclusion, then proves with **RFC 6962 consistency proofs** that history is append-only against every trusted checkpoint on-chain. Junk anchors from unknown wallets are ignored.
- **Three layers of defence, live in the tamper simulator:**
  - A database intruder's edit breaks a hash.
  - An operator who re-signs altered data is caught by replay.
  - An operator who **erases a failed audit and regenerates all later history through the real rules** passes every local check, and is caught only by the on-chain roots.
- **Circular incentives:** non-transferable credits for return rewards (funded by brands' EPR fees in a real scheme), repairs and recovery. They're minted only as a rule-derived consequence of a signed event. We explain why they're deliberately not a tradable token.
- **Join as yourself:** a judge can become a consumer whose private key is generated in the browser and never leaves it.

## How we built it
- **Next.js 15, React 19, TypeScript, Tailwind v4.**
- **Crypto:**
  - Native Node Ed25519 and SHA-256 on the server; audited `@noble/curves` / `@noble/hashes` in the browser. They're byte-identical (strict RFC 8032), and we test that.
  - RFC 6962 / RFC 9162 Merkle trees with an incremental tree; proofs are O(log² n).
- **Solidity `OrbitAnchor` v3** (solc 0.8.26): open anchoring keyed by `ledgerId`, with `verifyInclusion` and `verifyConsistency` done natively and batch checkpoint reads. **viem** publishes anchors on boot and about 45 s after the last write, with no-op detection, a balance floor and rate limits.
- **Scale**, measured at 10,000 entries:
  - A signed write takes ≈ 0.6 ms; an incremental integrity check (signatures and replay) ≈ 1.3 ms; a full independent audit ≈ 0.7 ms per entry.
  - A passport with proofs exports in ≈ 15 ms.
  - An anchor costs ≈ 146k gas, whatever the event volume.
  - Storage is an append-only log, rebuilt by replay.
- Data models follow **UNTP DPP**, **GS1 EPCIS 2.0 / Digital Link**, **EU ESPR & Battery Regulation** passport fields, and **GLEC** transport factors.
- **46 tests**, plus an **on-chain integration test**. They cover:
  - authentication attacks and strict validation
  - replay catching operator forgeries
  - the erase-and-regenerate attack
  - exhaustive RFC 6962 inclusion and consistency checks
  - browser-verifier tests: forged checkpoints, histories re-anchored at a new length, edited verdicts, junk anchors
  - transport misdeclaration and storage rollback

## Challenges we ran into
- **The operator problem.** A signed database can be rewritten by whoever holds the key. We separated four things:
  - **actors sign instructions;**
  - **the rules derive entries** (replay checks them);
  - **the sequencer only orders;**
  - **anyone can anchor**, and consistency proofs make anchored history append-only.

  An independent reviewer found real holes in our first version: forgeable passports via the open contract, unverified derived data, and no input validation. We rebuilt the trust model around replay and pinned roots.
- **The oracle problem.** Cryptography proves who said what, not that it's true. Our answer is to make the *counter-party* supply the evidence:
  - the recipient's signed arrival time
  - supplier-signed lots
  - auditor signatures
  - physical bounds on what a recycler can claim

  We also disclose what is still self-reported, and list in our [security assessment](SECURITY.md) what remains possible.
- **Byte-identical verification** across the browser, Node and Solidity: canonical JSON, RFC 6962 trees, and the same rules code for live writes and replay.

## Accomplishments that we're proud of
- **The greenwashed hoodie is caught four ways:**
  - It claims 70% recycled; the lots prove 6.7%.
  - It was declared as sea freight, but the retailer signed for it 24 hours later.
  - That makes "carbon neutral, 1.2 kg" really 6.0 kg.
  - Its labour audit was rejected.
- **The browser re-derives every one of those verdicts** and proves them against Base Sepolia: 28 of 28 checks pass on a live passport, consistent with 7 other trusted checkpoints.
- **The hardest insider attack** (deleting an audit and regenerating history through the real rules) fools every local check, replay included, and is caught by the on-chain roots.

## Impact
Our [climate impact assessment](IMPACT.md) projects **about 0.12 Mt CO₂e avoided per year by 2030 if 5% of EU textiles and batteries use Orbit-style passports**, with a range of 0.02–0.41. It falls to about 0.07 Mt if half the recycling and repair effect would have come from a mandatory passport anyway, and to about 0.08 Mt at the 5% repair uptake that repair-bonus evidence from France and Austria supports. For a single pilot (one apparel brand with 100,000 garments a year and one e-bike brand with 20,000 packs a year), it projects **≈ 53 t CO₂e a year**. Every input is sourced and the arithmetic is shown. The in-app Impact page reproduces the model exactly.

## What we learned
Traceability alone doesn't create accountability. Accountability comes from checking claims against data that someone *other than the claimant* signed, from making every derived fact re-derivable, and from letting anyone, not just the operator, fix history where it can't be rewritten. Having an outside reviewer attack our first version was the most useful thing we did.

## What's next for Orbit
- Actors' keys in their own wallets or DIDs, with accredited onboarding
- Real independent witnesses: auditors, recyclers, NGOs
- Signed scale weights and carrier pickup signatures at handovers
- Zero-knowledge mass-balance proofs, so suppliers can prove totals without revealing volumes
- A non-transferable credit token that mints only against an on-chain inclusion proof, if a scheme wants one
- Anchoring to a public L2 mainnet, and integration with the EU DPP registry

## Try it
**Live contract:** [OrbitAnchor v3 on Base Sepolia](https://sepolia.basescan.org/address/0x8a9bd10b411a5509916dbe812fd803611c2f9151), with source verified on [Sourcify](https://repo.sourcify.dev/84532/0x8A9BD10b411A5509916dbe812fd803611C2F9151). Its history shows checkpoints from Orbit's operator and from a witness wallet.
```
git clone https://github.com/ayushagarwalhere/orbit && cd orbit
npm install && npm run dev
```
**3-minute demo path:**
1. Overview → *See a greenwashed product get caught*
2. Ledger → run the three tamper scenarios (hash, replay, on-chain)
3. Verify (the browser re-derives verdicts and proves everything against the chain)
4. Console → *Create my key & join*, then return something for its reward
