# Security & data integrity assessment

This document covers what Orbit protects, who it protects against, how each guarantee is enforced in code (file references), what is tested, and what it does **not** protect against.

## 1. What must be true

| # | Property | Meaning |
| --- | --- | --- |
| P1 | **Authenticity** | Every supply chain event was authorised by the party it names, through an instruction signed with that party's key. |
| P2 | **Derivability** | Every ledger entry, including protocol-created data such as credits, recovered lots, distances and passport hashes, can be re-derived from the signed instructions by the public rules. There is no other source of truth. |
| P3 | **Integrity** | Nobody, including Orbit's operator, can change, delete or reorder past events without detection. |
| P4 | **Timestamping** | The existence and order of events at a point in time is publicly provable. |
| P5 | **Independent verifiability** | A consumer, regulator or judge can check P1–P4 without trusting Orbit's servers. |
| P6 | **Claim accountability** | A sustainability claim shows as verified only if independent data supports it, and the passport discloses which inputs were self-reported. |
| P7 | **Confidentiality** | Commercial data (volumes, suppliers, prices) is not published on a public chain. |

## 2. Architecture in brief

1. **Identity.** Each actor holds an Ed25519 key and publishes the public key on the ledger in a **self-signed** `ACTOR_REGISTERED` entry (proof of possession). The protocol's own registration is the genesis entry and names the ledger (`ledgerId`).
2. **Instructions.** Every write is an instruction signed by the actor: `{action, ledger, actorId, body, nonce, issuedAt}`. The API (`dispatch.ts`) checks:
   - the signature, against the registered key;
   - that the instruction is for this ledger;
   - freshness (5 minutes) and nonce uniqueness;
   - that the body doesn't name a different actor than the signer;
   - **strict schema validation** of every field (finite, bounded numbers, enums, length limits).
3. **Rules.** The validated instruction runs through the protocol rules (`actions.ts`): custody, roles, mass balance, recovery bounds and claim issuance. Every resulting entry embeds the signed instruction, gets one sequencer timestamp (bound to the signed time), is hash-chained, and is signed by the sequencer.
4. **Replay.** `replay.ts` re-runs every instruction through **the same code path** and requires byte-identical entries. Application state is never stored: actors, lots, products, claims, audits, credits and checkpoints are all rebuilt by replay. The disk holds only an append-only log of entries (`store.ts`).
5. **Anchoring.** RFC 6962 Merkle roots of the ledger go to the open `OrbitAnchor` v3 contract ([Base Sepolia](https://sepolia.basescan.org/address/0x8a9bd10b411a5509916dbe812fd803611c2f9151), source verified on Sourcify). Roots come from Orbit's operator and from **witnesses**: independent parties who download the ledger, re-verify it, and anchor from their own wallets (`scripts/witness.ts`).
6. **Verification.** The browser verifier (`passport-verify.ts`) checks a passport against **trust roots pinned in code** (contract address, operator address, named witnesses):
   - keys, taken only from registrations;
   - every signature, binding and signed time;
   - every claim verdict, **re-derived** from the proven events;
   - that the checkpoint was submitted by the pinned operator;
   - an RFC 6962 inclusion proof for every entry;
   - an RFC 6962 **consistency proof** against **every** trusted checkpoint for the ledger.

## 3. Threat model

| Adversary | Capability | What stops them | Enforced in | Tested |
| --- | --- | --- | --- | --- |
| **Outsider calling the API** | Sends arbitrary requests | Every action needs a valid signature from a registered actor (`401`). | `dispatch.ts` | ✓ |
| **Malformed or hostile input** | Sends `"x"`, NaN, negatives or huge values | Strict validation rejects them before any rule runs; nothing is written. | `dispatch.ts` | ✓ |
| **Actor impersonating another** | Holds their own key | The signer is the actor. A body naming someone else gets `403`. Custody and role rules then apply. | `dispatch.ts`, `actions.ts` | ✓ |
| **Replaying a captured instruction** | Has a valid signed request | Nonce uniqueness, 5-minute freshness, and binding to the ledger id (so it can't be replayed into a fresh or reset ledger). Replay verification also flags an instruction reused later. | `dispatch.ts`, `ledger.ts` | ✓ |
| **Database intruder** | Edits stored entries | The entry hash breaks the chain. No mutable records exist to edit: all state is re-derived from the ledger. | `ledger.ts`, `replay.ts`, `store.ts` | ✓ |
| **Malicious operator rewriting derived data** (holds the sequencer key) | Changes a distance, a lot's recycled mass or a credit amount, then re-hashes and re-signs | **Replay** re-derives the entry from the actor's signed instruction and reports exactly which field differs (`derived-mismatch`). | `replay.ts` | ✓ |
| **Malicious operator minting credits** | Appends `CREDIT_MINTED`, or smuggles a bigger amount into a real instruction's entries | An entry with no instruction behind it is `unauthorised-entry`; an altered amount is a `derived-mismatch`. | `replay.ts` | ✓ |
| **Malicious operator erasing or reordering instructions** | Deletes an instruction (e.g. a failed audit), then **regenerates** all later history through the real rules and re-signs | Every local check passes; this is the hardest case. Roots already on-chain disagree, and no RFC 6962 consistency proof can link the rewritten history to any earlier trusted checkpoint, **whatever length it is re-anchored at**. | `chain.ts`, `passport-verify.ts`, `OrbitAnchor.verifyConsistency` | ✓ (also run live on Base Sepolia) |
| **Operator showing different histories to different parties** (split view) | Serves witness A one ledger and witness B another | All trusted roots for a ledger must be mutually consistent. The browser checks consistency with every one, and each witness compares all prior roots before anchoring. | `passport-verify.ts`, `witness.ts` | ✓ |
| **Forger using the open contract** | Builds a fake ledger with their own keys and anchors its root | The verifier requires the checkpoint's submitter to be Orbit's **pinned operator** on the **pinned contract**. A forger's checkpoint fails. | `networks.ts` `OFFICIAL_ANCHORS`, `passport-verify.ts` | ✓ |
| **Griefer anchoring junk roots** | Publishes bad roots under Orbit's `ledgerId` | Unidentified submitters are reported as informational and can't fail verification or block witnesses. | `chain.ts`, `passport-verify.ts`, `witness.ts` | ✓ |
| **Forged passport file** | Edits the JSON (events, proofs, verdicts) | Hashes, signatures and proofs fail, and claim verdicts are re-derived in the browser, so an edited verdict is caught. | `passport-verify.ts` | ✓ |
| **Shipper misdeclaring transport mode** | Declares "sea" for an air shipment | The recipient signs the arrival. The transit time from **both parties' signed times** makes the declared mode impossible, so the leg is counted with the lowest-emission mode that could make the trip. | `domain.ts` `shipmentLegs` | ✓ |
| **Recycler over-claiming recovered material** | Signs a recovered mass | It can't exceed the input mass of that material. | `actions.ts` `recycle` | ✓ |
| **Supplier inventing recycled content** | Registers lots | Only recyclers can create recycled lots, and they're traceable to their source product. | `actions.ts` | ✓ |
| **Over-drawing a lot** | Builds products | Mass balance, including within one request. | `actions.ts` | ✓ |
| **Greenwashing brand** | Publishes misleading claims | Claims are checked against counter-party data; any auditor rejection overrides the brand; vague wording is linted. | `verify.ts` | ✓ |
| **Draining the anchor wallet** | Calls `/api/actions/anchor` repeatedly | No-op when nothing changed, one manual anchor per 30 s, balance floor for every anchor, debounced auto-anchoring. | `chain.ts`, route | (manual) |

## 4. The oracle problem (stated up front)

A ledger proves **who said what, and when**. It can't prove that what they said was true. Orbit narrows the gap in five ways:

1. **Counter-party data instead of self-reports.**
   - Lots are signed by suppliers or recyclers, not by brands.
   - Distance comes from both parties' registered sites.
   - A receipt needs the recipient's own signature.
2. **Cross-checks between signers.** The recipient's signed arrival time tests the shipper's declared mode: the brand's lie is exposed by someone else's signature (the hoodie demo). Mass balance across all of a lot's consumers stops a brand claiming more recycled input than its suppliers sold.
3. **Physical bounds.** A recycler can't sign for more recovered material than went in. A claim can't exceed physical limits (recycled ≤ 100%, repairability ≤ 10).
4. **Disclosure.** Self-reported factory energy is labelled as such. A carbon claim relying on it without attestation carries a caveat and counts for less.
5. **Independent attestation** for what data can't show (labour). Any auditor's rejection overrides.

**What remains possible:**
- **Inflating yield.** A recycler could still inflate its yield up to the input mass.
- **Recording SHIPPED early.** A shipper could record `SHIPPED` days before the goods actually leave, making a slower mode look plausible. The product is then locked "in transit" and can't be sold meanwhile, which limits the abuse, but a carrier pickup signature is the real fix.
- **Under-reported factory energy.** Factory energy remains self-reported unless an auditor attests it.

The roadmap adds signed scale weights at handovers, carrier pickup signatures, and utility-attested energy.

## 5. Key management

| Key | Holder | Exposure |
| --- | --- | --- |
| Actor Ed25519 keys | **Production:** each actor's wallet or HSM. **Demo:** generated randomly on first run (`data/keystore.json`, gitignored, or the `ORBIT_KEYSTORE` secret) and served to the role-play console in demo mode. | Demo mode is **on by default only in development** (`npm run dev`), and must be enabled explicitly in production (`ORBIT_DEMO_MODE=1`). While it's on, the server generated the role-play keys and could sign as those demo actors. The UI and docs say so. |
| Guest consumer key | **Generated in the visitor's browser** and kept in localStorage. The server only sees the public key, through a self-signed registration. | Non-custodial, even in the demo. |
| Sequencer key (`orbit-protocol`) | Server only, never served. | Can order and re-sign entries, but can't forge instructions, can't alter derived data without a replay mismatch, and can't make a rewrite consistent with trusted on-chain roots. |
| Anchor EVM key | Server env, testnet only. | Same rights as anyone on the open contract. Its address is the pinned operator. |
| Witness EVM key | The witness's own environment. | **In this demo the witness wallet is run by the Orbit team** (and was funded from the operator's wallet) to show the role. Its label in `networks.ts` says so. A real deployment pins wallets of independent auditors, recyclers or NGOs. |

No private keys are in the repository. All keys are random (OS CSPRNG via `@noble/hashes`).

## 6. Residual risks & limitations

- **Unanchored window.** Entries newer than the latest trusted checkpoint aren't yet publicly fixed, and the operator could withhold them. Auto-anchoring about 45 s after the last write, and witnesses, narrow this. Passports mark such entries "not yet anchored".
- **Censorship.** A sequencer can refuse to accept an instruction. Actors keep their own signed instruction as a receipt. The fix is rotating sequencers or a consortium chain.
- **Tail completeness.** A passport proves the events it contains are genuine and anchored. It can't prove no *later* event exists. The append-only check against every trusted checkpoint limits this to entries newer than the latest one.
- **Coarse speed bounds.** The transport check catches gross misdeclarations (sea vs. air), not subtle ones.
- **Registration trust.** The first registration of an actor id wins. Mapping keys to real companies needs onboarding (KYC / GS1 GLN), which is out of scope.
- **Rule changes.** Replay assumes one rule set. Changing the rules needs versioned rules keyed by ledger height.
- **No general API rate limiting** beyond anchoring and reset; use a gateway in production.
- **Demo mode** hands out role-play keys by design. Never enable it in production.

## 7. Verification evidence

- **`npm test`: 46 tests**:
  - authentication (forged, replayed, stale, impersonating, cross-ledger requests)
  - strict validation
  - guest self-registration
  - replay catching operator-altered derived data and operator-minted credits
  - erase-and-regenerate passing local checks but failing against the anchored root
  - timestamp binding
  - state rebuilt by replay identical to live state
  - transport misdeclaration
  - recovery bounds
  - mass balance and custody
  - storage reload, rollback and memory-only tamper
  - native vs. pure-JS crypto equivalence
  - exhaustive RFC 6962 inclusion and consistency tests (every size up to 70 and 50), including forged histories
  - browser-verifier tests against a simulated chain: an honest passport passes; a forger's checkpoint, a rewrite re-anchored at a new length, and an edited verdict all fail; junk anchors are ignored
- **`npm run test:chain`:** deploys `OrbitAnchor` v3 to a real EVM node.
  - Checks Solidity `verifyInclusion` and `verifyConsistency` against the TypeScript proofs, including a forged history.
  - Checks that a second wallet can anchor as witness, and that empty ledgers are rejected.
- **Live on Base Sepolia:**
  - The browser verifier's code passes all 28 checks on a real passport against [OrbitAnchor v3](https://sepolia.basescan.org/address/0x8a9bd10b411a5509916dbe812fd803611c2f9151): consistent with 7 other trusted checkpoints, 2 of them by the witness.
  - After the erase-and-regenerate attack, the same verifier fails at the on-chain checkpoint while every local check still passes.
- **Contract source** verified with an exact match on Sourcify (creation and runtime bytecode).
