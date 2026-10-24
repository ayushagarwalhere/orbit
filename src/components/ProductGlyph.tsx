// Product icon. Unicode has no hoodie emoji (🧥 is a coat), so hoodies get a small drawn icon;
// everything else uses the emoji recorded in the product's passport.
export function ProductGlyph({ emoji, name, className }: { emoji: string; name: string; className?: string }) {
  if (!/hoodie/i.test(name)) return <span className={className}>{emoji}</span>;
  return (
    <span className={className} role="img" aria-label="hoodie">
      <svg viewBox="0 0 64 64" width="1em" height="1em" style={{ display: "inline-block", verticalAlign: "-0.12em" }} aria-hidden>
        {/* sleeves */}
        <path d="M14 22 L5 44 Q4 48 8 49 L13 50 L19 32 Z" fill="#d8a46a" />
        <path d="M50 22 L59 44 Q60 48 56 49 L51 50 L45 32 Z" fill="#d8a46a" />
        {/* body */}
        <path d="M17 20 Q32 14 47 20 L49 56 Q32 60 15 56 Z" fill="#e8b97e" />
        {/* hood */}
        <path d="M20 21 Q20 6 32 6 Q44 6 44 21 Q38 26 32 26 Q26 26 20 21 Z" fill="#d8a46a" />
        <path d="M24 20 Q24 11 32 11 Q40 11 40 20 Q36 23 32 23 Q28 23 24 20 Z" fill="#8a5a33" />
        {/* drawstrings */}
        <path d="M28 25 L27 36 M36 25 L37 36" stroke="#f5e6d0" strokeWidth="1.8" strokeLinecap="round" />
        {/* pocket and cuffs */}
        <path d="M22 42 Q32 39 42 42 L41 51 Q32 53 23 51 Z" fill="#d8a46a" />
        <path d="M15 54 Q32 58 49 54 L49 57 Q32 61 15 57 Z" fill="#c9935b" />
      </svg>
    </span>
  );
}
