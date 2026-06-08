"use client";

/**
 * Header der beiden Argument-Views (booklet, taxonomy): erklärt, was die Seite
 * ist — „Argumentarium zur Vorlage «…»" plus ein kurzer Einführungstext. Bewusst
 * OHNE Datum/Typ/Zähler (die stecken jetzt im Ballot-Header der Info-Seite).
 */
import { useTranslations } from "next-intl";
import type { Ballot } from "@/types/ballots";

export function ArgumentariumHeader({ ballot }: { ballot: Ballot }) {
  const t = useTranslations("argumentarium");
  const tbk = useTranslations("booklet");
  return (
    <div className="px-1 pt-2">
      <div className="mb-4 flex items-start justify-between gap-6">
        <h1
          className="text-3xl md:text-[2.25rem] font-bold tracking-tight leading-[1.05]"
          style={{ fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif' }}
        >
          {t("title", { name: ballot.title })}
        </h1>
        <div className="flex shrink-0 gap-8 pt-1">
          {(ballot.argumentCount ?? 0) > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold leading-none tracking-tight text-[var(--text)]">
                {ballot.argumentCount}
              </span>
              <span className="mt-2 text-sm text-[var(--text-faint)]">
                {tbk("argumentsLabel")}
              </span>
            </div>
          )}
          {(ballot.commentCount ?? 0) > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold leading-none tracking-tight text-[var(--text)]">
                {ballot.commentCount}
              </span>
              <span className="mt-2 text-sm text-[var(--text-faint)]">
                {tbk("commentsLabel")}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="max-w-2xl text-base text-[var(--text-mid)] leading-relaxed">
        {t("intro")}
      </p>
      <p className="mt-3 flex max-w-2xl items-baseline gap-1.5 text-sm text-[var(--text-faint)] leading-relaxed">
        <span className="text-amber-500">★</span>
        {t("officialStarNote")}
      </p>
    </div>
  );
}

export default ArgumentariumHeader;
