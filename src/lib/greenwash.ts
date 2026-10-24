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
];

export function lintClaim(statement: string): LintHit[] {
  const hits: LintHit[] = [];
  for (const r of RULES) {
    const m = statement.match(r.pattern);
    if (m) hits.push({ term: m[0], severity: r.severity, reason: r.reason });
  }
  return hits;
}
