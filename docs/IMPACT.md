# Climate impact assessment and carbon reduction projections

**Project:** Orbit, verifiable digital product passports with circular incentives
**Scope:** EU textiles (clothing, footwear, household textiles) and EU batteries (e-bike / LMT and EV), 2027–2030

## Headline

| Scenario (share of EU flow on Orbit by 2030) | Avoided in 2030 (Mt CO2e/yr) | Plausible range | Cumulative 2027–2030 (Mt CO2e) |
| --- | --- | --- | --- |
| **Conservative**: 1% of EU textiles and batteries | **0.025** | 0.004 – 0.08 | 0.06 |
| **Moderate**: 5% | **0.12** | 0.02 – 0.41 | 0.31 |
| **Ambitious**: 15% | **0.37** | 0.06 – 1.2 | 0.93 |

In plain terms: **if 5% of the textiles sold in the EU (about 0.43 Mt of the ~8.6 Mt sold each year) and 5% of EU batteries carried an Orbit passport with its repair and return incentives, we project about 0.12 Mt CO2e avoided per year by 2030.** About 80% of that comes from textiles, mostly from longer product life.

These numbers are deliberately modest. Published studies find that textile recycling alone saves little carbon. Most of Orbit's value comes from **making the data that circular policies depend on checkable**. That enabling effect is real, but we do not credit it to Orbit in the totals (see §7).

---

## 1. Methodology

**Approach.** We estimate avoided emissions as the difference between a world with Orbit on a share *s* of the EU product flow and a business-as-usual counterfactual, in the spirit of consequential LCA. Each lever is computed as:

> **Avoided (Mt CO2e/yr) = adoption share *s* × size of the EU flow × behaviour change caused by Orbit × emissions saved per unit changed**

Every input is either cited (§2) or stated as an assumption (§3). The model is linear in *s*, so a judge can check any cell by multiplying.

**Conservative choices:**
1. We use the **low end** of published savings factors. Where a source says "up to", we halve the figure.
2. We count only **what Orbit's incentives and checks plausibly change**. Recycling that EU law requires anyway (e.g. battery collection targets) is part of the baseline.
3. Where regulation already requires similar checks (EV battery carbon footprint declarations), we apply a **50% additionality haircut**. The other levers are not haircut; §5.2 sets out how much of them a mandatory, non-Orbit passport might deliver anyway.
4. The **greenwashing-deterrence effect on textiles** is shown only as a sensitivity and is **excluded from the headline**, because no source lets us size it robustly.
5. Adoption **ramps linearly** to the 2030 level: 25% of it in 2027, 50% in 2028, 75% in 2029 and 100% in 2030. Cumulative = 2.5 × the 2030 value.
6. Reuse of returned garments, repair of batteries, and textiles outside the EU are **not counted**, although they are likely positive.

**Attribution.** Avoided emissions are enabled jointly by brands, consumers, repairers and recyclers. Orbit supplies the incentive and the proof, not the physical work. These figures should not be added to the same parties' own claims (to avoid double counting).

## 2. Baseline

### 2.1 EU textiles

| Quantity | Value | Source |
| --- | --- | --- |
| EU population (1 Jan 2025) | 450.4 million | Eurostat[^pop] |
| Textile consumption per person (2022) | 19 kg (clothing, footwear, household textiles) | EEA[^eea-cons] |
| **Total EU textile consumption** | **≈ 8.6 Mt/yr** (derived: 19 kg × 450.4 M) | derived |
| GHG footprint of EU textile consumption (2022) | **159 Mt CO2e**, i.e. 355 kg CO2e per person | EEA[^eea-ghg] |
| Implied average footprint | ≈ 18.6 kg CO2e per kg of textiles (derived: 159 / 8.56) | derived |
| Textile waste generated (2022) | 6.94 Mt (≈ 16 kg per person) | EEA[^eea-waste] |
| Separately collected vs. lost to mixed waste | 4.6 kg vs. 11.1 kg per person, so ~29% separately collected | EEA[^eea-waste] |
| Recycled fibres in global fibre production (2023) | 7.7%; **< 1% from pre- and post-consumer textiles** (most "recycled" polyester comes from PET bottles) | Textile Exchange[^te] |
| Clothing recycled into new clothing (global) | < 1% | Ellen MacArthur Foundation[^emf] |
| Separate textile collection | Mandatory in the EU since 1 Jan 2025; producer responsibility (EPR) schemes required by ~April 2028 | EEA[^eea-waste]; Directive (EU) 2025/1892[^wfd] |

### 2.2 EU batteries

| Quantity | Value | Source |
| --- | --- | --- |
| E-bike sales, EU + UK (2023) | 5.1 million units (5.5 M in 2022) | CONEBI[^conebi] |
| Typical e-bike battery | ≈ 0.6 kWh, ≈ 3 kg, mostly NMC/NCA; most used for ~10 years (range 3–14) | JRC[^jrc-afc] |
| EU share of global EV battery demand (2024) | ≈ 13% of ~950 GWh, so **≈ 120 GWh/yr** (derived) | IEA via Argus[^argus] |
| Cell carbon footprint, NMC811 | 59 / **74** / 115 kg CO2e per kWh (5th / median / 95th percentile); LFP 54 / 62 / 69 | Peiseler et al. 2024, *Nature Communications*[^peiseler] |
| Share of cell footprint from materials | Active materials **> 50%**, plus copper 7% and aluminium 5%; cell-production electricity ≈ 15% (global median, NMC811) | Peiseler et al. 2024, Results / Fig. 2b[^peiseler] |
| Recycled vs. mined battery materials | **58–81% lower GHG** (industrial-scale recycler, US) | Machala et al. 2025, *Nature Communications*[^machala] |
| Collection targets | Portable: 63% (2027), 73% (2030). LMT: **51% (2028)**, 61% (2031) | Reg. (EU) 2023/1542[^battreg][^council] |
| Material recovery targets | Lithium 50% (2027) → 80% (2031); cobalt, nickel, copper 90% → 95% | [^council] |
| Minimum recycled content (EV, industrial, SLI) | From Aug 2031: Co 16%, Li 6%, Ni 6%, Pb 85%; from Aug 2036: Co 26%, Li 12%, Ni 15% | [^battreg] |
| Battery passport | Mandatory from 18 Feb 2027 for LMT, EV and industrial > 2 kWh batteries | [^battreg] |

## 3. Levers and per-unit arithmetic

### Lever 1: Higher return and recycling, displacing virgin material

**How Orbit drives it.** Orbit's protocol pays a return reward (funded by the brand's EPR fee in a real scheme; no deposit is charged at sale) only when a signed return event exists, and pays recovery credits per kg only when a recycler signs the lot. Recycled content is proven by mass balance, so recycled fibre and cells earn a verifiable claim, which gives recyclers a market for their output. IVL's LCA identifies the share of recycled fibre that **actually replaces virgin fibre** as decisive: each kg recycled must displace at least **0.44 kg** of new production for a net climate gain.[^ivl-2023] Mass-balance verification is how a buyer can confirm that displacement.

**1a. Textiles: fibre-to-fibre recycling.**
- *Evidence:* IVL's consequential LCA (Sandin et al. 2025) finds that raising EU textile-to-textile recycling from ~1% to **10%** reduces climate impact by an average **0.5%, about 0.44 Mt CO2e/yr**, with a 92% probability of a net reduction.[^ivl-2025][^ec-ivl] An earlier IVL scenario (1% → 26% by 2035) gives about **1.3%**.[^textile-etp] Both give roughly 0.05 Mt CO2e/yr per percentage point of EU textiles recycled fibre-to-fibre.
- *Assumption:* Products on Orbit reach the IVL 10% scenario (rewarded returns plus verified recycled-content demand), while the rest of the market stays at ~1%.
- *Formula:* **Avoided = *s* × 0.44 Mt CO2e/yr**

**1b. E-bike batteries: extra collection and closed-loop recycling.**
- *Per pack (derived):* 0.6 kWh × 74 kg CO2e/kWh × 50% materials share × 80% material recovered × 58% saving (low end) = **≈ 10 kg CO2e avoided per extra pack recycled**.
- *Assumption:* A return reward raises collection of Orbit-tracked packs by **+20 percentage points** above the legal baseline (51% target). For comparison, US data show deposit beverage cans returned at 77% vs. 36% without a deposit, about +40 points (Reloop / Container Recycling Institute; advocacy source).[^reloop] We assume half of that uplift, partly because a reward funded by an EPR fee is a weaker incentive than getting back a deposit the buyer paid.
- *Flow:* 5.1 M packs/yr. We use the sales figure as a proxy for the end-of-life flow; with ~10-year lives, the actual 2030 flow will be **lower**.
- *Formula:* **Avoided = *s* × 5.1 M × 0.20 × 10.3 kg = *s* × 0.0105 Mt CO2e/yr**
- E-bike batteries are small in tonnage. The lever matters more for critical-raw-material supply and the 2031 recycled-content targets than for carbon.

### Lever 2: Product life extension through repair incentives (textiles)

**How Orbit drives it.** Owners earn a protocol-minted bonus when a repairer signs a `REPAIRED` event, which rewards repairing over replacing. The repair history also stays on the passport, which supports resale value.

- *Evidence:* WRAP estimates that extending the life of clothing by nine months reduces carbon, water and waste footprints by **up to 20%**.[^wrap] JRC work ranks preparing for reuse as the best environmental option for used textiles.[^jrc-textiles]
- *Assumptions:* **10%** of Orbit-tracked textile items receive a repair that extends life by about nine months. For those items we credit **10%** of their production footprint, half of WRAP's "up to 20%", to allow for rebound and for purchases that are not actually avoided.
- *Formula:* **Avoided = *s* × 159 Mt × 0.10 × 0.10 = *s* × 1.59 Mt CO2e/yr**
- *Per item:* A 0.5 kg garment carries about 9.3 kg CO2e (0.5 × 18.6). One credited repair avoids about **0.9 kg CO2e**.

### Lever 3: Greenwashing deterrence, shifting demand and procurement to verified lower-carbon products

**How Orbit drives it.** Claims are checked against the ledger and graded A–E. Footprints are recomputed from materials, energy and transport legs, so a buyer can rank suppliers on figures that can be checked. Directive 2024/825 removes the option of hiding behind vague labels.

**3a. EV batteries (counted).**
- *Evidence:* Across NMC811 cells, footprints range from 59 to 115 kg CO2e/kWh around a median of 74 (5th–95th percentile).[^peiseler] The gap between the median and the 5th percentile is 15 kg/kWh (≈ 20%).
- *Assumption:* Buyers of Orbit-verified volume procure cells averaging **10% below** the median (7.4 kg CO2e/kWh lower), which is half the median-to-best gap. The Battery Regulation already requires verified footprint declarations, so we apply a **50% additionality haircut**, leaving 3.7 kg CO2e/kWh.
- *Formula:* **Avoided = *s* × 120 GWh × 3.7 kg/kWh = *s* × 0.444 Mt CO2e/yr**

**3b. Textiles (sensitivity only, not in headline).** Each 1% average footprint reduction across Orbit-tracked textiles, for example from penalising undisclosed air freight, would avoid ***s* × 1.59 Mt CO2e/yr**. In the demo, the hoodie was declared as sea freight, but the retailer's signed receipt 24 h later proves it flew. Its ledger footprint (6.0 kg) is five times its claimed "carbon neutral" 1.2 kg. Orbit catches gaps like this, but we have no source for how often they occur across the market.

## 4. Projection table (2030, Mt CO2e/yr)

| Lever | Formula | Conservative *s* = 1% | Moderate *s* = 5% | Ambitious *s* = 15% |
| --- | --- | --- | --- | --- |
| 1a Textiles: fibre-to-fibre recycling | *s* × 0.44 | 0.0044 | 0.022 | 0.066 |
| 1b E-bike batteries: extra collection | *s* × 0.0105 | 0.0001 | 0.0005 | 0.0016 |
| 2 Textiles: repair / life extension | *s* × 1.59 | 0.0159 | 0.0795 | 0.2385 |
| 3a EV batteries: verified low-carbon procurement | *s* × 0.444 | 0.0044 | 0.0222 | 0.0666 |
| **Total** | *s* × 2.49 | **0.025** | **0.12** | **0.37** |
| Cumulative 2027–2030 (× 2.5 ramp) | | 0.06 | 0.31 | 0.93 |
| *Sensitivity: 3b textile procurement shift, per 1% footprint cut (not in total)* | *s* × 1.59 | *+0.016* | *+0.08* | *+0.24* |
| *For scale: textiles share of the EU textile footprint (159 Mt)* | | *0.013%* | *0.064%* | *0.19%* |

**Worked check, moderate column:** 0.05 × 0.44 = 0.022; 0.05 × 5.1 M × 0.2 × 10.3 kg = 525 t = 0.0005 Mt; 0.05 × 159 × 0.1 × 0.1 = 0.0795; 0.05 × 120 GWh × 3.7 kt/GWh = 22.2 kt = 0.0222. Sum = 0.124 Mt.

### 4.1 Bottom-up illustration: a single pilot

*An illustration of scale for one pilot, not a forecast, and not part of the headline.* It uses the same per-unit factors as §3. Suppose one mid-size apparel brand puts 100,000 garments a year on Orbit (0.5 kg each, so 50 t of textiles), and one e-bike brand puts 20,000 packs a year on it.

| Pilot | Lever | Arithmetic | t CO2e/yr |
| --- | --- | --- | --- |
| Apparel, 100,000 garments | 2 Repair | 100,000 × 10% repaired × 0.93 kg per credited repair | 9.3 |
| | 1a Fibre-to-fibre recycling | 50 t × 0.051 kg CO2e per kg tracked (= 0.44 Mt ÷ 8.56 Mt, §3) | 2.6 |
| E-bike, 20,000 packs | 1b Extra collection | 20,000 × 0.20 uplift × 10.3 kg per extra pack recycled | 41.2 |
| **Total** | | | **≈ 53** |

This matches the share model: 50 t is *s* ≈ 0.0006% of EU textiles, and *s* × 1.59 Mt ≈ 9.3 t. For scale, 53 t is about the production footprint of 5,700 garments (at 9.3 kg each). Two caveats. The battery figure only appears once the packs reach end of life, about 10 years after sale (§2.2), so a pilot starting in 2027 shows almost none of it before the late 2030s. The repair figure assumes 10% uptake, which §5.1 suggests is optimistic.

## 5. Sensitivity and uncertainty

| Lever | Low case | High case | Why |
| --- | --- | --- | --- |
| 1a Textile recycling | 0 | × 2 | IVL gives an 8% probability of *no* climate gain (up to 38% under major parameter changes). Gains are larger if recycling targets high-impact fibres with high virgin displacement.[^ivl-2025] |
| 1b E-bike batteries | × 0.5 | × 2 | Footprint 59–115 kg/kWh; recycling saving 58–81%; end-of-life flow lags sales. |
| 2 Repair | × 0.25 (5% repaired, 5% credited) | × 4 (20% repaired, 20% credited) | Repair uptake under incentives is the largest unknown. Rebound effects are poorly measured. |
| 3a EV procurement | 0 | × 2 (no additionality haircut) | Regulation may deliver the same shift without Orbit. |

This gives the ranges in the headline. The moderate scenario runs from **0.02 to 0.41 Mt CO2e/yr**. Lever 2 dominates both the central value and the uncertainty, so a pilot should measure repair uptake first.

### 5.1 How repair responds to incentives

Lever 2 is about 64% of the headline (1.59 of 2.49) and rests on an assumed 10% repair uptake. The evidence from existing repair subsidies:

| Scheme | Design | Observed uptake |
| --- | --- | --- |
| France, *bonus réparation* for textiles and shoes (run by Refashion) | From 7 Nov 2023. €6–25 off per repair, capped at 60% of the bill, minimum bill €12. Fund of €154 M for 2023–2028, paid from brands' EPR eco-contributions[^qc] | ≈ 826,000 repairs in the first year, €6.8 M paid (≈ €8 per repair, derived). 83% were shoe repairs. About 1,530 labelled repairers[^fu] |
| Austria, *Reparaturbonus* (electrical and electronic devices, later bicycles) | From 22 Apr 2022. 50% of the cost, up to €200[^at-bka] | 567,076 vouchers in year one[^at-bka]. ≈ 1.7 M by May 2025, when the €130 M of EU recovery funds (plus federal top-ups) ran out and the scheme was paused for evaluation[^at-orf]. That is at least ≈ €76 of subsidy per repair (derived) |
| Thuringia, Germany (electrical devices) | Since 2021 | ≈ 30,000 approved applications, €2.3 M (≈ €77 each, derived). In a Fraunhofer IZM evaluation, **just over a third** of users said they would not have repaired without the bonus[^euwid] |
| Saxony, Germany (electrical devices) | 50% of cost, up to €200 | > 24,500 approved applications and ≈ €2.6 M by end 2024[^hwb] |
| Sweden, VAT on repairs of bicycles, clothes, household linen, leather goods and shoes | Cut from 25% to 12% in 2017[^sr] | We found no published evaluation of the effect on repair volumes |

**What this means for the 10% assumption.** It looks **optimistic, not conservative**. France buys about 3.5 bn new textile pieces a year (2024)[^lid], so the bonus reaches about 0.02% of pieces sold per year (derived). All clothing and shoe repairs in France, subsidised or not, came to about 16 M items in 2019 (ADEME, via FashionUnited)[^fu], or ≈ 0.5% of pieces sold. The Thuringia survey suggests about two-thirds of subsidised repairs would have happened anyway, which our model would not count. A tracked population can do better than a national average: the brand can prompt the owner, and the signed repair history adds resale value. But we found no data showing 10% of items repaired *because of* an incentive. We keep 10% because the in-app calculator and its test pin it. It should be read as a pilot target to measure, with 5% as the more defensible central case.

**Sensitivity to repair uptake only** (repair lever = *s* × 159 × uptake × 0.10; other levers unchanged):

| Repair uptake | Total | *s* = 1% | *s* = 5% | *s* = 15% |
| --- | --- | --- | --- | --- |
| 5% | *s* × 1.69 | 0.017 | 0.084 | 0.25 |
| 10% (headline) | *s* × 2.49 | 0.025 | 0.12 | 0.37 |
| 20% | *s* × 4.07 | 0.041 | 0.20 | 0.61 |

### 5.2 Additionality against a mandatory, non-Orbit passport

From 18 Feb 2027 every LMT, EV and large industrial battery needs a passport[^battreg]. A textile passport is expected around 2029[^ec-textiles]. Both apply whoever supplies them. After those dates the fair counterfactual is "a compliant passport without Orbit", not "no passport".

| Lever | Any compliant passport (plus EPR) delivers anyway | Specific to Orbit | Overlap in the headline |
| --- | --- | --- | --- |
| 1a Textile recycling | Fibre composition and declared recycled content for sorters; EPR fees and eco-modulation | Recycled content proven by mass balance against counter-signed lots; return reward paid only against a signed return event | No haircut applied. From ~2029 the sorting-data part overlaps; we guess a third to half of the lever (our judgement, no source) |
| 1b E-bike collection | Chemistry and state-of-health data; legal collection targets (already in the baseline) | Return reward paid only against a signed return; recovered lots linked to the ancestor passport | Small: the regulation requires no reward. An EPR scheme could still pay one without Orbit |
| 2 Repair | Repair information on the passport. National EPR funds (France) already pay repair bonuses without any passport | Bonus paid only against a repairer-signed `REPAIRED` event for that item; history kept for resale | **Largest.** The headline credits Orbit with the whole effect of a repair incentive, but the money is an EPR fee that a scheme like Refashion's can pay anyway. Orbit's own part is verifying each paid repair and tying it to the item. We cannot size that |
| 3a EV procurement | Mandatory carbon-footprint declaration and later performance classes[^battreg] | Footprints recomputed from counter-signed supplier data; claims checked against counter-party data | Already haircut by 50% |

As a rough guide, if levers 1a and 2 took the same 50% haircut as 3a, the moderate 2030 figure would fall from 0.12 to about **0.07 Mt CO2e/yr**. Before the textile passport arrives, Orbit on textiles is voluntary, so the overlap matters mainly for 2029–2030. France's repair bonus is the exception: it already exists.

## 6. Orbit's own footprint

Orbit signs events off-chain (Ed25519, microseconds of CPU per signature) and anchors **one 32-byte Merkle root per checkpoint**, not one transaction per product.

| Quantity | Value | Source / derivation |
| --- | --- | --- |
| Ethereum PoS network electricity | ≈ 2,601 MWh/yr and ≈ 870 t CO2e/yr (CCRI). The Cambridge CCAF estimates ≈ 7.87 GWh/yr, about 3× higher | ethereum.org (CCRI)[^eth]; CCAF via Forklog[^ccaf] |
| Ethereum transactions | ≈ 1.5–2.0 M per day (7-day average hit 1.74 M in Aug 2025), so ≈ 550–730 M per year | The Block[^block] |
| Network energy averaged per transaction | ≈ 3.6–4.7 Wh (CCRI) or ≈ 11–14 Wh (CCAF); ≈ 1.2–1.6 g CO2e (CCRI basis) | derived. This is an **upper bound**: one extra transaction adds almost nothing to a PoS network's energy use, and CCAF itself discards per-transaction metrics[^ccaf] |
| **Orbit anchoring hourly on L1 for a year** | 8,760 transactions ≈ **31–125 kWh** and ≈ **10–14 kg CO2e** (≈ 30–40 kg on the CCAF basis) | derived |
| On an L2 rollup | Lower still: the root shares one L1 batch with thousands of other transactions | qualitative |

For scale, a full year of hourly anchoring emits about as much as the production footprint of **a few garments** (≈ 9 kg CO2e for a 0.5 kg garment at 18.6 kg CO2e/kg, §2.1). It is **more than 100,000× smaller** than the conservative scenario's avoided emissions (40 kg vs. 25,000 t). The rest of the platform's footprint is ordinary web hosting and storage, like any small web application. We have not measured it.

## 7. What the projections leave out (upside not credited)

- **Enabling policy.** Textile EPR schemes (required by ~2028) are expected to **eco-modulate** producer fees on environmental performance.[^wfd] ESPR will add recycled-content and durability requirements. These schemes need trustworthy per-product data, which Orbit provides. JRC modelling finds that EU textile waste-management interventions could cut up to **22.3 Mt CO2e/yr by 2035** (18% of the sector's impact).[^jrc-wm] Orbit is infrastructure for that, but we claim none of it.
- **Reuse** of garments returned for a reward, which JRC ranks above recycling.[^jrc-textiles]
- **Battery repair and second life.** In the demo, a battery is repaired before it is recycled.
- **EV batteries reaching end of life after 2030**, when recycled-content minimums start to bind (2031).

## 8. Illustrations from the Orbit demo

These come from the seeded demo world, which uses **illustrative** emission factors (`src/lib/factors.ts`). They show the mechanics, not certified accounting.

| Demo passport | What it shows | Literature comparison |
| --- | --- | --- |
| Orbit Tee: 40% recycled content, proven by mass balance | Recycled share comes from signed lots, not from a declaration | Global textile-to-textile recycled supply is < 1%[^te] |
| Strata Loop battery: 93% recycled content, ≈ 65% lower footprint, ≈ 29 kg CO2e avoided per pack | Closed loop, with recovered lots linked to the ancestor passport | Recycled materials save 58–81% (Machala). Our conservative per-pack figure in §3 is **≈ 10 kg** because it counts only the materials share at the low-end saving. |
| EcoCloud Hoodie: claims "carbon neutral, 1.2 kg"; ledger shows 6.0 kg after air freight | Transport legs recomputed from registered locations | Directive 2024/825 bans offset-based neutrality claims[^empco] |

## 9. Limitations

- **Data quality (the oracle problem).** Orbit verifies consistency between signed records, not physical truth. Counter-signatures from suppliers on lots and auditor attestations reduce the risk, as do distances derived from registered locations. Self-reported fields (e.g. factory energy) are labelled on the passport. Projections assume most data comes from counter-signed sources.
- **Behavioural parameters are assumptions.** The repair rate, the collection uplift and the procurement shift are not yet measured. They should be the first metrics of any pilot.
- **Footprint scope.** The EEA's 159 Mt is a consumption-based footprint that includes footwear and household textiles. IVL's percentages use a narrower baseline (≈ 88 Mt implied). We use each source's own baseline and do not mix them within one lever.
- **Source scope.** CONEBI e-bike sales cover EU + UK, so using them as the end-of-life flow overstates the EU 2030 figure. The battery materials share is verified against the full text of Peiseler et al. (open access).
- **Timing.** The textile passport is unlikely to be mandatory before ~2029.[^ec-textiles] Most e-bike batteries sold from 2027 reach end of life after 2030. The 2027–2030 ramp is therefore optimistic for the batteries lever and depends on voluntary textile adoption.
- **Linearity.** Large adoption could saturate recycling capacity or shift prices, so the 15% scenario is less reliable than the 1% one.

## 10. How we would measure real impact

Every lever is computed from signed ledger events, so a deployment can report actual counts rather than modelled ones: `RETURNED` and `RECYCLED` events (kg recovered, by material), `REPAIRED` events per product, and verified vs. contradicted claims per brand. Combined with the savings factors above, these give an auditable avoided-emissions figure per year, anchored on-chain with the same Merkle roots.

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
