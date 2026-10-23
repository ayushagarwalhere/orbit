# Security & data integrity assessment

This document covers what Orbit protects, who it protects against, how each guarantee is enforced in code, and what it does **not** protect against.

## 1. What must be true

| # | Property | Meaning |
| --- | --- | --- |
| P1 | **Authenticity** | Every supply chain event was authorised by the party it names, such as a supplier, brand, carrier, auditor or recycler. |
| P2 | **Integrity** | Nobody, including Orbit's operator, can change or delete past events without detection. |
| P3 | **Ordering & timestamping** | The sequence of events is fixed, and its existence at a point in time is publicly provable. |
| P4 | **Independent verifiability** | A consumer, regulator or judge can check P1–P3 without trusting Orbit's servers. |
| P5 | **Claim accountability** | A sustainability claim is shown as verified only if the ledger supports it, and the passport discloses which inputs were self-reported. |
| P6 | **Confidentiality** | Commercial data (volumes, suppliers, prices) is not published on a public chain. |

## 2. Architecture in one paragraph

Each actor (supplier, brand, carrier, retailer, consumer, repairer, recycler, auditor) holds an **Ed25519 key**. The actor first publishes its public key on the ledger in a self-signed `ACTOR_REGISTERED` entry, which proves it holds the key. Every write is an **instruction signed by the actor** (`{action, actorId, body, nonce, issuedAt}`). The API verifies the signature against the registered key, rejects stale requests (more than 5 minutes old) and reused nonces, and refuses bodies that name a different actor than the signer. The resulting ledger entry embeds the signed instruction and is **hash-chained** to the previous entry (SHA-256 over canonical JSON). The **sequencer** (`orbit-protocol`) signs the entry to fix its order. The **Merkle root** of all entry hashes is periodically published to the `OrbitAnchor` contract on a public EVM chain. Each passport carries the events, the signer registrations and **Merkle inclusion proofs**, so a browser can verify everything and compare the root against the chain through a public RPC.

## 3. Threat model

| Adversary | Capability | What stops them | Enforced in |
| --- | --- | --- | --- |
| **Outsider calling the API** | Sends arbitrary requests | Every supply chain action needs a valid Ed25519 signature from a registered actor. Unsigned or forged requests get `401`. | `dispatch.ts` `applySigned` |
| **Actor impersonating another actor** | Holds their own key | The signer is the actor. A body naming someone else gets `403`, and protocol rules then check custody and role (only the holder ships, only a retailer sells, only an auditor attests). | `dispatch.ts`, `actions.ts` |
| **Replay of a captured request** | Has a valid signed request | Nonce uniqueness per actor (`409`), and requests older than 5 minutes are rejected. The verifier also flags an instruction reused later in the ledger. | `dispatch.ts`, `ledger.ts` |
| **Database intruder** | Edits stored records | Any edit changes the content hash and breaks the chain. Product and claim records are committed by hash at creation (`passportHash`, `claimHash`). | `ledger.ts` `verifyLedger`, `verify.ts` |
| **Malicious operator** (holds the sequencer key) | Rewrites history and re-signs it | 1) Cannot forge actors' signed instructions, so changing anything an actor signed (a verdict, a recipient, a mass) is caught as `auth-mismatch`. 2) Cannot change roots already on the public chain: any rewrite of anchored history makes the recomputed root differ from the on-chain root. The demo shows exactly this. | `auth.ts` `authMismatch`, `chain.ts` `checkAnchors`, browser verifier |
| **Operator withholding or reordering events** | Delays sequencing | Reordering anchored history fails the anchor check. Withholding unanchored recent events is possible (see §6). Auto-anchoring every ~20 s narrows the window. | `chain.ts` `scheduleAnchor` |
| **Greenwashing brand** | Publishes misleading claims | Claims are checked against independent data: recycled content against supplier- and recycler-signed lots (mass balance), carbon against those lots plus transport distances derived from both parties' registered sites, and labour claims against a signed auditor approval. Contradictions are shown on the passport, and a rejection by any auditor overrides the brand. | `verify.ts`, `actions.ts` |
| **Supplier inventing recycled content** | Registers material lots | Only recyclers can mint recycled lots, and those lots link to the product they were recovered from. | `actions.ts` `createBatch` |
| **Over-drawing a material lot** | Builds products | Mass balance: a lot can't be drawn beyond its mass, even within a single request. | `actions.ts` `manufacture` |
| **Tampered passport file** | Edits JSON in transit | The browser re-hashes every event, checks every signature and Merkle proof, then reads the root from the chain. | `verify/VerifyClient.tsx` |

## 4. The oracle problem (stated up front)

A ledger proves **who said what, and when**. It cannot prove that what they said was true. A brand that lies at data entry, for example by under-reporting factory energy, is not caught by cryptography. Orbit reduces this risk in four ways:

1. **Counter-party data instead of self-reports where possible.** Material lots are signed by the supplier or recycler, not the brand. Transport distance is computed from both parties' registered locations, not typed in by the shipper. Custody changes need both sides: the shipper ships, and only the addressee can confirm receipt.
2. **Disclosure of self-reported inputs.** The carbon breakdown labels factory energy as *self-reported*. A carbon claim that relies on it without an auditor attestation is still shown as verified, but carries a visible caveat and counts for less in the trust score.
3. **Independent attestation for what data can't prove.** Labour standards, and anything else outside the ledger's reach, need a signed approval from an auditor role that is not the claimant. Any auditor's rejection overrides the claim.
4. **Cross-checks that make lying expensive.** Mass balance across all of a lot's consumers means a brand can't claim more recycled input than its suppliers sold it.

The roadmap adds signed IoT and scale weights at handovers, metered-energy attestations from utilities, and recognised accreditation of auditors.

## 5. Key management

| Key | Holder | Exposure |
| --- | --- | --- |
| Actor Ed25519 keys | **Production:** each actor's own wallet or HSM; the server never sees them. **Demo:** generated randomly at first run into `data/keystore.json` (gitignored) or the `ORBIT_KEYSTORE` secret, and served to the role-play console only when `ORBIT_DEMO_MODE` is on. | Demo mode is a deliberate convenience so judges can act as every party. Requests are still signed in the browser and verified by the API. Set `ORBIT_DEMO_MODE=0` to disable key serving, reset and tamper. |
| Sequencer key (`orbit-protocol`) | Server only, never served. | Can order and re-sign entries, but can't forge actor instructions or change on-chain roots (§3). |
| Anchor EVM key | Server env `ORBIT_ANCHOR_PRIVATE_KEY`, testnet only. | Can only append checkpoints to `OrbitAnchor` (`onlyOperator`). Can't alter past checkpoints: the contract has no update or delete function. |

No private keys are in the repository. Earlier prototype keys derived from public strings were removed. All keys are now random (`@noble/hashes` `randomBytes`, which uses the OS CSPRNG).

## 6. Residual risks & limitations

- **Unanchored window.** Events newer than the latest checkpoint aren't yet publicly timestamped. The operator could withhold or reorder them until the next anchor (about 20 s with auto-anchoring). Passports mark such entries as "not yet anchored".
- **Single sequencer.** Ordering is centralised. Anchoring makes it auditable, but not censorship-resistant. A production path would rotate the sequencer, let actors anchor via their own transactions, or move to a permissioned consortium chain.
- **Registration trust.** The first registration of an actor id wins. Onboarding (KYC or GS1 GLN verification) decides which key belongs to which real company. That step happens off-ledger and is out of scope for the prototype.
- **Demo mode** hands out role-play keys by design. Never enable it on a production deployment.
- **No rate limiting** on the API in the prototype. Put it behind a gateway or WAF in production.
- **Storage** is a single JSON document with atomic rollback per write. Integrity doesn't depend on it, but availability and scale do. Next step: Postgres with an append-only ledger table.

## 7. Verification evidence

- `npm test`: 22 unit tests, including forged, replayed, stale and impersonating requests, naive edits, an insider rewrite that passes local checks but fails against the anchored root, a flipped audit verdict caught by the actor's signature, a foreign sequencer key, lot tampering propagating to products, mass balance and custody rules.
- `npm run test:chain`: deploys `OrbitAnchor` to a real EVM node, anchors a seeded ledger root, and checks that **Solidity verifies the TypeScript Merkle proofs**, rejects a forged leaf, and only lets the operator anchor.
- **Manual end-to-end:** after an insider rewrite, the ledger page and the passport show *on-chain mismatch* while every local signature still checks out, and the offline verifier (passport JSON plus a public RPC only) reports that the claimed root ≠ the on-chain root.
