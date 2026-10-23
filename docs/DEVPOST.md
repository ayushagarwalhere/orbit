# Orbit: green claims, checked against the supply chain

**Track:** Sustainable Supply Chains · **Tagline:** Digital product passports with actor-signed, blockchain-anchored records that verify themselves and catch greenwashing automatically.

## Inspiration
The European Commission found that 53% of green claims it examined were vague, misleading or unfounded, and 40% had no supporting evidence at all. Brands publish "70% recycled" or "carbon neutral" labels, and consumers, regulators and even the brands' own buyers can't check them. Most traceability projects *record* supply chain data, but almost none use it to *check the claims* made about the product, and many still ask you to trust the operator's database. The EU is now making Digital Product Passports mandatory: battery passports from February 2027, and textiles to follow under ESPR, likely around 2029. We wanted to show what a passport looks like when it's built for accountability rather than marketing. (Full context: [problem statement](PROBLEM_STATEMENT.md).)

## What it does
- **Lifecycle tracking:** every handover (material lot → factory → ship → retailer → consumer → repair → return → recycler) is an instruction **signed with that actor's own Ed25519 key in their browser or wallet** (in the demo, your browser holds role-play keys for every party). The API verifies the signature, freshness and nonce, plus custody, role and mass-balance rules. Entries are hash-chained, and their **Merkle root is anchored on a public EVM chain** through our `OrbitAnchor` contract.
- **Digital product passport:** a public QR page showing materials and origin, carbon breakdown, journey map and the signed event trail. It exports as a UNTP / W3C VC-style JSON-LD credential **with a Merkle inclusion proof for every event**.
- **Recycling traceability:** when a recycler processes a returned product, Orbit mints **new recycled lots that point back to the source product**. A battery built from them shows "material recovered from DPP-0003": a closed loop you can prove.
- **Circular incentives:** the protocol, never the brand, mints credits for deposit refunds on return, repair-instead-of-replace and each kg recovered. Consumers spend them on rewards.
- **Claim verification engine (the core idea):** each claim is checked automatically against independent data:
  - recycled % against **mass balance** of supplier- and recycler-signed lots
  - carbon against those lots plus metered factory energy plus every transport leg, computed from both parties' registered sites
  - origin against the signed manufacture site
  - labour standards against an independent auditor's signed approval

  Contradictions are flagged, self-reported inputs are disclosed, vague wording is linted against EU Directive 2024/825, and every product gets a trust grade from A to E.
- **Tamper evidence that doesn't trust us:** the built-in simulator lets you play a **malicious operator who rewrites history and re-signs everything**. Every local check still passes, but the **on-chain root no longer matches**, and both the ledger and the passport turn red. The **browser verifier** takes keys only from on-ledger registrations, checks every signature and Merkle proof, and reads the root directly from the chain through a public RPC.

## How we built it
- **Next.js 15, React 19, TypeScript, Tailwind v4.**
- **@noble/curves (Ed25519) and @noble/hashes (SHA-256)**, which are audited and dependency-free. The same code signs in the browser, verifies on the server and re-verifies in the verifier.
- **Solidity `OrbitAnchor`** (solc 0.8.26) stores only 32-byte Merkle roots, so no business data goes on-chain and the cost per checkpoint is constant. `verifyInclusion` checks our TypeScript Merkle proofs natively. **viem** publishes anchors automatically on boot and about 45 s after the last write, pausing if the anchor wallet runs low.
- Data models follow **UNTP DPP**, **GS1 EPCIS 2.0 / Digital Link**, **EU ESPR & Battery Regulation** passport fields, and **GLEC** transport factors.
- **22 unit tests**: forged, replayed, stale and impersonating requests, insider rewrites, mass balance, custody and claim logic. There's also an **on-chain integration test** that deploys the contract and checks that Solidity agrees with our Merkle proofs.

## Challenges we ran into
- **The operator problem.** A signed database alone isn't enough, because whoever holds the signing key can rewrite history. We split the signatures: **actors sign their instructions, the sequencer signs only the order**, and **public anchors** fix history in time. In production the operator never holds actor keys, so it can't forge what an actor signed, and nobody can change a root that's already on-chain. (In the demo, the server generates the role-play keys so judges can act as every party, so this guarantee applies to production key custody. The on-chain check holds either way.)
- **The oracle problem.** Cryptography proves who said what, not that it's true. We lean on **counter-party data** (suppliers sign lots, distances come from both parties' registered sites, receipts need the recipient), **disclose self-reported inputs**, and require **independent attestation** for what data can't prove. Details are in our [security assessment](SECURITY.md).
- **Provable recycled content.** We modelled material lots with mass balance, so lots can't be over-drawn and only recyclers can mint recycled lots. Recycled content then flows forward through the supply chain.
- **Byte-identical verification** across the browser, Node and Solidity: canonical JSON and a byte-level Merkle tree.

## Accomplishments that we're proud of
- **The greenwashed hoodie is caught on three counts:** it claims 70% recycled while the lots prove 6.7%, it claims "carbon neutral, 1.2 kg" against 6.0 kg once air freight is counted, and its labour audit was rejected.
- **A closed loop you can prove:** a battery is sold, repaired, returned and recycled, then reborn as a **93% recycled** pack with a 65% lower footprint, with provable links in both directions.
- **An insider rewrite** that fools every local signature check is still caught by the blockchain.

## Impact
Our [climate impact assessment](IMPACT.md) projects **about 0.12 Mt CO₂e avoided per year by 2030 if 5% of EU textiles and batteries use Orbit-style passports**, with a range of 0.02–0.41. It scales linearly with adoption, and repair incentives are the largest lever. The arithmetic and every source are shown. Anchoring adds well under one ten-thousandth of that in emissions.

## What we learned
Traceability alone doesn't create accountability. Accountability comes from checking claims against the trace, separating who authors data from who orders it, and letting anyone re-check the result without trusting the operator.

## What's next for Orbit
- Actors' keys in their own wallets or DIDs, with accredited onboarding
- Signed IoT and scale weights at handovers, plus utility-attested energy data
- Zero-knowledge mass-balance proofs, so suppliers can prove totals without revealing volumes
- Anchoring to a public L2 mainnet, and integration with the EU DPP registry

## Try it
**Live contract:** [OrbitAnchor on Base Sepolia](https://sepolia.basescan.org/address/0x9735e3824f7dafb5d2302ed4796c644534688a06). Each checkpoint is a public transaction you can inspect.

```
git clone https://github.com/ayushagarwalhere/orbit && cd orbit
npm install && npm run dev
```
**3-minute demo path:**
1. Overview → *See a greenwashed product get caught*
2. Ledger → *Hide the hoodie's air-freight leg* (local checks pass, on-chain mismatch)
3. Verify (the browser re-checks everything against the chain)
4. Console as Priya: return the tee for +20 credits, then as Re:Fibre: recycle it
