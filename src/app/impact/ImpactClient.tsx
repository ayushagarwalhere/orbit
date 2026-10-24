"use client";

import NumberFlow from "@number-flow/react";
import { useMemo, useState } from "react";
import { DEFAULT_INPUTS, project, type ImpactInputs } from "@/lib/impact.ts";

const SLIDERS: { key: keyof ImpactInputs; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: "adoption", label: "Share of EU textiles & batteries on Orbit by 2030", min: 0.01, max: 0.25, step: 0.01, hint: "Our scenarios: 1% conservative, 5% moderate, 15% ambitious" },
  { key: "repairUptake", label: "Tracked textile items that get a life-extending repair", min: 0, max: 0.3, step: 0.01, hint: "Central case 5%. Repair-bonus data (France, Austria, Thuringia) suggests even that is a stretch; 10% is a pilot target (IMPACT.md §5.1)" },
  { key: "repairSaving", label: "Footprint saved per repaired item", min: 0, max: 0.2, step: 0.01, hint: "WRAP: up to 20% for +9 months of life; we default to half" },
  { key: "collectionUplift", label: "Extra e-bike pack collection from return rewards", min: 0, max: 0.4, step: 0.01, hint: "US deposits show ~+40 pts on cans; we default to half" },
  { key: "procurementGain", label: "Lower footprint of verified EV cells bought", min: 0, max: 0.2, step: 0.01, hint: "Median to 5th percentile gap is ~20% (Peiseler 2024)" },
  { key: "additionality", label: "Share not already caused by the Battery Regulation", min: 0, max: 1, step: 0.05, hint: "50% haircut by default" },
];

const SCENARIOS = [
  { label: "Conservative · 1%", adoption: 0.01 },
  { label: "Moderate · 5%", adoption: 0.05 },
  { label: "Ambitious · 15%", adoption: 0.15 },
];

export function ImpactClient() {
  const [inputs, setInputs] = useState<ImpactInputs>(DEFAULT_INPUTS);
  const result = useMemo(() => project(inputs), [inputs]);
  const max = Math.max(...result.levers.map((l) => l.mt), 1e-9);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="card space-y-5 p-6">
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.label}
              className={`btn text-xs ${Math.abs(inputs.adoption - s.adoption) < 1e-9 ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setInputs({ ...DEFAULT_INPUTS, adoption: s.adoption })}
            >
              {s.label}
            </button>
          ))}
        </div>
        {SLIDERS.map((s) => (
          <label key={s.key} className="block">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{s.label}</span>
              <span className="font-mono tabular-nums text-accent">{pct(inputs[s.key])}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={inputs[s.key]}
              onChange={(e) => setInputs({ ...inputs, [s.key]: Number(e.target.value) })}
              className="mt-2 w-full accent-[#c8f169]"
            />
            <div className="text-xs text-muted">{s.hint}</div>
          </label>
        ))}
      </div>

      <div className="card p-6">
        <div className="label">Avoided in 2030</div>
        <div className="mt-2 flex items-end gap-3">
          <span className="display text-[clamp(4rem,9vw,7rem)] leading-[0.85] text-accent">
            <NumberFlow value={result.totalMt} format={{ maximumFractionDigits: 3, minimumFractionDigits: 3 }} />
          </span>
          <span className="pb-2 text-lg text-ink-soft">Mt CO₂e / yr</span>
        </div>
        <div className="mt-2 text-sm text-ink-soft">
          ≈ <b className="text-ink">{(result.cumulativeMt).toFixed(2)} Mt</b> cumulative 2027–2030 (linear ramp) · the yearly figure equals the textile footprint of about{" "}
          <b className="text-ink">{Math.round((result.totalMt * 1e9) / 355).toLocaleString("en")}</b> EU residents (355 kg each a year, EEA)
        </div>
        <ul className="mt-6 space-y-4">
          {result.levers.map((l) => (
            <li key={l.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{l.label}</span>
                <span className="font-mono tabular-nums">{l.mt.toFixed(4)} Mt</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(l.mt / max) * 100}%` }} />
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted">{l.formula}</div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted">
          Excluded on purpose: the effect of greenwashing deterrence on textile demand (no robust source), reuse of returned garments, battery repair, and textiles outside the EU. All are likely positive.
          Overlap: a mandatory passport plus EPR fees would deliver part of these effects without Orbit. Applying a 50% overlap haircut to the recycling and repair levers gives about{" "}
          {(result.totalMt - 0.5 * result.levers.filter((l) => l.id === "recycling" || l.id === "repair").reduce((t, l) => t + l.mt, 0)).toFixed(3)} Mt with these inputs (IMPACT.md §5.2).
        </p>
      </div>
    </div>
  );
}
