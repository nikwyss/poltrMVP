"use client";

/**
 * Geteilte Render-Bausteine der Taxonomy-Darstellung — genutzt von der
 * Haupt-View (`…/arguments/taxonomy/page.tsx`) UND vom Taxonomy-Detail-Overlay
 * (`taxonomy-detail.tsx`), damit beide identisch aussehen.
 *
 * Enthält: „Für dich"-Insight (getInsight/InsightPanel), die Booklet-artige
 * Argument-Karte (ArgumentCard) und die zweispaltige Pro/Contra-Liste mit
 * „Mehr anzeigen"-Limit (ProContraArguments).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleDashed,
  Split,
  ThumbsUp,
  ThumbsDown,
  Scale,
  type LucideIcon,
} from "lucide-react";
import type { TaxonomyArgument, TaxonomyNode } from "@/types/ballots";
import { ProContraColumnHeaders } from "@/components/pro-contra-column-headers";

export type T = (key: string, values?: Record<string, string | number>) => string;

// Initiales Anzeige-Limit je Spalte; danach „Mehr anzeigen".
export const PAGE_LIMIT = 4;

// ---------------------------------------------------------------------------
// „Für dich"-Insight: Zustand aus proLeaning / dissent / ratedCount ableiten.
// ---------------------------------------------------------------------------
const THRESHOLD = 0.12;
const SPLIT = 0.5;
const MIN_RATED = 2;

const COL_GREY = "rgb(148,163,184)";
const COL_AMBER = "rgb(217,159,40)";
const COL_BLUE = "rgb(37,99,235)";
const COL_RED = "rgb(178,58,33)";

type InsightState = "unrated" | "split" | "pro" | "contra" | "balanced";

export function getInsight(node: TaxonomyNode, t: T): {
  state: InsightState; bar: string; bg: string; Icon: LucideIcon; title: string; sub: string;
} {
  const rated = node.ratedCount ?? 0;
  const lean = node.proLeaning;
  const dissent = node.dissent ?? 0;
  let state: InsightState;
  if (lean == null || rated < MIN_RATED) state = "unrated";
  else if (dissent > SPLIT) state = "split";
  else if (lean > THRESHOLD) state = "pro";
  else if (lean < -THRESHOLD) state = "contra";
  else state = "balanced";

  const map: Record<InsightState, { bar: string; bg: string; Icon: LucideIcon; title: string; sub: string }> = {
    unrated:  { bar: COL_GREY,  bg: "rgba(0,0,0,0.02)",        Icon: CircleDashed, title: t("insUnrTitle"),   sub: t("insUnrSub") },
    split:    { bar: COL_AMBER, bg: "rgba(217,159,40,0.07)",  Icon: Split,        title: t("insSplitTitle"), sub: t("insSplitSub") },
    pro:      { bar: COL_BLUE,  bg: "rgba(37,99,235,0.05)",   Icon: ThumbsUp,     title: t("insProTitle"),   sub: t("insProSub") },
    contra:   { bar: COL_RED,   bg: "rgba(178,58,33,0.05)",   Icon: ThumbsDown,   title: t("insConTitle"),   sub: t("insConSub") },
    balanced: { bar: COL_GREY,  bg: "rgba(0,0,0,0.02)",       Icon: Scale,        title: t("insBalTitle"),   sub: t("insBalSub") },
  };
  return { state, ...map[state] };
}

export function LeaningDot({ lean }: { lean: number | null | undefined }) {
  const bg =
    lean == null ? COL_GREY
    : lean > THRESHOLD ? COL_BLUE
    : lean < -THRESHOLD ? COL_RED
    : COL_AMBER;
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: bg }} />;
}

// „Für dich"-Panel (Icon + Titel + Untertitel), farbcodiert nach Insight-Zustand.
export function InsightPanel({ node, t }: { node: TaxonomyNode; t: T }) {
  const ins = getInsight(node, t);
  const Icon = ins.Icon;
  return (
    <div className="rounded-lg border border-black/5 bg-white/60 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: ins.bar }}>
        <Icon className="h-4 w-4 shrink-0" />
        <span>{t("forYou")}: {ins.title}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{ins.sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Argument-Karte — identisch zur Booklet-Karte (na-card): Pro/Contra-Badge,
// „Offiziell", Titel, und der Relevanz-Score nur wenn bereits bewertet.
// KEIN Bewertungselement hier — bewertet wird erst im Overlay nach dem Klick.
// ---------------------------------------------------------------------------
export function ArgumentCard({ arg, onOpen }: { arg: TaxonomyArgument; onOpen: (rkey: string) => void }) {
  const tbk = useTranslations("booklet");
  const trs = useTranslations("reviewStatus");
  const isPro = arg.type === "PRO";
  const relevance = typeof arg.viewerPreference === "number" ? arg.viewerPreference : null;
  const rated = relevance !== null;
  const isOfficial = arg.sourceType === "official";

  return (
    <div
      className={`na-card na-card-${arg.type.toLowerCase()} na-card-${rated ? "rated" : "unrated"}`}
      onClick={() => onOpen(arg.rkey)}
      role="button"
      tabIndex={0}
    >
      <div className="na-card-top">
        <div className="na-card-top-left">
          <span className="na-badge">
            {isPro ? tbk("proArgument") : tbk("contraArgument")}
          </span>
        </div>
        {rated && isOfficial && (
          <span className="na-card-status na-card-status--official">{trs("official")}</span>
        )}
      </div>

      <div className="na-card-body">
        <div className="na-card-title">{arg.title}</div>
        {rated && (
          <div className="na-card-score" aria-label={`${tbk("relevanceTitle")}: ${relevance}`}>
            <span className="na-card-index">
              {relevance}
              <span className="na-card-index-max">/100</span>
            </span>
            <span className="na-card-score-label">{tbk("relevanceForYou")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Argumente eines Knotens zweispaltig (Pro links / Contra rechts) — wie Booklet.
// Anzeige initial auf PAGE_LIMIT Karten je Spalte begrenzt. „Mehr anzeigen":
//   - mit `onShowMore`: ruft den Callback (Main-View → öffnet Detail-Overlay).
//   - ohne: blendet inline ALLE übrigen Argumente ein (im Detail-Overlay).
// ---------------------------------------------------------------------------
export function ProContraArguments({
  args,
  onOpen,
  onShowMore,
}: {
  args: TaxonomyArgument[];
  onOpen: (rkey: string) => void;
  onShowMore?: () => void;
}) {
  const t = useTranslations("taxonomy");
  const [expanded, setExpanded] = useState(false);
  if (!args.length) return null;
  const pro = args.filter((a) => a.type === "PRO");
  const contra = args.filter((a) => a.type !== "PRO");
  const cap = expanded ? Infinity : PAGE_LIMIT;
  const visiblePro = pro.slice(0, cap);
  const visibleContra = contra.slice(0, cap);
  // Verbleibende (ausgeblendete) Karten über beide Spalten.
  const remaining =
    (pro.length - visiblePro.length) + (contra.length - visibleContra.length);
  const hasMore = remaining > 0;
  const handleMore = onShowMore ?? (() => setExpanded(true));
  return (
    <div>
      <ProContraColumnHeaders proCount={pro.length} contraCount={contra.length} />
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {visiblePro.map((a) => <ArgumentCard key={a.uri} arg={a} onOpen={onOpen} />)}
        </div>
        <div className="flex flex-col gap-3">
          {visibleContra.map((a) => <ArgumentCard key={a.uri} arg={a} onOpen={onOpen} />)}
        </div>
      </div>
      {hasMore && (
        <button
          type="button"
          className="na-show-more"
          onClick={handleMore}
        >
          {t("showMore", { count: remaining })}
        </button>
      )}
    </div>
  );
}
