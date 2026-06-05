"use client";

/**
 * Ballot-„Hero"-Header (Datum · Typ, Serif-Titel, grosse Argument-/Kommentar-
 * Zähler, ausklappbare Beschreibung). 1:1 aus dem Booklet extrahiert, damit ihn
 * mehrere Views (booklet, taxonomy, …) teilen können.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
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
  const tbt = useTranslations("ballotType");

  return (
    <div className="bg-card border border-border rounded-[calc(var(--r)+6px)] px-8 py-8 md:px-11 md:py-9 overflow-hidden">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="label">{formatDate(ballot.voteDate)}</span>
        {ballot.ballotType && (
          <>
            <span className="label">·</span>
            <span className="text-[0.8125rem] font-semibold text-[var(--brand)]">
              {tbt(ballot.ballotType)}
            </span>
          </>
        )}
      </div>

      <div className="flex justify-between items-start gap-6 mb-5">
        <h1
          className="text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[0.92]"
          style={{ fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif' }}
        >
          {ballot.title}
        </h1>
        <div className="flex gap-8 shrink-0 pt-1">
          {(ballot.argumentCount ?? 0) > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold leading-none tracking-tight text-[var(--text)]">
                {ballot.argumentCount}
              </span>
              <span className="mt-2 text-sm text-[var(--text-faint)]">{tbk("argumentsLabel")}</span>
            </div>
          )}
          {(ballot.commentCount ?? 0) > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold leading-none tracking-tight text-[var(--text)]">
                {ballot.commentCount}
              </span>
              <span className="mt-2 text-sm text-[var(--text-faint)]">{tbk("commentsLabel")}</span>
            </div>
          )}
        </div>
      </div>

      {ballot.description && <ExpandableText text={ballot.description} />}
    </div>
  );
}

export default BallotHeader;
