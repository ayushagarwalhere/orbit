# Orbit: sustainability claims, checked against the supply chain

**Track:** Sustainable Supply Chains · **Tagline:** Digital product passports that verify themselves and catch greenwashing automatically.

## Inspiration
More than half of the green claims the European Commission examined were vague, misleading or unfounded. Brands publish "70% recycled" or "carbon neutral" labels, and consumers, regulators and even the brands' own buyers have no practical way to check them. Most traceability projects record supply chain data, but almost none use that data to **check the claims made about the product**. From 2027 the EU will require Digital Product Passports for batteries and textiles. We wanted to show what a passport looks like when it is built for accountability rather than for marketing.

## What it does
Orbit gives every product a **Digital Product Passport** backed by a **signed, hash-chained ledger**:

- **Lifecycle tracking:** every handover (material lot → factory → ship → retailer → consumer → repair → return → recycler) is recorded as an event signed with that actor's Ed25519 key and chained to the previous entry. Protocol rules enforce custody: only the holder can ship, and only the addressee can receive.
- **Digital product passport:** a public QR page showing materials and origin, carbon breakdown, journey map, the signed event trail and end-of-life instructions. It exports as a UNTP / W3C Verifiable Credential-style JSON-LD document.
- **Recycling traceability:** when a recycler processes a returned product, Orbit creates **new recycled material lots that point back to the source product**. A new battery built from those lots shows *"material recovered from DPP-0003"*, which closes the loop on the ledger.
- **Circular incentives:** the protocol, not the brand, mints credits for deposit refunds on return, repairing instead of replacing, and each kg of material recovered. Consumers can spend them on rewards.
- **Claim verification engine (the core idea):** each claim is automatically checked against the ledger:
  - recycled-content % against **mass balance** of the input lots
  - carbon footprint against materials, metered factory energy and every shipping leg
  - origin against the signed manufacture location
  - labour standards against an independent auditor's signed attestation

  Contradictions are flagged on the passport, vague wording such as "eco-friendly" or "carbon neutral" is linted against EU rules, and each product gets a trust grade from A to E.
- **Tamper evidence:** a built-in tamper simulator lets you edit history like a dishonest insider. Integrity checks fail immediately, the affected passports turn red, and a browser-side verifier re-checks every hash and signature without trusting our server.

## How we built it
- **Next.js 15 + React 19 + TypeScript + Tailwind v4** for the web app and API routes.
- **@noble/curves (Ed25519) and @noble/hashes (SHA-256)**, which are audited and dependency-free, for signatures, canonical-JSON hashing and Merkle trees. The same code runs on the server and in the browser verifier.
- A framework-free core engine (`src/lib`) of validated actions, derived views and the verification engine, with **16 unit tests** on Node's built-in test runner.
- Data models follow **UNTP DPP**, **GS1 EPCIS 2.0** events, **GS1 Digital Link** identifiers, **EU ESPR / Battery Regulation** passport fields, and **GLEC** transport factors.
- **Solidity `OrbitAnchor` contract** for publishing ledger Merkle roots on a public chain, so only a 32-byte root goes on-chain and no commercial data leaks.

## Challenges we ran into
- **Making recycled content provable rather than declared.** We modelled material lots with mass balance, so lots can't be over-drawn and only recyclers can mint recycled lots. Recycled content then flows forward through the supply chain.
- **Deciding what to put on-chain.** Putting every event on a public chain is slow and leaks supplier data. We sign every event off-chain and anchor only Merkle roots.
- **Keeping verification independent.** Canonical JSON hashing had to give byte-identical results in Node and the browser.

## Accomplishments that we're proud of
- In the demo, a greenwashed hoodie is caught on three counts: it claims 70% recycled while the ledger proves 6.7%, it claims "carbon neutral, 1.2 kg" against 6.0 kg once air freight is counted, and its labour audit was rejected.
- A battery completes a full life cycle (sold, repaired, returned, recycled) and is reborn as a **93% recycled** pack with a 65% lower footprint, with the link between the two passports provable.
- Any edit to history is caught, including edits to an upstream material lot, which flags every product made from it.

## What we learned
Traceability alone does not create accountability. It only helps once claims are checked against the trace and someone independent can re-check them. Standards like UNTP and EPCIS already define much of the vocabulary, so the missing piece is the verification logic on top.

## What's next for Orbit
- Actor-held keys (wallets / DIDs) instead of demo custodial keys
- IoT scale-weight attestations at each handover
- Zero-knowledge mass-balance proofs, so suppliers can prove totals without revealing volumes
- Anchoring Merkle roots to a public L2, and integration with the EU DPP registry

## Try it
```
git clone https://github.com/ayushagarwalhere/orbit && cd orbit
npm install && npm run dev
```
**3-minute demo path:** Overview → EcoCloud Hoodie passport (contradicted claims) → Strata Loop Edition (closed loop) → Ledger → *Flip a failed labour audit* (tamper detected) → Verify (browser re-checks signatures) → Console as Priya: return the tee for +20 credits → as Re:Fibre: recycle it.
