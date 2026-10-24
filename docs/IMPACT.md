# Climate impact assessment and carbon reduction projections

**Project:** Orbit, verifiable digital product passports with circular incentives
**Scope:** EU textiles (clothing, footwear, household textiles) and EU batteries (e-bike / LMT and EV), 2027–2030

## TL;DR

- If 5% of EU textiles (about 0.43 of the ~8.6 Mt sold a year) and 5% of EU batteries carried an Orbit passport by 2030, we project about **0.08 Mt CO2e avoided per year** (range 0.01–0.25 Mt). Textiles give 73% of it.
- Repair uptake is the biggest uncertainty and about half the total. We assume 5% of tracked garments get a repair because of Orbit's bonus. Real repair-bonus schemes suggest even that may be high (§5.1).
- One pilot (100,000 garments and 20,000 e-bike packs a year) would avoid about **48 t CO2e a year**, mostly from battery recycling that arrives only at end of life.
- These are projections from published factors and stated assumptions, not measurements. They count only what Orbit changes. The demo's "CO2e avoided" figure is attributional and not comparable (§8).
- Orbit's enabling effect on circular policy, probably its larger value, is not counted (§7).

## Headline

| Scenario (share of EU flow on Orbit by 2030) | Avoided in 2030 (Mt CO2e/yr) | Plausible range | Cumulative 2027–2030 (Mt CO2e) |
| --- | --- | --- | --- |
| **Conservative**: 1% of EU textiles and batteries | **0.017** | 0.002 – 0.05 | 0.04 |
| **Moderate**: 5% | **0.084** | 0.01 – 0.25 | 0.21 |
| **Ambitious**: 15% | **0.25** | 0.03 – 0.75 | 0.63 |

In plain terms: **at 5% adoption, Orbit's repair and return incentives would avoid about 0.084 Mt CO2e a year by 2030.** Garment repair is the largest lever (47%).

---

## 1. Methodology

**Approach.** We compare a world with Orbit on a share *s* of the EU product flow against business as usual, in the spirit of consequential LCA. Each lever is:

> **Avoided (Mt CO2e/yr) = adoption share *s* × size of the EU flow × behaviour change caused by Orbit × emissions saved per unit changed**

Inputs are cited (§2) or stated as assumptions (§3). The model is linear in *s*, so any cell can be checked by multiplying. The in-app calculator (`src/lib/impact.ts`) uses the same formulas and inputs.

**Conservative choices:**
1. **Low end** of published savings factors; any "up to" figure is halved.
2. Only **what Orbit's incentives and checks plausibly change** counts. Recycling that EU law requires anyway (e.g. battery collection targets) is baseline.
3. EV procurement gets a **50% additionality haircut** (§3a). §5.2 covers overlap for the other levers.
4. **Textile greenwashing deterrence** is a sensitivity only (§3b).
5. Adoption **ramps linearly** to the 2030 level (25%, 50%, 75%, 100% in 2027–2030), so cumulative = 2.5 × the 2030 value.
6. Garment reuse, battery repair and non-EU textiles are **not counted**.

**Attribution.** Brands, consumers, repairers and recyclers do the physical work; Orbit supplies the incentive and the proof. Do not add these figures to those parties' own claims.

## 2. Baseline

### 2.1 EU textiles

| Quantity | Value | Source |
| --- | --- | --- |
| EU population (1 Jan 2025) | 450.4 million | Eurostat[^pop] |
| Textile consumption per person (2022) | 19 kg (clothing, footwear, household textiles) | EEA[^eea-cons] |
| **Total EU textile consumption** | **≈ 8.6 Mt/yr** (19 kg × 450.4 M) | derived |
| GHG footprint of EU textile consumption (2022) | **159 Mt CO2e**, i.e. 355 kg CO2e per person | EEA[^eea-ghg] |
| Implied average footprint | ≈ 18.6 kg CO2e per kg of textiles (159 / 8.56) | derived |
| Textile waste (2022) | 6.94 Mt (≈ 16 kg per person); 4.6 kg separately collected vs. 11.1 kg lost to mixed waste (~29% collected) | EEA[^eea-waste] |
| Recycled fibres in global fibre production (2023) | 7.7%; **< 1% from pre- and post-consumer textiles** (most "recycled" polyester comes from PET bottles) | Textile Exchange[^te] |
| Clothing recycled into new clothing (global) | < 1% | Ellen MacArthur Foundation[^emf] |
| Separate textile collection | Mandatory in the EU since 1 Jan 2025; EPR schemes required by ~April 2028 | EEA[^eea-waste]; Directive (EU) 2025/1892[^wfd] |

### 2.2 EU batteries

| Quantity | Value | Source |
| --- | --- | --- |
| E-bike sales, EU + UK (2023) | 5.1 million units (5.5 M in 2022) | CONEBI[^conebi] |
| Typical e-bike battery | ≈ 0.6 kWh, ≈ 3 kg, mostly NMC/NCA; most used for ~10 years (range 3–14) | JRC[^jrc-afc] |
| EU share of global EV battery demand (2024) | ≈ 13% of ~950 GWh, so **≈ 120 GWh/yr** (derived) | IEA via Argus[^argus] |
| Cell carbon footprint, NMC811 | 59 / **74** / 115 kg CO2e per kWh (5th / median / 95th percentile) | Peiseler et al. 2024, *Nature Communications*[^peiseler] |
| Share of cell footprint from materials | Active materials **> 50%**, plus copper 7% and aluminium 5% (global median, NMC811) | Peiseler et al. 2024, Results / Fig. 2b[^peiseler] |
| Recycled vs. mined battery materials | **58–81% lower GHG** (industrial-scale recycler, US) | Machala et al. 2025, *Nature Communications*[^machala] |
| Collection targets | Portable: 63% (2027), 73% (2030). LMT: **51% (2028)**, 61% (2031) | Reg. (EU) 2023/1542[^battreg][^council] |
| Minimum recycled content (EV, industrial, SLI) | From Aug 2031: Co 16%, Li 6%, Ni 6%, Pb 85%; higher from 2036 | [^battreg] |
| Battery passport | Mandatory from 18 Feb 2027 for LMT, EV and industrial > 2 kWh batteries | [^battreg] |

## 3. Levers and per-unit arithmetic

### Lever 1: Higher return and recycling, displacing virgin material

**How Orbit drives it.** Orbit pays a return reward only against a signed return event, and recovery credits per kg only when a recycler signs the lot. In a real scheme the brand's EPR fee funds the reward; the buyer pays nothing extra at sale. Mass-balance proof gives recycled output a verifiable claim. That matters because, per IVL, each kg recycled must **actually displace** at least **0.44 kg** of virgin production for a net climate gain.[^ivl-2023]

**1a. Textiles: fibre-to-fibre recycling.**
- *Evidence:* IVL's consequential LCA (Sandin et al. 2025) finds that raising EU textile-to-textile recycling to **10%** by 2035, from ~1% (a global figure), cuts climate impact by **0.5%** on average, **about 0.44 Mt CO2e/yr**, with a 92% probability of a net reduction.[^ivl-2025][^ec-ivl] An earlier IVL scenario (1% → 26% by 2035) gives about **1.3%**.[^textile-etp] Both imply roughly 0.05 Mt CO2e/yr per percentage point of fibre-to-fibre recycling.
- *Assumption:* Orbit products reach the IVL 10% scenario. The rest of the market stays at ~1%.
- *Formula:* **Avoided = *s* × 0.44 Mt CO2e/yr**

**1b. E-bike batteries: extra collection and closed-loop recycling.**
- *Per pack (derived):* 0.6 kWh × 74 kg CO2e/kWh × 50% materials share × 80% material recovered × 58% saving (low end) = **≈ 10 kg CO2e avoided per extra pack recycled**.
- *Assumption:* A return reward lifts collection of tracked packs by **+20 percentage points** above the legal baseline (51% target). US deposit cans are returned at 77% vs. 36% without a deposit, about +40 points (Reloop / Container Recycling Institute; advocacy source).[^reloop] We take half, partly because a reward funded by an EPR fee is weaker than getting back a deposit the buyer paid.
- *Flow:* 5.1 M packs/yr from sales. With ~10-year lives, the real 2030 end-of-life flow is **lower**.
- *Formula:* **Avoided = *s* × 5.1 M × 0.20 × 10.3 kg = *s* × 0.0105 Mt CO2e/yr**. Small for carbon; it matters more for critical raw materials and the 2031 recycled-content targets.

### Lever 2: Product life extension through repair incentives (textiles)

**How Orbit drives it.** Owners earn a protocol-minted bonus when a repairer signs a `REPAIRED` event. The repair history stays on the passport and supports resale value.

- *Evidence:* WRAP estimates that extending the life of clothing by nine months reduces carbon, water and waste footprints by **up to 20%**.[^wrap] JRC work ranks preparing for reuse as the best environmental option for used textiles.[^jrc-textiles]
- *Assumptions:* **5%** of tracked textile items get a repair that extends life by about nine months. This is the central case; 10% is a pilot target (§5.1). For those items we credit **10%** of the production footprint, half of WRAP's "up to 20%", to allow for rebound and purchases not actually avoided.
- *Formula:* **Avoided = *s* × 159 Mt × 0.05 × 0.10 = *s* × 0.795 Mt CO2e/yr**
- *Per item:* A 0.5 kg garment carries about 9.3 kg CO2e (0.5 × 18.6). One credited repair avoids about **0.9 kg CO2e**.

### Lever 3: Greenwashing deterrence, shifting demand and procurement to verified lower-carbon products

**How Orbit drives it.** Claims are checked against the ledger and graded A–E. Footprints are recomputed from materials, energy and transport legs, so buyers can rank suppliers on checkable figures. Directive 2024/825 removes the option of hiding behind vague labels.

**3a. EV batteries (counted).**
- *Evidence:* NMC811 cell footprints span 59–115 kg CO2e/kWh (5th–95th percentile) around a median of 74;[^peiseler] the 5th percentile is 15 kg/kWh (≈ 20%) below the median.
- *Assumption:* Buyers of Orbit-verified volume procure cells **10% below** the median (7.4 kg CO2e/kWh), half the median-to-best gap. The Battery Regulation already requires verified footprint declarations, so a **50% additionality haircut** leaves 3.7 kg CO2e/kWh.
- *Formula:* **Avoided = *s* × 120 GWh × 3.7 kg/kWh = *s* × 0.444 Mt CO2e/yr**

**3b. Textiles (sensitivity only, not in headline).** Each 1% footprint cut across tracked textiles, for example from penalising undisclosed air freight, would avoid ***s* × 1.59 Mt CO2e/yr**. In the demo, a hoodie declared as sea freight is shown by the retailer's signed receipt to have flown: 13.4 kg on the ledger against a "carbon neutral" claim of 1.2 kg. We have no source for how often such gaps occur, so this is excluded.

## 4. Projection table (2030, Mt CO2e/yr)

| Lever | Formula | Conservative *s* = 1% | Moderate *s* = 5% | Ambitious *s* = 15% |
| --- | --- | --- | --- | --- |
| 1a Textiles: fibre-to-fibre recycling | *s* × 0.44 | 0.0044 | 0.022 | 0.066 |
| 1b E-bike batteries: extra collection | *s* × 0.0105 | 0.0001 | 0.0005 | 0.0016 |
| 2 Textiles: repair / life extension | *s* × 0.795 | 0.0080 | 0.0398 | 0.1193 |
| 3a EV batteries: verified low-carbon procurement | *s* × 0.444 | 0.0044 | 0.0222 | 0.0666 |
| **Total** | *s* × 1.69 | **0.017** | **0.084** | **0.25** |
| Cumulative 2027–2030 (× 2.5 ramp) | | 0.04 | 0.21 | 0.63 |
| *Sensitivity: 3b textile procurement shift, per 1% footprint cut (not in total)* | *s* × 1.59 | *+0.016* | *+0.08* | *+0.24* |
| *For scale: textile levers as a share of the EU textile footprint (159 Mt)* | | *0.008%* | *0.039%* | *0.12%* |

**Worked check, moderate column:** 0.05 × 0.44 = 0.022; 0.05 × 5.1 M × 0.2 × 10.3 kg = 525 t = 0.0005 Mt; 0.05 × 159 × 0.05 × 0.1 = 0.03975; 0.05 × 120 GWh × 3.7 kt/GWh = 22.2 kt = 0.0222. Sum = 0.0845 Mt. Repair is 47% of it; textiles (1a + 2) are 73%.

### 4.1 Bottom-up illustration: a single pilot

*An illustration of scale, not a forecast or part of the headline.* It applies the §3 factors to one apparel brand (100,000 garments a year, 0.5 kg each, 50 t) and one e-bike brand (20,000 packs a year).

| Pilot | Lever | Arithmetic | t CO2e/yr |
| --- | --- | --- | --- |
| Apparel, 100,000 garments | 2 Repair | 100,000 × 5% repaired × 0.93 kg per credited repair | 4.65 |
| | 1a Fibre-to-fibre recycling | 50 t × 0.051 kg CO2e per kg tracked (= 0.44 Mt ÷ 8.56 Mt, §2.1, §3) | 2.6 |
| E-bike, 20,000 packs | 1b Extra collection | 20,000 × 0.20 uplift × 10.3 kg per extra pack recycled | 41.2 |
| **Total** | | | **≈ 48** |

This matches the share model (50 t is *s* ≈ 0.0006% of EU textiles; *s* × 0.795 Mt ≈ 4.6 t). 48 t is the production footprint of about 5,200 garments. The battery figure arrives only at end of life, ~10 years after sale, so a 2027 pilot shows almost none of it before the late 2030s. At the 10% repair pilot target, the repair line doubles to 9.3 t.

## 5. Sensitivity and uncertainty

| Lever | Low case | High case | Why |
| --- | --- | --- | --- |
| 1a Textile recycling | 0 | × 2 | IVL gives an 8% probability of *no* climate gain (up to 38% under major parameter changes); gains are larger for high-impact fibres with high virgin displacement.[^ivl-2025] |
| 1b E-bike batteries | × 0.5 | × 2 | Footprint 59–115 kg/kWh; recycling saving 58–81%; end-of-life flow lags sales. |
| 2 Repair | × 0.25 (2.5% repaired, 5% credited) | × 4 (10% repaired, 20% credited) | Repair uptake under incentives is the largest unknown; rebound is poorly measured. |
| 3a EV procurement | 0 | × 2 (no additionality haircut) | Regulation may deliver the same shift without Orbit. |

Repair multipliers are relative to the central case (5% repaired, 10% credited): both factors are halved in the low case and doubled in the high case, which is the 10% pilot target with WRAP's full 20%.

Combining all low or all high cases gives the headline ranges: **0.01 to 0.25 Mt CO2e/yr** in the moderate scenario. Repair drives most of the spread, so a pilot should measure it first.

### 5.1 How repair responds to incentives

Lever 2 is 47% of the headline (0.795 of 1.69) and rests on an assumed 5% repair uptake. Existing repair subsidies show:

| Scheme | Design | Observed uptake |
| --- | --- | --- |
| France, *bonus réparation*, textiles and shoes (Refashion) | From 7 Nov 2023; €6–25 off per repair, ≤ 60% of the bill; €154 M for 2023–2028 from brands' EPR eco-contributions[^qc] | ≈ 826,000 repairs in year one, €6.8 M paid (≈ €8 each, derived); 83% by cobblers[^fu] |
| Austria, *Reparaturbonus*, electrical devices (later bicycles) | From 22 Apr 2022; 50% of cost, up to €200[^at-bka] | 567,076 vouchers in year one[^at-bka]; ≈ 1.7 M by May 2025, when €130 M of EU recovery funds (plus federal top-ups) ran out and it paused[^at-orf]: at least ≈ €76 per repair (derived) |
| Thuringia, Germany, electrical devices | Since 2021 | ≈ 30,000 approved, €2.3 M. Per Fraunhofer IZM, **just over a third** of users would not have repaired without the bonus[^euwid] |
| Saxony, Germany, electrical devices | 50% of cost, up to €200 | > 24,500 approved, ≈ €2.6 M by end 2024[^hwb] |
| Sweden, repair VAT (bicycles, clothes, linen, leather goods, shoes) | Cut from 25% to 12% in 2017[^sr] | No published evaluation of repair volumes found |

**So 10% looks optimistic, and even 5% is a stretch.** France buys about 3.5 bn new textile pieces a year[^lid], so its bonus reaches about 0.02% of pieces sold per year, and all clothing and shoe repairs (about 16 M items in 2019, ADEME via FashionUnited[^fu]) about 0.5% (both derived). Thuringia suggests two-thirds of subsidised repairs would have happened anyway. A tracked population can beat a national average (the brand can prompt owners, and signed history adds resale value), but we found no data showing even 5% of items repaired *because of* an incentive. We use 5% as the central case and 10% as a pilot target to test.

**Sensitivity to repair uptake only** (repair lever = *s* × 159 × uptake × 0.10; other levers unchanged):

| Repair uptake | Total | *s* = 1% | *s* = 5% | *s* = 15% |
| --- | --- | --- | --- | --- |
| 2.5% (low-case uptake) | *s* × 1.29 | 0.013 | 0.065 | 0.19 |
| 5% (headline) | *s* × 1.69 | 0.017 | 0.084 | 0.25 |
| 10% (pilot target) | *s* × 2.48 | 0.025 | 0.12 | 0.37 |
| 20% | *s* × 4.07 | 0.041 | 0.20 | 0.61 |

### 5.2 Additionality against a mandatory, non-Orbit passport

The battery passport is mandatory from 18 Feb 2027[^battreg] and a textile passport is expected around 2029[^ec-textiles], whoever supplies them. After those dates the fair counterfactual is "a compliant passport without Orbit", not "no passport".

| Lever | Delivered anyway by any compliant passport plus EPR | Specific to Orbit | Overlap in the headline |
| --- | --- | --- | --- |
| 1a Textile recycling | Fibre composition and declared recycled content for sorters; EPR eco-modulation | Mass-balance proof against counter-signed lots; reward only against a signed return | Not haircut. From ~2029 the sorting-data part overlaps: a third to half of the lever (our judgement, unsourced) |
| 1b E-bike collection | Chemistry and state-of-health data; legal collection targets (baseline) | Reward only against a signed return; recovered lots linked to the ancestor passport | Small. The law requires no reward, though an EPR scheme could pay one |
| 2 Repair | Repair information; EPR-funded repair bonuses (France) need no passport | Bonus only against a repairer-signed `REPAIRED` event for that item | **Largest.** We credit Orbit with the whole incentive effect, but Refashion-style schemes pay the same EPR money anyway. Orbit adds verification of each paid repair, which we cannot size |
| 3a EV procurement | Mandatory carbon-footprint declaration and performance classes[^battreg] | Footprints recomputed from counter-signed supplier data | Already haircut by 50% |

As a rough guide, the same 50% haircut on levers 1a and 2 would cut the moderate 2030 figure from 0.084 to about **0.054 Mt CO2e/yr**. For textiles the overlap mainly affects 2029–2030, except that France's repair bonus already exists.

## 6. Orbit's own footprint

Orbit signs events off-chain (Ed25519, microseconds of CPU per signature) and anchors **one 32-byte Merkle root per checkpoint**, not one transaction per product.

| Quantity | Value | Source / derivation |
| --- | --- | --- |
| Ethereum PoS network electricity | ≈ 2,601 MWh/yr and ≈ 870 t CO2e/yr (CCRI). The Cambridge CCAF estimates ≈ 7.87 GWh/yr, about 3× higher | ethereum.org (CCRI)[^eth]; CCAF via Forklog[^ccaf] |
| Ethereum transactions | ≈ 1.5–2.0 M per day (7-day average hit 1.74 M in Aug 2025), so ≈ 550–730 M per year | The Block[^block] |
| Network energy averaged per transaction | ≈ 3.6–4.7 Wh (CCRI) or ≈ 11–14 Wh (CCAF); ≈ 1.2–1.6 g CO2e (CCRI basis) | derived. An **upper bound**: an extra transaction adds almost nothing to PoS energy use, and CCAF discards per-transaction metrics[^ccaf] |
| **Orbit anchoring hourly on L1 for a year** | 8,760 transactions ≈ **31–125 kWh** and ≈ **10–14 kg CO2e** (≈ 31–42 kg on the CCAF basis) | derived |

On an L2 rollup it is lower still. A year of hourly anchoring emits about the production footprint of **a few garments** (≈ 9 kg CO2e each) and is **more than 100,000× smaller** than the conservative scenario's avoided emissions (≤ 42 kg vs. 17,000 t). Web hosting and storage are ordinary and not measured.

## 7. What the projections leave out (upside not credited)

- **Enabling policy.** Textile EPR schemes (required by ~2028) are expected to **eco-modulate** producer fees on environmental performance.[^wfd] ESPR will add recycled-content and durability requirements. Both need trustworthy per-product data, which Orbit provides. JRC modelling finds that EU textile waste-management interventions could cut up to **22.3 Mt CO2e/yr by 2035** (18% of the sector's impact).[^jrc-wm] Orbit is infrastructure for that, but we claim none of it.
- **Reuse** of garments returned for a reward, which JRC ranks above recycling.[^jrc-textiles]
- **Battery repair and second life.** In the demo, a battery is repaired before it is recycled.
- **EV batteries reaching end of life after 2030**, when recycled-content minimums start to bind (2031).

## 8. Illustrations from the Orbit demo

These come from the seeded demo world, which uses **illustrative** emission factors (`src/lib/factors.ts`). They show the mechanics, not certified accounting.

| Demo passport | What it shows | Literature comparison |
| --- | --- | --- |
| Orbit Tee: 40% recycled content, proven by mass balance | Recycled share comes from signed lots, not from a declaration | Global textile-to-textile recycled supply is < 1%[^te] |
| Strata Loop battery: 93% recycled content, ≈ 65% lower footprint, ≈ 28 kg CO2e avoided per pack | Closed loop, with recovered lots linked to the ancestor passport | Recycled materials save 58–81%[^machala] |
| EcoCloud Hoodie: claims "carbon neutral, 1.2 kg"; ledger shows 13.4 kg, including spinning and dyeing and the air freight | Transport legs recomputed from registered locations | Directive 2024/825 bans offset-based neutrality claims[^empco] |

**The demo's "CO2e avoided" figure is attributional, not consequential.** The dashboard's "28.8 kg CO2e avoided by recycled inputs" (passport field `avoidedEmissionsKgCO2e`) compares each product's recycled inputs with the same mass of virgin material. It describes these products; it is **not an effect caused by Orbit**. Much of it would happen anyway: recycled polyester comes mostly from PET bottles (§2.1), and buying recycled input can just move a fixed supply between brands. The §3 levers count only behaviour Orbit changes, so do not add or compare the two. For the Strata Loop pack, ≈ 28 kg is attributional. The consequential figure is ≈ 9 kg (§3's per-pack arithmetic for its 0.5 kWh), and only for packs that would otherwise not have been collected.

## 9. Limitations

- **Data quality (the oracle problem).** Orbit verifies consistency between signed records, not physical truth. Supplier counter-signatures on lots, auditor attestations and distances derived from registered locations reduce the risk. Self-reported fields (e.g. factory energy) are labelled on the passport.
- **Behavioural parameters are assumptions.** Repair uptake, the collection uplift and the procurement shift are not yet measured. They should be the first metrics of any pilot.
- **Footprint scope.** The EEA's 159 Mt is consumption-based and includes footwear and household textiles. IVL's percentages use a narrower baseline (≈ 88 Mt implied). We use each source's own baseline within a lever.
- **Source scope and timing.** CONEBI sales cover EU + UK and lead the end-of-life flow by ~10 years, so lever 1b is overstated for 2030. The textile passport is unlikely to be mandatory before ~2029,[^ec-textiles] so the ramp relies on voluntary textile adoption.
- **Linearity.** Large adoption could saturate recycling capacity or shift prices, so the 15% scenario is less reliable than the 1% one.

## 10. How we would measure real impact

Every lever is computed from signed ledger events, so a deployment can report actual counts instead of modelled ones: `RETURNED` and `RECYCLED` events (kg recovered, by material), `REPAIRED` events per product, and verified vs. contradicted claims per brand. With the savings factors above, these give an auditable avoided-emissions figure per year, anchored on-chain with the same Merkle roots.

---

## Sources

[^pop]: Eurostat, EU population on 1 January 2025: 450.4 million, as reported by The Portugal News, 11 July 2025. https://www.theportugalnews.com/news/2025-07-11/eu-population-rises-to-450-million/99317. See also Eurostat, *Demography of Europe 2026*: https://ec.europa.eu/eurostat/web/interactive-publications/demography-2026
[^eea-cons]: EEA, *Consumption of clothing, footwear and household textiles per person*. https://www.eea.europa.eu/en/circularity/sectoral-modules/textiles/consumption-of-clothing-footwear-and-household-textiles-per-person
[^eea-ghg]: EEA, *Greenhouse gas emissions from EU's textiles consumption* (159 Mt CO2e; 355 kg per person, 2022). https://www.eea.europa.eu/en/circularity/sectoral-modules/textiles/greenhouse-gas-emissions-from-eus-textiles-consumption
[^eea-waste]: EEA, *Textile waste generation per person in the EU per year*. https://www.eea.europa.eu/en/circularity/sectoral-modules/textiles/textile-waste-generation-per-person-in-the-eu-per-year. See also EEA, *Circularity of the EU textiles value chain in numbers*: https://www.eea.europa.eu/en/analysis/publications/circularity-of-the-eu-textiles-value-chain-in-numbers/
[^te]: Textile Exchange, *Materials Market Report 2024*. https://textileexchange.org/knowledge-center/reports/materials-market-report-2024/
[^emf]: Ellen MacArthur Foundation, *A New Textiles Economy* (2017). https://www.ellenmacarthurfoundation.org/a-new-textiles-economy
[^wfd]: Revised Waste Framework Directive (Directive (EU) 2025/1892): textile EPR within 30 months of entry into force. Summary: https://www.bdlaw.com/publications/eu-targets-textile-waste-with-waste-framework-directive-amendments/ and https://transition-pathways.europa.eu/retail/legislation/revision-waste-framework-directive
[^conebi]: CONEBI, *European Bicycle Industry and Market Profile 2024* (2023 data). https://www.conebi.eu/?p=7252
[^jrc-afc]: Huisman, J. & Bobba, S. (2021), *'Available For Collection' study on alternative collection targets for waste portable and LMT batteries*, JRC125615, §3.1 "E-bikes batteries". https://publications.jrc.ec.europa.eu/repository/bitstream/JRC125615/jrc125615_afc_study_waste_lmt_and_portable_batteries_(final_online_version).pdf
[^argus]: Argus Media, *Global battery demand rises close to 1TWh in 2024: IEA* (EU 13% share; EV batteries > 950 GWh). https://www.argusmedia.com/en/news-and-insights/latest-market-news/2688652-global-battery-demand-rises-close-to-1twh-in-2024-iea. Underlying: IEA, *Global EV Outlook 2025*, https://www.iea.org/reports/global-ev-outlook-2025/electric-vehicle-batteries
[^peiseler]: Peiseler, L. et al. (2024), *Carbon footprint distributions of lithium-ion batteries and their materials*, Nature Communications 15. https://doi.org/10.1038/s41467-024-54634-y (open access: https://pmc.ncbi.nlm.nih.gov/articles/PMC11603021/). Figures checked against the full text: active materials > 50% of the cell footprint, copper 7%, aluminium 5%, cell-production electricity ≈ 15%.
[^machala]: Machala, M. L. et al. (2025), *Life cycle comparison of industrial-scale lithium-ion battery recycling and mining supply chains*, Nature Communications. Summary: https://news.stanford.edu/stories/2025/01/recycling-lithium-ion-batteries-cuts-emissions-and-strengthens-supply-chain
[^battreg]: Regulation (EU) 2023/1542 on batteries and waste batteries. https://eur-lex.europa.eu/eli/reg/2023/1542/oj
[^council]: Council of the EU press release, 10 July 2023. https://www.consilium.europa.eu/en/press/press-releases/2023/07/10/council-adopts-new-regulation-on-batteries-and-waste-batteries/
[^ivl-2023]: IVL Swedish Environmental Research Institute, *Does large-scale textile recycling in Europe reduce climate impact? A consequential LCA* (2023), reporting the 0.44 kg replacement threshold (threshold as reported in IVL's press summary). https://www.researchgate.net/publication/376086210_Does_large-scale_textile_recycling_in_Europe_reduce_climate_impact_A_consequential_life_cycle_assessment
[^ivl-2025]: Sandin, G., Lidfeldt, M. & Nellström, M. (2025), *Exploring the Environmental Impact of Textile Recycling in Europe: A Consequential Life Cycle Assessment*, Sustainability 17(5), 1931. https://doi.org/10.3390/su17051931
[^ec-ivl]: European Commission, Science for Environment Policy, 18 June 2025 (440,000 t CO2e/yr; 92% probability). https://environment.ec.europa.eu/news/study-highlights-positive-environmental-impacts-increasing-textile-textile-recycling-rates-eu-2025-06-18_en
[^textile-etp]: Textile ETP, *Does large-scale textile recycling reduce climate impact?* (1% → 26% by 2035 gives ≈ 1.3% reduction). https://www.textile-platform.eu/news/does-large-scale-textile-recycling-reduce-climate-impact
[^jrc-textiles]: Huygens, D. et al. (2023), *Techno-scientific assessment of the management options for used and waste textiles in the EU*, JRC134586. https://publications.jrc.ec.europa.eu/repository/handle/JRC134586
[^jrc-wm]: Solis, M. et al. (2024), *Contribution of waste management to a sustainable textile sector*, Waste Management, JRC138459. https://publications.jrc.ec.europa.eu/repository/handle/JRC138459
[^wrap]: WRAP, *Extending Product Lifetimes: WRAP's Work on Clothing Durability*. https://www.wrap.ngo/es/node/47400
[^reloop]: Reloop, *Deposit return systems: how they perform* fact sheet, Dec 2022, p. 4 (citing Container Recycling Institute 2019 US data; European deposit systems average 90% return). https://www.reloopplatform.org/wp-content/uploads/2022/12/RELOOP_Factsheet_Performance_12I2022.pdf. Advocacy organisation.
[^eth]: ethereum.org, *Ethereum's energy expenditure* (CCRI estimate). https://ethereum.org/energy-consumption/
[^ccaf]: Forklog, *Cambridge Centre for Alternative Finance estimates Ethereum energy use after the Merge*. https://forklog.com/en/cambridge-centre-for-alternative-finance-estimates-ethereum-energy-use-after-the-merge/
[^block]: The Block, *Ethereum daily transactions reach new high* (Aug 2025). https://www.theblock.co/post/365926/daily-transactions-ethereum-all-time-high
[^ec-textiles]: European Commission, *Textiles and apparel* (ESPR textiles delegated act planned Q4 2027). https://single-market-economy.ec.europa.eu/textile-apparel_en
[^empco]: Directive (EU) 2024/825. https://eur-lex.europa.eu/eli/dir/2024/825/oj
[^qc]: UFC-Que Choisir, *Un bonus réparation pour le textile et les chaussures*, 11 Nov 2023 (launch 7 Nov 2023; €154 M for 2023–2028; €6–25 per repair; ≤ 60% of the bill; bill ≥ €12). https://www.quechoisir.org/actualite-reparabilite-un-bonus-reparation-pour-le-textile-et-les-chaussures-n113194
[^fu]: FashionUnited, *Bonus Réparation : quel bilan après un an ?*, Dec 2024 (826,000 repairs; €6.8 M; 83% cobblers; > 1,530 repairers; ADEME: ~16 M clothing and shoe items repaired in 2019). https://fashionunited.fr/actualite/mode/bonus-reparation-quel-bilan-apres-un-an/2024120536644 (reporting Refashion's figures; we could not open Refashion's own release)
[^lid]: L'Info Durable / AFP, *France : record d'achats de textiles neufs en 2024 selon l'organisme Refashion*, 17 June 2025 (3.5 bn pieces). https://www.linfodurable.fr/conso/france-record-dachats-de-textiles-neufs-en-2024-selon-lorganisme-refashion-51456
[^at-bka]: Austrian Federal Chancellery, *"Reparaturbonus" feiert ersten Geburtstag*, 28 Apr 2023 (567,076 vouchers to 17 Apr 2023; 50% up to €200). https://www.bundeskanzleramt.gv.at/eu-aufbauplan/aktuelles/reparaturbonus-feiert-ersten-geburtstag.html
[^at-orf]: ORF, *Mittel ausgeschöpft: Reparaturbonus wird ausgesetzt*, 26 May 2025 (≈ 1.7 M vouchers; €130 M RRF funds plus federal funds). https://orf.at/stories/3394954/
[^euwid]: EUWID Recycling, *Thüringen: Über Bonusprogramm Gerätereparaturen bereits mit 2,3 Mio € gefördert*, 7 May 2024 (citing Fraunhofer IZM). https://www.euwid-recycling.de/news/politik/thueringen-ueber-bonusprogramm-geraetereparaturen-bereits-mit-23-mio-eur-gefoerdert-070524/
[^hwb]: Handwerksblatt, *Reparaturbonus in Sachsen ist zurück*, 2 Oct 2025. https://www.handwerksblatt.de/themen-specials/reparieren-statt-wegwerfen/reparaturbonus-in-sachsen-ist-zurueck
[^sr]: Sveriges Radio, *Tax break for repairs comes into effect – but some prices unaffected* (2017). https://www.sverigesradio.se/artikel/6600336. We could not open the page directly; details are from search excerpts.
