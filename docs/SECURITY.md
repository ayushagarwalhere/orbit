# Security & data integrity assessment

What Orbit protects, against whom, by which mechanism, which test shows it, and what stays open. Files are in `src/lib/` unless stated. Tests are named by their exact titles.

## 1. What must be true

- **P1 Authenticity.** Every event was authorised, through a signed instruction, by the party it names.
- **P2 Derivability.** Every entry, including protocol-made data (credits, recovered lots, distances), can be re-derived from the signed instructions by the public rules.
- **P3 Integrity.** Nobody, including Orbit's operator, can change, delete or reorder anchored events without detection.
- **P4 Timestamping.** That an event existed by a given time is publicly provable.
- **P5 Verifiability.** Anyone can check P1–P4 against a public chain, not against Orbit's word.
- **P6 Claim accountability.** A claim is verified only if other parties' data supports it; self-reported inputs are labelled.
- **P7 Confidentiality.** Only Merkle roots go on-chain. **The ledger itself is public in this demo** (see §6): the passport page has a public view that hides supplier identities, lot numbers and quantities, and a regulator and recycler view that shows everything, but that is a display choice, not cryptographic confidentiality.

## 2. How it works

1. **Identity.** Each actor publishes an Ed25519 public key in a self-signed `ACTOR_REGISTERED` entry. Entry #0 is the protocol's registration and names the `ledgerId`.
2. **Instructions.** Every write is a signed `{action, ledger, actorId, body, nonce, issuedAt}`. `applySigned` (`dispatch.ts`) checks the signature, the ledger id, a 5-minute freshness window, the nonce, that the body names no other actor, that there are no unknown fields, and strict types and bounds.
3. **Rules and replay.** `actions.ts` applies custody, roles, mass balance and claim rules. Each entry embeds its instruction, is hash-chained and sequencer-signed. `replay.ts` re-runs every instruction and requires identical entries. Only the entry log is stored.
4. **Anchoring.** RFC 6962 roots go to the open `OrbitAnchor` v3 contract on [Base Sepolia](https://sepolia.basescan.org/address/0x8a9bd10b411a5509916dbe812fd803611c2f9151). The operator anchors automatically. A witness (`scripts/witness.ts`) re-verifies and replays the ledger, checks it against every trusted root, then anchors from its own wallet.
5. **Browser verification** (`passport-verify.ts`), with the contract, operator and one named witness pinned in `networks.ts`:
   1. read the passport's checkpoint through a public RPC; it must be on the pinned contract, by the pinned operator;
   2. download the **whole ledger**, re-hash every entry, rebuild the root; it must equal the on-chain root;
   3. compute the root locally at every other checkpoint by the operator or a named witness; each must match. Unidentified submitters are counted and ignored;
   4. warn (**Witnessed**) if no named witness has anchored this ledger;
   5. **single ledger:** entry #0 is the genesis and names the ledger id, which equals the checkpoint's and the passport's; every instruction names it; each actor registered once, by itself;
   6. check every signature and signed time, and replay every instruction;
   7. **complete and genuine:** every anchored entry about the product, plus each source lot's `BATCH_CREATED`, is in the passport; each passport event re-hashes to the anchored entry at its index;
   8. re-derive every claim verdict and the trust grade.

The browser no longer uses inclusion or consistency proofs from the server. Passports still carry inclusion proofs, and the contract can check them, but the verifier does not rely on them.

## 3. Threat model

| Adversary and attempt | What stops it | Where | Test |
| --- | --- | --- | --- |
| Outsider calls the API | A valid signature from a registered key (`401`). | `dispatch.ts` | "API rejects requests not signed by the actor's own key" |
| Hostile input: bad types, out-of-range values, extra fields, large bodies (B4) | Strict validation; unknown fields rejected; bodies over 16 KB rejected. Nothing is written. | `dispatch.ts`, route (`src/app/api/actions/[action]/route.ts`) | "API validates every input strictly, so no request can poison the ledger"; "API rejects unknown fields and odd self-registration ids instead of storing them" |
| Self-registering as a privileged role or look-alike id (B4) | Consumers only; id must match `guest-[a-z0-9]{1,32}`; signed by the key it registers; 20 successful registrations per 10 minutes (failed attempts don't count, so they can't lock others out). | `dispatch.ts`, route | "a guest consumer can self-register with a key that never leaves their browser, and only as a consumer" |
| Actor impersonates another | The signer is the actor; naming another gets `403`. | `dispatch.ts` | "API rejects impersonation, replay and stale requests" |
| Replay of a captured instruction | Nonce, freshness, ledger binding; reuse is flagged on replay. | `dispatch.ts`, `ledger.ts` | "API rejects impersonation, replay and stale requests"; "a signed instruction cannot be replayed into another ledger (e.g. after a reset)" |
| Database intruder edits entries | Hash chain breaks; no mutable state exists. | `ledger.ts`, `store.ts` | "naive edit is caught by hash check, and restore fixes it" |
| Operator changes derived data or mints credits, and re-signs | Replay re-derives each entry; an entry without an instruction fails. | `replay.ts` | "operator rewriting derived data (and re-signing) is caught by replaying the signed instructions"; "operator cannot mint credits from nothing" |
| Insider alters a signed instruction or the sequencer key | Actor signature fails; sequencer key comes only from genesis. | `ledger.ts` | "insider cannot change what an actor signed: flipping an audit verdict is caught without the chain"; "an entry re-signed with a different sequencer key is rejected" |
| Operator erases an instruction, regenerates later history, re-anchors | Local checks pass, but the root differs from roots already anchored under this ledger id. | `passport-verify.ts`, `witness.ts` | "operator erasing a whole signed instruction passes every local check but fails against the anchored root"; "browser verifier: history rewritten and re-anchored fails against the witness's checkpoint" |
| Server feeds the verifier a rewritten or truncated ledger | Must hash to the on-chain root and be as long as every trusted checkpoint. | `passport-verify.ts` | "browser verifier: a node serving a rewritten or truncated ledger is caught" |
| Forger anchors a fake ledger on the open contract | Checkpoint must be by the pinned operator on the pinned contract. | `networks.ts`, `passport-verify.ts` | "browser verifier: a checkpoint submitted by anyone but Orbit's operator is rejected"; "browser verifier: an unanchored passport is never shown as verified" |
| Browser witness anchors a bad ledger | Before asking the wallet to sign, the browser re-runs every check and compares every trusted checkpoint; any mismatch refuses to anchor. Its checkpoint counts only once its address is pinned as a named witness. | `witness-browser.ts` | none (smoke-tested on Base Sepolia: a tampered copy was refused, the genuine ledger anchored) |
| Griefer anchors junk roots | Unidentified submitters are ignored, and shown. | `passport-verify.ts`, `witness.ts` | "browser verifier: junk anchors from unidentified wallets are ignored, not fatal" |
| Passport carries forged keys or events (B1) | Keys come only from the authenticated ledger. Every event and registration in the passport is re-hashed and must equal the anchored entry. | `passport-verify.ts` | "browser verifier: a forged audit in the passport is caught (review B1)"; "browser verifier: keys swapped into the passport's registrations change nothing (review B1)" |
| Sequencer dates entries ahead (e.g. to farm time-based credits) | Entry times must never go backwards, and no anchored entry may be dated after its anchoring block (5 minutes' grace). | `ledger.ts`, `passport-verify.ts` | "entry times must move forward, and can't be later than the anchoring block" |
| Passport omits an event (B2) | All anchored product and source-lot events must be present. | `passport-verify.ts` | "browser verifier: a passport that leaves out an inconvenient event is caught (review B2)" |
| Passport has an edited verdict or grade | Both are re-derived in the browser. | `passport-verify.ts` | "browser verifier: an edited verdict or grade is caught by re-derivation" |
| Operator rebuilds history under a new ledger id (B3) | Reused instructions name the old ledger and fail. A full re-sign needs every actor's key; it then passes but shows the **Witnessed** warning. | `passport-verify.ts` | "browser verifier: rebuilding history under a new ledger id is caught or flagged (review B3)" |
| Repair credit farming (B5) | One repair credit per product per 30 days, by ledger time, so replay agrees. | `actions.ts` | "repair credits: at most once per product every 30 days, and replay agrees" |
| Steady writes postpone anchoring (B6) | A pending auto-anchor timer is no longer reset by new writes. A new ledger (boot or reset) is anchored within seconds. | `chain.ts` | none |
| Draining the anchor wallet | Auto-anchor at most every 10 min (`ORBIT_ANCHOR_MIN_INTERVAL_MS`); manual anchor refused within 2 min unless 5+ new entries; no-op if nothing changed; balance floor. | `chain.ts`, route | none |
| Visitor misuses the shared demo's tamper and reset controls | Demo mode only (`403` otherwise). A tamper simulation stays in memory, never reaches disk, pauses writes and blocks anchoring, and auto-restores after 90 s. Reset at most once per 2 min. | `demo.ts`, `store.ts`, route | "tamper simulations stay in memory: disk keeps the genuine ledger and writes pause" |
| Shipper misdeclares mode | Both parties' signed times rule it out; the leg is counted with the lowest-emission feasible mode. | `domain.ts` | "a misdeclared transport mode is exposed by the recipient's signed arrival time" |
| Recycler over-claims, supplier invents recycled content, brand over-draws a lot or greenwashes | Recovery ≤ input mass; only recyclers create recycled lots; mass balance; claims checked against other parties' data; auditor rejection overrides. | `actions.ts`, `verify.ts` | "a recycler cannot sign for more material than went in"; "suppliers cannot invent recycled content"; "mass balance prevents overselling a material lot"; "honest product earns an A, greenwashed product is caught" |

## 4. The oracle problem

Signatures prove **who said what, and when**, not that it was true. Orbit narrows the gap by preferring counter-party data (lots signed by suppliers, receipts by recipients, distance from both sites), cross-checks (arrival time against declared mode; mass balance), physical bounds, and auditor attestation ("only independent auditors can attest; brands only claim their own products"). Factory energy is **self-reported**, labelled as such, and a carbon claim relying on it scores less.

Still possible: a recycler inflating yield up to the input mass; a shipper recording `SHIPPED` early to make a slower mode look plausible; under-reported factory energy.

## 5. Key management

| Key | Holder | Exposure |
| --- | --- | --- |
| Actor keys | **Production:** each actor. **Demo:** generated on first run and served to the role-play console. | Demo mode is on unless `NODE_ENV=production`; `ORBIT_DEMO_MODE=1` forces it on and `ORBIT_DEMO_MODE=0` off. While on, **the server holds the role-play actors' keys and can sign as them.** |
| Guest key | Generated and kept in the visitor's browser. | Server sees only the public key. |
| Sequencer key | Server only. | Can order, delay, refuse and re-sign. Cannot forge instructions, alter derived data unnoticed, or rewrite history anchored under the same ledger id. |
| Anchor EVM key | Server env, testnet. | The pinned operator address. |
| Witness EVM key | Separate wallet. | **The only named witness is a second wallet run by the Orbit team**, funded from the operator's wallet. It shows the role. It is not independent. |

No private keys are in the repository.

## 6. What remains open

- **The witness is ours.** With demo keys and our own witness wallet, Orbit could rebuild a ledger under a new id, re-sign it, and anchor it from both wallets. The Witnessed check only helps once the witness is someone else.
- **Verifier delivery.** The verifier code and the ledger both come from Orbit's server. The ledger is checked against the chain; the code is not. Running the open-source verifier or `npm run witness -- --check-only` yourself avoids this.
- **Oracle problem** (§4).
- **Cost is linear in ledger size.** The browser downloads and replays everything. Fine at demo scale; larger ledgers need signed state checkpoints or sharding.
- **Tail.** Completeness is checked up to the passport's checkpoint. Later events are shown as "not yet anchored" and only self-hash-checked.
- **Unanchored window.** Up to about 10 minutes, during which the operator could withhold entries.
- **Junk anchors.** Anyone with a funded wallet can anchor anything. Ignored, but shown.
- **Censorship.** The sequencer can refuse an instruction. Actors keep their signed instruction as evidence.
- **Timestamps.** Sequencer time must be within 5 minutes of the actor's signed time, never go backwards, and not be after the anchoring block. Between anchors, the sequencer can still choose times inside that window.
- **Anchor wallet.** Manual anchors can spend the wallet down to the floor, which pauses all anchoring.
- **Rate limits are in memory**, per server instance.
- **Commercial confidentiality.** Anyone can download the full demo ledger, including every supplier, lot mass, factory and carrier. No brand would publish that, which is why EU passport rules give the public, authorities and recyclers different access. The production design: confidential fields (supplier id, lot mass, price) go on the ledger only as salted hash commitments; the brand keeps the values and the salts and discloses them to authorised viewers, who check them against the commitments. Replay and mass balance then run on the authorised side, and the public verifier checks signatures, anchoring and the published verdicts. Not built here.
- **Accreditation bodies are registered by the operator.** Recycled content and audits count only under a certificate signed on the ledger by an accreditation body (`accredit`, `suspend-accreditation` in `actions.ts`; tests "accreditation: …"). In the demo, Orbit registers that body's key, so the operator is still the root of that trust. In production its key would be pinned like the witnesses' or resolved from the scheme owner (e.g. Textile Exchange for GRS).
- **Registration** to real companies (KYC, GS1 GLN) and **versioned rules** are out of scope.

## 7. Evidence

- **`npm test`: 61 tests, all passing.** Also relevant: "RFC 6962: every inclusion proof verifies for every size up to 70, and forgeries fail"; "RFC 6962: every consistency proof verifies for every pair of sizes up to 50, and rewrites fail"; "native (server) and pure-JS (browser) Ed25519 + SHA-256 agree byte for byte"; "sequencer time must match the time the actor signed"; "all state is rebuilt from the ledger alone by replay, identical to the live state"; "browser verifier: an honest, witnessed passport passes every check, verdicts and grade re-derived".
- Browser-verifier tests run against a simulated chain, not Base Sepolia.
- **`npm run verify:live`** runs the same verifier from Node against a running node and the real chain. On 24 Oct 2026, after the new seed, all 44 checks passed across the 4 demo passports on Base Sepolia, including the named-witness check.
- **`npm run test:chain`** ("OrbitAnchor v3: open anchoring, RFC 6962 inclusion and consistency proofs verified on-chain") deploys the contract to a local EVM node and checks its proofs, a second wallet anchoring, and rejection of empty ledgers.
- The contract source is verified on Sourcify.
- **Untested:** the 16 KB cap, the rate limits (guest registrations, manual anchors, demo resets), the 90 s tamper auto-restore, the balance floor, and the B6 timer fix (they live in the HTTP route, the chain service and timers, which the unit tests don't exercise).
