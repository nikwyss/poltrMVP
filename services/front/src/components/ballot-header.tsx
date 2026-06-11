"use client";

/**
 * Ballot-Übersichtskarte auf der Info-Seite: grosse Argument-/Kommentar-Zähler
 * plus ausklappbare Beschreibung. Datum · Typ und der Titel stehen seit dem
 * Layout-Refactor im globalen Vorlagen-Titelband (ballot/[id]/layout.tsx),
 * nicht mehr hier.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Ballot } from "@/types/ballots";

// Beschreibung — auf 5 Zeilen geklemmt, „mehr/weniger"-Toggle (nur wenn nötig).
function ExpandableText({ text }: { text: string }) {
  const tbk = useTranslations("booklet");
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text]);

  return (
    <div className="mb-5 max-w-2xl">
      <p
        ref={ref}
        className={`text-base text-[var(--text-mid)] leading-relaxed ${expanded ? "" : "line-clamp-5"}`}
      >
        {text}
      </p>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-xs font-semibold text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
        >
          {expanded ? tbk("readLess") : tbk("readMore")}
        </button>
      )}
    </div>
  );
}

export function BallotHeader({ ballot }: { ballot: Ballot }) {
  const tbk = useTranslations("booklet");

  const hasArguments = (ballot.argumentCount ?? 0) > 0;
  const hasComments = (ballot.commentCount ?? 0) > 0;

  // Ohne Beschreibung und ohne Zähler hat die Karte keinen Inhalt mehr.
  if (!ballot.description && !hasArguments && !hasComments) return null;

  return (
    <div className="bg-card border border-border rounded-[calc(var(--r)+6px)] px-8 py-8 md:px-11 md:py-9 overflow-hidden">
      {(hasArguments || hasComments) && (
        <div className="flex gap-8 mb-6">
          {hasArguments && (
            <div className="flex flex-col">
              <span className="text-3xl font-bold leading-none tracking-tight text-[var(--text)]">
                {ballot.argumentCount}
              </span>
              <span className="mt-2 text-sm text-[var(--text-faint)]">{tbk("argumentsLabel")}</span>
            </div>
          )}
          {hasComments && (
            <div className="flex flex-col">
              <span className="text-3xl font-bold leading-none tracking-tight text-[var(--text)]">
                {ballot.commentCount}
              </span>
              <span className="mt-2 text-sm text-[var(--text-faint)]">{tbk("commentsLabel")}</span>
            </div>
          )}
        </div>
      )}

      {ballot.description && <ExpandableText text={ballot.description} />}
    </div>
  );
}

export default BallotHeader;
