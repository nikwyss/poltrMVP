"use client";

/**
 * Header der beiden Argument-Views (booklet, taxonomy): eine ruhige Meta-Zeile
 * (Themen · Argumente · Kommentare) mit dem ViewToggle rechts daneben, plus ein
 * kurzer Einführungstext. Der Vorlagentitel steht im globalen Titelband
 * (ballot/[id]/layout.tsx) — hier bewusst kein eigener Sektionstitel mehr.
 */
import { useTranslations } from "next-intl";
import type { Ballot } from "@/types/ballots";

export function ArgumentariumHeader({
  ballot,
  // Anzahl Top-Themen — nur die Taxonomy-View liefert das; dann erscheint in der
  // Meta-Zeile zusätzlich „… Themen". Booklet lässt es weg.
  topicCount,
  // Optionaler Controls-Slot (z. B. ViewToggle) — sitzt rechts auf der
  // Überschriftenzeile, gekoppelt an den Inhalt, den er umschaltet.
  actions,
}: {
  ballot: Ballot;
  topicCount?: number;
  actions?: React.ReactNode;
}) {
  const t = useTranslations("argumentarium");
  const tbk = useTranslations("booklet");

  // Ruhige Meta-Zeile statt grosser Zähler-Spalten: «5 Themen · 111 Argumente
  // · 999 Kommentare». Zahlen in Ink, Wörter muted (in einer Sakkade scanbar).
  // Themen nur, wenn die Taxonomy-View es liefert.
  const metaParts = [
    (topicCount ?? 0) > 0
      ? { value: topicCount as number, label: tbk("topicsLabel") }
      : null,
    (ballot.argumentCount ?? 0) > 0
      ? { value: ballot.argumentCount as number, label: tbk("argumentsLabel") }
      : null,
    // Kommentare nur ab mehr als einem (sonst „1 Kommentare" + wenig Aussage).
    (ballot.commentCount ?? 0) > 0
      ? { value: ballot.commentCount as number, label: tbk("commentsLabel") }
      : null,
  ].filter((p): p is { value: number; label: string } => p !== null);

  return (
    <div className="px-1 pt-2">
      {/* Kein grosser Sektionstitel mehr — die Meta-Zeile trägt die Zähler,
          der ViewToggle sitzt rechts daneben. */}
      <div
        className={`flex items-center gap-4 ${
          metaParts.length > 0 ? "justify-between" : "justify-end"
        }`}
      >
        {metaParts.length > 0 && (
          <p className="text-[0.875rem] text-[var(--text-mid)]">
            {metaParts.map((part, i) => (
              <span key={part.label}>
                {i > 0 && <span className="mx-1.5">·</span>}
                <span className="font-semibold text-[var(--text)]">
                  {part.value}
                </span>{" "}
                {part.label}
              </span>
            ))}
          </p>
        )}
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <p className="mt-4 max-w-[65ch] text-base text-[var(--text-mid)] leading-relaxed">
        {t("intro")}
      </p>
    </div>
  );
}

export default ArgumentariumHeader;
