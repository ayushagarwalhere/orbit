# Orbit: green claims, checked against the supply chain

**Track:** Sustainable Supply Chains · **Tagline:** Digital product passports whose records are signed by the parties involved, anchored on-chain by independent witnesses, and checked automatically for greenwashing.

## Inspiration
The European Commission found that 53% of green claims it examined were vague, misleading or unfounded, and 40% had no supporting evidence at all. Brands publish "70% recycled" or "carbon neutral" labels, and consumers, regulators and even the brands' own buyers can't check them. Most traceability projects *record* supply chain data, but almost none use it to *check the claims* made about the product, and many still ask you to trust the operator's database. The EU is now making Digital Product Passports mandatory: battery passports from February 2027, and textiles to follow under ESPR, likely around 2029. We wanted to show what a passport looks like when it's built for accountability rather than marketing. (Full context: [problem statement](PROBLEM_STATEMENT.md).)

## What it does
- **Lifecycle tracking:** every handover (material lot → factory → ship → retailer → consumer → repair → return → recycler) is an instruction **signed with that actor's own Ed25519 key** in their browser or wallet. In the demo, your browser holds role-play keys for every party. The API verifies the signature, freshness and nonce, plus custody, role and mass-balance rules. Entries are hash-chained.
- **Open, multi-party anchoring:** Merkle roots of the ledger go to `OrbitAnchor` on Base Sepolia. **Anyone can anchor**, and the contract records who did. An auditor, recycler or NGO runs our **witness** program from its own wallet: it re-verifies the whole ledger and anchors the root it saw. If Orbit later rewrites or drops history, the witnesses' roots expose it. The live contract already shows checkpoints from two independent wallets.
- **Digital product passport:** a public QR page showing materials and origin, carbon breakdown, journey map and the signed event trail. It exports as a UNTP / W3C VC-style JSON-LD credential **with a Merkle inclusion proof for every event**. The browser verifier checks it against Orbit's published contract (pinned in code) and against any witness roots.
- **Recycling traceability:** when a recycler processes a returned product, Orbit mints **new recycled lots that point back to the source product**. A battery built from them shows "material recovered from DPP-0003": a closed loop you can prove.
- **Claim verification engine (the core idea):** each claim is checked automatically against data the brand doesn't control:
  - recycled % against **mass balance** of supplier- and recycler-signed lots
  - carbon against those lots plus metered factory energy (flagged as self-reported) plus every transport leg
  - transport legs **cross-checked against the recipient's signed arrival time**: declare "sea" for something that arrives in 24 hours and you're caught
  - origin against the signed manufacture site
  - labour standards against an independent auditor's signed approval

  Contradictions are flagged, vague wording is linted against EU Directive 2024/825, and every product gets a trust grade from A to E.
- **Circular incentives:** the protocol mints **non-transferable** credits for deposit refunds on return, repair-instead-of-replace and each kg recovered. Every mint references the event that triggered it and is inside the anchored root. They're deliberately not a tradable token: we explain why on the rewards page and in the README.
- **Tamper evidence that doesn't trust us:** play a **malicious operator who rewrites history and re-signs everything**. Every local check still passes, but **both Orbit's and the witness's on-chain roots show a mismatch**, the passport turns red, and the witness refuses to anchor the forged history.

## How we built it
- **Next.js 15, React 19, TypeScript, Tailwind v4.**
- **Ed25519 and SHA-256:** native Node crypto on the server, audited `@noble/curves` / `@noble/hashes` in the browser. Signatures are byte-identical across both (strict RFC 8032), and we test that.
- **Solidity `OrbitAnchor` v2** (solc 0.8.26): open anchoring keyed by `ledgerId`, with the submitter recorded and `verifyInclusion` checking our Merkle proofs natively. **viem** publishes anchors on boot and about 45 s after the last write, pausing if the wallet runs low.
- **Scale:**
  - Incremental verification and an append-only Merkle tree: checking the ledger after a write takes **≈ 0.9 ms at 10,000 entries**. A full independent audit takes ≈ 1 ms per entry.
  - An anchor costs **146,180 gas** (measured) and covers any number of events. That's ≈ $0.002–$0.02 per anchor on Base mainnet, or roughly $20–$200 a year for hourly anchoring, whatever the volume.
  - Storage is an append-only JSON Lines log.
- Data models follow **UNTP DPP**, **GS1 EPCIS 2.0 / Digital Link**, **EU ESPR & Battery Regulation** passport fields, and **GLEC** transport factors.
- **31 tests**: forged, replayed, stale and impersonating requests; insider rewrites; transport-mode misdeclaration; crypto backend equivalence; incremental vs. full verification; storage rollback. There's also an **on-chain integration test** that deploys the contract, checks that Solidity agrees with our Merkle proofs, and has a second wallet anchor as a witness.

## Challenges we ran into
- **The operator problem.** A signed database can be rewritten by whoever holds the signing key. We split the roles: **actors sign their instructions, the sequencer signs only the order, and anyone can anchor roots**. In production the operator never holds actor keys, so it can't forge what an actor signed. And because witnesses anchor independently, it can't quietly rewrite or drop history either.
- **The oracle problem.** Cryptography proves who said what, not that it's true. Our answer is to make the *counter-party* supply the evidence:
  - suppliers sign lots
  - distances come from both parties' registered sites
  - the recipient's signed arrival time tests the shipper's declared mode
  - auditors attest what data can't prove

  Whatever is still self-reported is labelled and counts for less. Details are in our [security assessment](SECURITY.md).
- **Provable recycled content.** Material lots carry mass balance, only recyclers can mint recycled lots, and recycled content flows forward through the supply chain.
- **Byte-identical verification** across the browser, Node and Solidity: canonical JSON and a byte-level Merkle tree.

## Accomplishments that we're proud of
- **The greenwashed hoodie is caught on four counts:**
  - It claims 70% recycled; the lots prove 6.7%.
  - It's **declared as sea freight, but the retailer signed for it 24 hours later**.
  - That makes "carbon neutral, 1.2 kg" really 6.0 kg.
  - Its labour audit was rejected.
- **A closed loop you can prove:** a battery is sold, repaired, returned and recycled, then reborn as a **93% recycled** pack with a 65% lower footprint.
- **An insider rewrite** that fools every local signature check is caught by two independent on-chain roots.

## Impact
Our [climate impact assessment](IMPACT.md) projects **about 0.12 Mt CO₂e avoided per year by 2030 if 5% of EU textiles and batteries use Orbit-style passports**, with a range of 0.02–0.41. It scales linearly with adoption, and repair incentives are the largest lever. The arithmetic and every source are shown. Anchoring adds well under one ten-thousandth of that in emissions.

## What we learned
Traceability alone doesn't create accountability. Accountability comes from checking claims against data that someone *other than the claimant* signed, and from letting anyone, not just the operator, put that history somewhere it can't be rewritten.

## What's next for Orbit
- Actors' keys in their own wallets or DIDs, with accredited onboarding
- Signed IoT and scale weights at handovers, plus utility-attested energy data
- Zero-knowledge mass-balance proofs, so suppliers can prove totals without revealing volumes
- A non-transferable credit token that mints only against an on-chain inclusion proof, if a scheme operator wants one
- Anchoring to a public L2 mainnet, and integration with the EU DPP registry

## Try it
**Live contract:** [OrbitAnchor v2 on Base Sepolia](https://sepolia.basescan.org/address/0x8a9bd10b411a5509916dbe812fd803611c2f9151). Its history shows checkpoints from Orbit's wallet and from an independent witness wallet.
```
git clone https://github.com/ayushagarwalhere/orbit && cd orbit
npm install && npm run dev
```
**3-minute demo path:**
1. Overview → *See a greenwashed product get caught*
2. Ledger → *Shrink the hoodie's freight leg* (local checks pass, on-chain mismatch from both Orbit's and the witness's roots)
3. Verify (the browser re-checks everything against the chain)
4. Console as Priya: return the tee for +20 credits, then as Re:Fibre: recycle it
