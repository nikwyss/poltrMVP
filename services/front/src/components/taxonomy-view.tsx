"use client";

/**
 * Geteilte Render-Bausteine der Taxonomy-Darstellung — genutzt von der
 * Haupt-View (`…/arguments/taxonomy/page.tsx`) UND vom Taxonomy-Detail-Overlay
 * (`taxonomy-detail.tsx`), damit beide identisch aussehen.
 *
 * Enthält: `getInsight` (leitet Farbe/Zustand eines Knotens aus den Bewertungen
 * ab — treibt die Card-Farbcodierung), die Booklet-artige Argument-Karte
 * (ArgumentCard) und die zweispaltige Pro/Contra-Liste mit „Mehr anzeigen"-Limit
 * (ProContraArguments).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleDashed,
  Split,
  ThumbsUp,
  ThumbsDown,
  Scale,
  Plus,
  Telescope,
  type LucideIcon,
} from "lucide-react";
import type { TaxonomyArgument, TaxonomyNode } from "@/types/ballots";
import { ProContraColumnHeaders } from "@/components/pro-contra-column-headers";
import { OfficialStar } from "@/components/pro-contra-badge";
import { Card } from "@/components/ui/card";

export type T = (key: string, values?: Record<string, string | number>) => string;

// Initiales Anzeige-Limit je Spalte; danach „Mehr anzeigen".
export const PAGE_LIMIT = 4;

// Bottom-Aktion der ThemeCard — Material-„Text Button": farbiger Text + Icon,
// keine Füllung/Rand. Beide Aktionen identisch (kein Emphasis-Unterschied).
// Warmes, dunkleres Brand-Amber (#a8600a) — lesbar auf hellen Cards.
const ACTION_BTN =
  "flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-[#a8600a] transition hover:bg-[#a8600a]/10";

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
        <div className="na-card-title">
          {arg.title}
          {isOfficial && <OfficialStar />}
        </div>
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
  limit = PAGE_LIMIT,
  hideShowMore = false,
}: {
  args: TaxonomyArgument[];
  onOpen: (rkey: string) => void;
  onShowMore?: () => void;
  limit?: number;
  // Eigener „Mehr anzeigen"-Button unterdrücken — der Aufrufer steuert das Laden.
  hideShowMore?: boolean;
}) {
  const t = useTranslations("taxonomy");
  const [expanded, setExpanded] = useState(false);
  if (!args.length) return null;
  const pro = args.filter((a) => a.type === "PRO");
  const contra = args.filter((a) => a.type !== "PRO");
  const cap = expanded ? Infinity : limit;
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
      {hasMore && !hideShowMore && (
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

// ---------------------------------------------------------------------------
// Themen-/Bereichs-Card — farbcodiert nach Bewertungs-Zustand (linker Rand),
// Kopf mit Name + Bewertungs-Zähler, optional Einleitung, dann die Pro/Contra-
// Argumente. Genutzt von der Main-View (Top-Themen) UND vom Detail-Overlay
// (Unterbereiche), damit beide identisch aussehen. „Mehr anzeigen" (onShowMore)
// öffnet das Detail-Overlay der nächsten Stufe.
// ---------------------------------------------------------------------------
export function ThemeCard({
  node,
  onOpen,
  onShowMore,
  onAddArgument,
  t,
  limit = 3,
}: {
  node: TaxonomyNode;
  onOpen: (rkey: string) => void;
  onShowMore?: () => void;
  // Optional: zeigt einen runden „+ Neues Argument"-Button auf der unteren Kante.
  onAddArgument?: () => void;
  t: T;
  limit?: number;
}) {
  const ins = getInsight(node, t);
  const rated = node.ratedCount ?? 0;

  // Bottom-Button (nur Haupt-View, d. h. wenn onAddArgument geliefert wird):
  //  - alle Argumente sichtbar  ⇒ „Neues Argument vorschlagen" (Modal)
  //  - nicht alle (wegen Limit)  ⇒ „Themenbereich anzeigen" (öffnet das Overlay,
  //    wo alles sichtbar ist und neue Argumente vorgeschlagen werden können).
  const managed = !!onAddArgument;
  const proCount = node.arguments.filter((a) => a.type === "PRO").length;
  const contraCount = node.arguments.length - proCount;
  const truncated = proCount > limit || contraCount > limit;
  // Truncated ⇒ Overlay-Button (braucht onShowMore); sonst Vorschlag-Button.
  const showOverlayBtn = managed && truncated && !!onShowMore;
  const showAddBtn = managed && !truncated;
  const hasBottomBtn = showOverlayBtn || showAddBtn;

  return (
    <Card
      className="gap-0 overflow-hidden border-border/60 py-0 shadow-none"
      style={{ borderLeft: `3px solid ${ins.bar}` }}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-2.5">
        <h3 className="truncate text-base font-semibold tracking-tight">{node.name}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {rated}/{node.argumentCount} {t("rated")}
        </span>
      </div>

      {(node.introduction || node.arguments.length > 0) && (
        <div className={`px-5 ${hasBottomBtn ? "pb-3" : "pb-4"}`}>
          {node.introduction && (
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              {node.introduction}
            </p>
          )}
          {node.arguments.length > 0 && (
            <ProContraArguments
              args={node.arguments}
              onOpen={onOpen}
              onShowMore={managed ? undefined : onShowMore}
              limit={limit}
              hideShowMore={managed}
            />
          )}
        </div>
      )}

      {/* Bottom-Aktion: zentriert unten in der Card, beide Buttons gleich (Material-
          Text-Button-Stil: farbiger Text + Icon, keine Füllung/Rand). */}
      {hasBottomBtn && (
        <div className="flex justify-center px-5 pb-4">
          {showAddBtn ? (
            <button type="button" onClick={onAddArgument} className={ACTION_BTN}>
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">{t("newArgument")}</span>
            </button>
          ) : (
            <button type="button" onClick={onShowMore} className={ACTION_BTN}>
              <Telescope className="h-4 w-4 shrink-0" />
              <span className="truncate">{t("openTopicArea", { name: node.name })}</span>
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
