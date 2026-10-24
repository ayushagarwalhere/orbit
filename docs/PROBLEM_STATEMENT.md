# Problem statement: sustainability claims that nobody can check

**Track:** Sustainable Supply Chains, IEEE ClimateChain Global Hackathon
**Project:** Orbit, digital product passports that check claims against the supply chain record

## 1. The problem

**Most green claims are not reliable.** In a 2020 study, the European Commission found that **53.3%** of environmental claims it examined were vague, misleading or unfounded, and **40%** had no supporting evidence at all. It also counted about **230** different "green" labels, which differ widely in how robust they are.[^ec-qa] In an EU-wide sweep of websites the same year, which included clothing, national consumer authorities found that **42%** of green claims were likely exaggerated, false or deceptive. **37%** used vague terms such as "eco-friendly" or "sustainable", and in **59%** of cases the trader gave no easily accessible evidence.[^ec-sweep] Fashion fares no better. One NGO review of more than 4,000 products from 12 brands found that **59%** of green claims broke the UK regulator's guidance.[^cm]

**Supply chains are long and opaque.** A garment or battery passes through fibre or mineral producers, processors, factories, freight carriers, retailers and, ideally, repairers and recyclers. Each step is run by a different company, often in a different country. Disclosure stops early in the chain. In 2023, **52%** of 250 major fashion brands published their first-tier (final assembly) suppliers. Fashion Revolution notes that brands still have "a long way to go" on disclosure further upstream, back to raw materials.[^fti]

**Why claims can't be verified today:**

- **The evidence sits with someone else.** A "70% recycled" claim depends on records held by a recycler several tiers away. Buyers see a certificate, not the material flow.
- **Certificates can be forged.** In 2020 GOTS found forged certificates covering about **20,000 tonnes** of fake organic cotton in India.[^gots] Nothing ties a paper certificate to a specific product.
- **Numbers are declared, not derived.** Nobody recomputes a brand's carbon figure from its materials, factory energy and transport legs, so air freight can stay hidden.
- **No closed loop.** Returned products and the recycled lots made from them are not linked in any shared record.

## 2. Who is affected

| Group | How the problem hurts them |
| --- | --- |
| **Consumers** | They pay a premium for claims they cannot check, and vague labels erode trust in every claim.[^ec-qa] |
| **Honest brands** | Real recycled content and low-carbon logistics cost more. They lose that premium to competitors who claim the same without doing the work. |
| **Regulators** | They check claims one at a time, after the fact, using documents from the company under investigation. |
| **Recyclers and repairers** | They lack reliable product data for sorting, and cannot prove the value of what they recover. |
| **Procurement teams and investors** | Scope 3 and due-diligence figures are supplier-declared and cannot be audited at scale. |

## 3. Why now

The EU is turning voluntary claims into regulated, data-backed disclosures.

- **ESPR, Regulation (EU) 2024/1781,** creates the Digital Product Passport.[^espr] The textiles delegated act is planned for **Q4 2027**,[^ec-textiles] with requirements applying at least 18 months later, so mandatory textile passports are unlikely before about 2029.
- **Battery Regulation (EU) 2023/1542.** From **18 February 2027**, every LMT battery (e-bikes, e-scooters), EV battery and industrial battery above 2 kWh needs a **battery passport**. The regulation also requires carbon footprint declarations, and minimum recycled content applies from **August 2031** (16% cobalt, 6% lithium, 6% nickel).[^battreg][^council]
- **Directive (EU) 2024/825** applies from **27 September 2026**. It bans generic claims such as "eco-friendly" without recognised excellent environmental performance, "climate neutral" claims based on offsetting, and sustainability labels that are not based on certification schemes.[^empco]
- **Green Claims Directive.** This proposal would have set substantiation and verification rules. On **20 June 2025** the Commission announced that it intends to withdraw it. The file is still listed as pending.[^gcd] So vague claims are banned, but there is no common EU method for proving a claim.
- **CSDDD (EU) 2024/1760, amended by the 2026 Omnibus,** requires firms with more than 5,000 employees and €1.5 billion turnover to run supply-chain due diligence from **July 2029**.[^csddd]

Passports are coming, and vague claims are already banned. What is missing is a practical way to **prove** a claim.

## 4. Gaps in existing solutions

| Approach | What it does well | What it misses |
| --- | --- | --- |
| **Traceability platforms** (EPCIS, DPP tools) | Record where a product has been | **Don't check claims against the data.** A "70% recycled" label can sit next to a 6.7% mass balance. |
| **Certification and audits** | Independent expert judgement | **Periodic, paper-based**, scheme-level rather than per product, and certificates can be forged.[^gots] |
| **Blockchain pilots** | Tamper-evident shared records | Put **raw commercial data on-chain** or depend on **one trusted operator**. TradeLens closed in 2023 without achieving industry-wide collaboration.[^tradelens] |
| **Self-declaration** | Cheap | No independent check. This is what Directive 2024/825 restricts. |

None of these addresses the **oracle problem**, where false data is entered at the source. Orbit can't eliminate it. It reduces it by making each record depend on a counter-party, and it flags data that nobody has independently checked.

## 5. Our approach

Orbit gives every product a Digital Product Passport backed by a ledger of **instructions signed by each party**. Every entry can be re-derived from those instructions by replaying them through public rules, so not even the operator can alter derived data unnoticed. RFC 6962 **Merkle roots** of the ledger are anchored on a public EVM testnet by Orbit and by independent witnesses, so history is provably append-only, and only 32-byte roots go on-chain, so no commercial data is published. A **claim verification engine** checks every claim against the ledger:

- **Recycled content** against the mass balance of the input lots
- **Carbon footprint** recomputed from materials, factory energy and every transport leg
- **Origin** against the signed manufacture location
- **Labour standards** against an independent auditor's signed attestation

Vague wording is linted against Directive 2024/825. Recycled lots link back to the product they came from. Return rewards (funded by the brand's EPR fee in a real scheme), repair and recovery credits are minted only as a rule-derived consequence of a signed event. Self-reported data is labelled as such on the passport.

## 6. Success criteria and measurable objectives

| # | Objective | Measure | Status |
| --- | --- | --- | --- |
| 1 | Catch contradicted claims | Greenwashed demo product flagged on every false claim | Done: hoodie flagged on recycled content (70% vs 6.7%), carbon (1.2 vs 6.0 kg), labour |
| 2 | Tamper evidence | Any edit to history detected, including upstream lots | Done |
| 3 | Independent verification | Passport verifiable without trusting our server | Done: in-browser checks |
| 4 | Closed loop | Recycled lots link to their source product | Done: 93% recycled battery |
| 5 | On-chain data minimisation | Only 32-byte Merkle roots on-chain | Done: `OrbitAnchor.sol` |
| 6 | Pilot (next) | One brand plus one recycler: ≥ 90% of claims machine-checkable, ≥ 50% of footprint data counter-signed | Not started |
| 7 | Climate outcome | Avoided emissions measured from ledger events ([IMPACT.md](IMPACT.md)) | Projected: ~0.08 Mt CO2e/yr at 5% EU adoption |

---

[^ec-qa]: European Commission, *Questions and Answers on European Green Claims*, 22 March 2023. https://ec.europa.eu/commission/presscorner/detail/en/qanda_23_1693
[^ec-sweep]: European Commission press release IP/21/269, *Screening of websites for 'greenwashing'*, 28 January 2021. https://ec.europa.eu/commission/presscorner/detail/en/ip_21_269
[^cm]: Changing Markets Foundation, *Synthetics Anonymous* (2021), press release. https://changingmarkets.org/press-releases/fashion-industry-addicted-to-greenwashing-and-fossil-fuel-based-synthetics-uk/. Advocacy-group analysis against UK CMA guidance.
[^fti]: Fashion Revolution, *Fashion Transparency Index 2023*, as reported by Fashion Dive. https://www.fashiondive.com/news/fashion-transparency-index-2023/688691/
[^gots]: Global Organic Textile Standard, press release, 30 October 2020. https://global-standard.org/news/gots-press-release-gots-detects-evidence-of-organic-cotton-fraud-in-india
[^espr]: Regulation (EU) 2024/1781 (ESPR). https://eur-lex.europa.eu/eli/reg/2024/1781/oj
[^ec-textiles]: European Commission, *Textiles and apparel* (timeline: "Q4 2027: Planned adoption of the ESPR Delegated Act for textiles"). https://single-market-economy.ec.europa.eu/textile-apparel_en
[^battreg]: Regulation (EU) 2023/1542 on batteries and waste batteries, Art. 7, 8 and 77. https://eur-lex.europa.eu/eli/reg/2023/1542/oj
[^council]: Council of the EU press release, 10 July 2023. https://www.consilium.europa.eu/en/press/press-releases/2023/07/10/council-adopts-new-regulation-on-batteries-and-waste-batteries/
[^empco]: Directive (EU) 2024/825 (Empowering Consumers for the Green Transition). https://eur-lex.europa.eu/eli/dir/2024/825/oj
[^gcd]: European Parliament Legislative Train, *Substantiating and communicating green claims*. https://www.europarl.europa.eu/legislative-train/theme-a-european-green-deal/file-substantiating-green-claims
[^csddd]: Latham & Watkins, *EU Sustainability Omnibus Published in the Official Journal* (2026). https://www.lw.com/en/insights/eu-sustainability-omnibus-published-in-the-official-journal. Base text: Directive (EU) 2024/1760, https://eur-lex.europa.eu/eli/dir/2024/1760/oj
[^tradelens]: Maersk, *A.P. Moller - Maersk and IBM to discontinue TradeLens*, 29 November 2022. https://www.maersk.com/news/articles/2022/11/29/maersk-and-ibm-to-discontinue-tradelens
