// Climate impact model. Mirrors docs/IMPACT.md §3–4 exactly (same formulas, same sourced inputs),
// so the in-app calculator and the written assessment can never disagree.

export interface ImpactInputs {
  adoption: number; // share s of the EU product flow on Orbit by 2030 (0–1)
  repairUptake: number; // share of Orbit-tracked textile items that get a life-extending repair
  repairSaving: number; // share of an item's production footprint credited per repair
  collectionUplift: number; // extra e-bike pack collection caused by the deposit (absolute share)
  procurementGain: number; // footprint reduction of verified EV cells bought vs the median
  additionality: number; // share of the procurement effect not already caused by regulation
}

export const DEFAULT_INPUTS: ImpactInputs = {
  adoption: 0.05,
  repairUptake: 0.1,
  repairSaving: 0.1,
  collectionUplift: 0.2,
  procurementGain: 0.1,
  additionality: 0.5,
};

/** Sourced constants (see docs/IMPACT.md §2 for every citation). */
export const BASELINE = {
  textileFootprintMt: 159, // EEA 2022: EU textile consumption footprint, Mt CO2e
  textileRecyclingMtAtFullAdoption: 0.44, // IVL 2025: EU 1% -> 10% fibre-to-fibre, Mt CO2e/yr
  ebikePacksPerYear: 5.1e6, // CONEBI 2023 (EU + UK)
  kgSavedPerExtraPack: 10.3, // 0.6 kWh x 74 kg/kWh x 50% materials x 80% recovery x 58% saving
  evGwhPerYear: 120, // IEA via Argus: ~13% of ~950 GWh
  medianCellKgPerKwh: 74, // Peiseler et al. 2024, NMC811 median
};

export interface Lever {
  id: string;
  label: string;
  formula: string;
  mt: number;
}

export function project(i: ImpactInputs): { levers: Lever[]; totalMt: number; cumulativeMt: number } {
  const s = i.adoption;
  const levers: Lever[] = [
    {
      id: "recycling",
      label: "Textiles: fibre-to-fibre recycling (deposit returns + verified recycled content)",
      formula: `s × ${BASELINE.textileRecyclingMtAtFullAdoption} Mt`,
      mt: s * BASELINE.textileRecyclingMtAtFullAdoption,
    },
    {
      id: "ebike",
      label: "E-bike batteries: extra collection from deposits",
      formula: `s × 5.1 M packs × ${Math.round(i.collectionUplift * 100)}% × 10.3 kg`,
      mt: (s * BASELINE.ebikePacksPerYear * i.collectionUplift * BASELINE.kgSavedPerExtraPack) / 1e9,
    },
    {
      id: "repair",
      label: "Textiles: repair incentives extend product life",
      formula: `s × 159 Mt × ${Math.round(i.repairUptake * 100)}% repaired × ${Math.round(i.repairSaving * 100)}% saved`,
      mt: s * BASELINE.textileFootprintMt * i.repairUptake * i.repairSaving,
    },
    {
      id: "procurement",
      label: "EV batteries: procurement shifts to verified lower-carbon cells",
      formula: `s × 120 GWh × 74 kg/kWh × ${Math.round(i.procurementGain * 100)}% × ${Math.round(i.additionality * 100)}% additional`,
      mt: (s * BASELINE.evGwhPerYear * 1e6 * BASELINE.medianCellKgPerKwh * i.procurementGain * i.additionality) / 1e9,
    },
  ];
  const totalMt = levers.reduce((a, l) => a + l.mt, 0);
  // Linear ramp to the 2030 level: 25% / 50% / 75% / 100% of it in 2027–2030.
  return { levers, totalMt, cumulativeMt: totalMt * 2.5 };
}
