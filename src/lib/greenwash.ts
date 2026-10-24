// Flags vague or unsubstantiated environmental wording, following the spirit of the
// EU Empowering Consumers Directive (2024/825) which bans generic green claims without proof.

export interface LintHit {
  term: string;
  severity: "high" | "medium";
  reason: string;
}

const RULES: { pattern: RegExp; severity: LintHit["severity"]; reason: string }[] = [
  { pattern: /\b(eco[- ]?friendly|environmentally friendly|planet[- ]friendly)\b/i, severity: "high", reason: "Generic environmental claim; banned in the EU without recognised excellent performance." },
  { pattern: /\b(green|natural|conscious|earth[- ]?friendly)\b/i, severity: "medium", reason: "Vague term with no measurable meaning." },
  { pattern: /\b(carbon[- ]?neutral|climate[- ]?neutral|net[- ]?zero|climate positive|co2[- ]?neutral)\b/i, severity: "high", reason: "Neutrality claims based on offsetting are banned for products in the EU from 27 September 2026." },
  { pattern: /\b(sustainable|sustainably made)\b/i, severity: "medium", reason: "'Sustainable' needs a specific, verifiable basis." },
  { pattern: /\b(biodegradable|compostable)\b/i, severity: "medium", reason: "Must state conditions and timeframe (e.g. industrial composting, EN 13432)." },
  { pattern: /\b100\s?%/i, severity: "medium", reason: "Absolute claims are hard to prove; make sure the ledger backs the full amount." },
  { pattern: /\b(responsibly|ethically) (sourced|made)\b/i, severity: "medium", reason: "Needs a named standard and an independent audit." },
  { pattern: /\b(zero[- ]?waste|plastic[- ]?free|toxin[- ]?free|chemical[- ]?free)\b/i, severity: "medium", reason: "Absolute 'free-of' claims require full material disclosure." },
  { pattern: /(low[- ]?(impact|carbon)|lower[- ]?(impact|carbon|emissions?)|climate[- ]?friendly)/i, severity: "medium", reason: "Comparative claim: say compared with what, by how much, and on what basis." },
];

export function lintClaim(statement: string): LintHit[] {
  const hits: LintHit[] = [];
  for (const r of RULES) {
    const m = statement.match(r.pattern);
    if (m) hits.push({ term: m[0], severity: r.severity, reason: r.reason });
  }
  return hits;
}

// ---------- "check any claim": what a label would need before Orbit could verify it ----------

export interface ClaimTopic {
  kind: "RECYCLED_CONTENT" | "CARBON_FOOTPRINT" | "ORIGIN" | "ETHICAL_LABOR" | "REPAIRABILITY";
  label: string;
  /** What Orbit checks this kind of claim against. */
  checkedAgainst: string;
  /** Is the claim specific enough to check (e.g. it states a number)? */
  specific: boolean;
  hint?: string;
}

export interface ClaimAssessment {
  hits: LintHit[];
  topics: ClaimTopic[];
  verdict: "banned" | "vague" | "checkable" | "unclear";
  summary: string;
}

const TOPICS: { kind: ClaimTopic["kind"]; label: string; pattern: RegExp; specific: RegExp; checkedAgainst: string; hint: string }[] = [
  {
    kind: "RECYCLED_CONTENT",
    label: "Recycled content",
    pattern: /recycl|upcycl|ocean plastic|circular/i,
    specific: /\d+(\.\d+)?\s?%/,
    checkedAgainst: "the mass balance of material lots signed by suppliers and recyclers",
    hint: 'State a percentage by mass, e.g. "40% recycled polyester by mass".',
  },
  {
    kind: "CARBON_FOOTPRINT",
    label: "Carbon footprint",
    pattern: /carbon|co2|co₂|climate|emission|net[- ]?zero|footprint/i,
    specific: /\d+(\.\d+)?\s?(kg|g|t)\b/i,
    checkedAgainst: "the signed material lots, the factory's declared energy (shown as self-reported) and every transport leg, cross-checked with the recipient's signed arrival time",
    hint: 'State a footprint per product, e.g. "5.9 kg CO2e, cradle to shelf". Offsetting can\'t make a product "neutral" in the EU.',
  },
  {
    kind: "ORIGIN",
    label: "Origin",
    pattern: /\bmade in\b|\bgrown in\b|\bsourced (from|in)\b|\blocal(ly)?\b|\borigin\b/i,
    specific: /\b(made|grown|sourced) in [A-Z][a-z]+|\bfrom [A-Z][a-z]+/,
    checkedAgainst: "the registered location of the supplier who signed each material lot",
    hint: "Name the country or region.",
  },
  {
    kind: "ETHICAL_LABOR",
    label: "Labour standards",
    pattern: /ethic|fair[- ]?trade|fair wages?|labou?r|sweatshop|workers?|sa8000|social/i,
    specific: /\b(sa8000|fair[- ]?trade certified|bsci|wrap certified|audited)\b/i,
    checkedAgainst: "an independent auditor's signed verdict, which overrides the brand's word",
    hint: "Name the standard (e.g. SA8000) and get an independent audit.",
  },
  {
    kind: "REPAIRABILITY",
    label: "Repairability",
    pattern: /repair|spare parts|durab|long[- ]?lasting|lifetime/i,
    specific: /\d+\s?\/\s?10|\d+\s?(years?|yrs?)/i,
    checkedAgainst: "the repairability score in the passport and the repair events signed by repairers",
    hint: 'Give a score or a parts-availability period, e.g. "spare parts for 7 years".',
  },
];

const SUMMARY: Record<ClaimAssessment["verdict"], string> = {
  banned: "This wording is banned for products sold in the EU under Directive 2024/825, whatever the evidence.",
  vague: "Too vague to check. Make it specific and measurable, then Orbit can test it against signed data.",
  checkable: "Specific enough to check. Orbit would test it against data the brand doesn't control.",
  unclear: "No environmental or social claim recognised. Try a line from a real product label.",
};

/** Assess a marketing claim: banned or vague wording, and what Orbit would check it against. */
export function assessClaim(statement: string): ClaimAssessment {
  const text = statement.trim();
  const hits = lintClaim(text);
  const topics: ClaimTopic[] = TOPICS.filter((t) => t.pattern.test(text)).map((t) => {
    const specific = t.specific.test(text);
    return { kind: t.kind, label: t.label, checkedAgainst: t.checkedAgainst, specific, hint: specific ? undefined : t.hint };
  });
  const banned = hits.some((h) => h.severity === "high");
  const vague = hits.length > 0 || topics.some((t) => !t.specific);
  const verdict: ClaimAssessment["verdict"] = !text ? "unclear" : banned ? "banned" : vague ? "vague" : topics.length ? "checkable" : "unclear";
  return { hits, topics, verdict, summary: SUMMARY[verdict] };
}
