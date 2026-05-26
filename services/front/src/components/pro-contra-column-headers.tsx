"use client";

import { useTranslations } from "next-intl";

// Spaltenkopf für die Pro-/Contra-Spalten der Argumentlisten:
// kleines Versal-Label in der jeweiligen Farbe, eine dünne, auslaufende
// Trennlinie und rechts eine weiche Zähler-Pille. Bewusst zurückgenommen,
// damit es die Sektionsüberschrift nicht überstrahlt.
function ColumnHeader({
  type,
  label,
  count,
}: {
  type: "pro" | "contra";
  label: string;
  count: number;
}) {
  const isPro = type === "pro";
  const color = isPro ? "var(--pro)" : "var(--contra)";
  const dim = isPro ? "var(--pro-dim)" : "var(--contra-dim)";

  return (
    <div className="flex items-center gap-3">
      <span
        className="shrink-0 text-[0.8125rem] font-bold uppercase tracking-[0.08em]"
        style={{ color }}
      >
        {label}
      </span>
      <span
        className="h-px flex-1"
        style={{
          background: `linear-gradient(to right, ${color}, transparent)`,
        }}
      />
      <span
        className="shrink-0 text-xs font-bold rounded-[var(--r-full,999px)] px-2.5 py-1"
        style={{ backgroundColor: dim, color }}
      >
        {count}
      </span>
    </div>
  );
}

export function ProContraColumnHeaders({
  proCount,
  contraCount,
}: {
  proCount: number;
  contraCount: number;
}) {
  const tc = useTranslations("common");

  return (
    <div className="na-section-col-headers grid grid-cols-2 gap-4 mt-2">
      <ColumnHeader type="pro" label={tc("pro")} count={proCount} />
      <ColumnHeader type="contra" label={tc("contra")} count={contraCount} />
    </div>
  );
}
