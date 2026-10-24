"use client";

import { useMemo, useState } from "react";
import { assessClaim } from "@/lib/greenwash.ts";

const EXAMPLES = ["100% eco-friendly and carbon neutral", "Made with 40% recycled polyester by mass", "Ethically made", "Low-carbon jacket, made in Portugal", "Spare parts available for 7 years"];

const TONE = {
  banned: { cls: "border-rust/40 bg-rust-soft", text: "text-rust", label: "Banned wording" },
  vague: { cls: "border-amber/40 bg-amber-soft", text: "text-amber", label: "Too vague to check" },
  checkable: { cls: "border-leaf/40 bg-leaf-soft", text: "text-leaf", label: "Checkable" },
  unclear: { cls: "border-line bg-raised", text: "text-ink-soft", label: "No claim found" },
} as const;

/** "Check any claim": paste a line from a label and see what the EU rules and Orbit make of it. */
export function ClaimChecker() {
  const [text, setText] = useState(EXAMPLES[0]);
  const a = useMemo(() => assessClaim(text), [text]);
  const tone = TONE[a.verdict];
  return (
    <div className="card grid gap-5 p-5 md:grid-cols-[1fr_1.1fr]">
      <div>
        <label htmlFor="claim-input" className="label">
          A line from a product label
        </label>
        <textarea
          id="claim-input"
          className="field mt-2 h-28 resize-none text-[15px]"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Made from 70% recycled materials"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={x === text}
              className={`chip cursor-pointer hover:border-line-strong ${x === text ? "border-accent/50 text-accent" : "text-ink-soft"}`}
              onClick={() => setText(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Runs in your browser. Wording rules follow EU Directive 2024/825, which applies from 27 September 2026. A wording check, not legal advice.
        </p>
      </div>
      <div aria-live="polite">
        <div className={`rounded-xl border px-4 py-3 ${tone.cls}`}>
          <div className={`text-sm font-bold ${tone.text}`}>{tone.label}</div>
          <div className="mt-0.5 text-[13px] text-ink-soft">{a.summary}</div>
        </div>
        {a.hits.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {a.hits.map((h) => (
              <li key={h.term} className="flex gap-2">
                <span aria-hidden className={h.severity === "high" ? "text-rust" : "text-amber"}>
                  {h.severity === "high" ? "✕" : "⚠"}
                </span>
                <span>
                  <b className="text-ink">&ldquo;{h.term}&rdquo;</b> <span className="text-ink-soft">{h.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {a.topics.length > 0 && (
          <div className="mt-4">
            <div className="label">How Orbit would check it</div>
            <ul className="mt-2 space-y-2 text-[13px]">
              {a.topics.map((t) => (
                <li key={t.kind} className="rounded-lg border border-line px-3 py-2">
                  <div className="font-medium text-ink">
                    {t.label} {t.specific ? <span className="text-leaf">· specific</span> : <span className="text-amber">· needs a number or a name</span>}
                  </div>
                  <div className="text-ink-soft">Checked against {t.checkedAgainst}.</div>
                  {t.hint && <div className="mt-0.5 text-muted">{t.hint}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
