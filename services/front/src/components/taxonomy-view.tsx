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
  ChevronDown,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { TaxonomyArgument, TaxonomyNode } from "@/types/ballots";
import {
  collectLeaningContribs,
  aggregateLeaning,
  aggregateDissent,
} from "@/lib/aggregate";
import { ProContraColumnHeaders } from "@/components/pro-contra-column-headers";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type T = (key: string, values?: Record<string, string | number>) => string;

// Initiales Anzeige-Limit je Spalte; danach „Mehr anzeigen".
export const PAGE_LIMIT = 4;

// „Peek": Maske, die den angeschnittenen Kopf der nächsten (ausgeblendeten)
// Karte nach unten ausblendet — signalisiert „die Liste geht weiter" ohne dass
// man die Restkarte vollständig zeigt. Höhe so gewählt, dass Badge + ein Hauch
// Titel sichtbar bleiben (na-card: 16px Padding + Badge-Zeile).
const PEEK_MASK =
  "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)";

// Bottom-Aktion der ThemeCard — Material-„Text Button": farbiger Text + Icon,
// keine Füllung/Rand. Beide Aktionen identisch (kein Emphasis-Unterschied).
// Monochrom (gedämpftes Vordergrund-Grau) — neutral statt warmem Amber, damit
// die Aktion nicht versehentlich nach Contra-Rot aussieht.
const ACTION_BTN =
  "flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-foreground/70 transition hover:bg-foreground/[0.06] hover:text-foreground";

// ---------------------------------------------------------------------------
// „Für dich"-Insight: Zustand zentral aus den Bewertungs-Beiträgen ableiten
// (Haltung + Kontroversität, Schalter in lib/aggregate.ts).
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
  const contribs = collectLeaningContribs(node);
  const rated = contribs.length;
  const lean = aggregateLeaning(contribs);
  const dissent = aggregateDissent(contribs);
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
// Argument-Mini-Karte (Taxonomy). Scan-optimiert: Titel ist die grösste Ebene
// (was man sucht), darunter die Bewertung als Mini-Balken + Zahl mit Label
// „Deine Bewertung". Unbewertet = expliziter Zustand (warmer Highlight, leerer
// Balken + „Jetzt bewerten" als CTA in Brand-Orange). KEIN Pro/Contra-Pill —
// das ergibt sich aus der Spaltenposition; die Akzentfarbe trägt die Pol-Info.
// KEIN Bewertungselement hier — bewertet wird erst im Overlay nach dem Klick.
// ---------------------------------------------------------------------------
export function ArgumentCard({ arg, onOpen }: { arg: TaxonomyArgument; onOpen: (rkey: string) => void }) {
  const tbk = useTranslations("booklet");
  const trs = useTranslations("reviewStatus");
  const isPro = arg.type === "PRO";
  const relevance = typeof arg.viewerPreference === "number" ? arg.viewerPreference : null;
  const rated = relevance !== null;
  const isOfficial = arg.sourceType === "official";
  // Pol-Farbe (Pro = Blau, Contra = Terrakotta) trägt jetzt die Pro/Contra-Info,
  // da der Badge entfällt: linker Rand, Balkenfüllung und Zahl.
  const accent = isPro ? "var(--pro)" : "var(--contra)";

  return (
    <div
      onClick={() => onOpen(arg.rkey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(arg.rkey);
        }
      }}
      role="button"
      tabIndex={0}
      style={{ borderLeft: `4px solid ${accent}` }}
      className={`flex cursor-pointer flex-col gap-2.5 rounded-xl border border-[var(--line)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)] ${
        rated ? "bg-white" : "bg-[var(--brand-dim)]"
      }`}
    >
      {/* Titel — grösste Ebene, Serif, das Scan-Ziel. Das Offiziell-Tag sitzt
          rechts in derselben Zeile (spart die separate Badge-Zeile, ~24px/Karte). */}
      <div className="flex items-start justify-between gap-2">
        <h4
          className="min-w-0 flex-1 text-[1.1875rem] font-normal leading-snug tracking-tight text-[var(--text)] [overflow-wrap:anywhere]"
          style={{ fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif' }}
        >
          {arg.title}
        </h4>
        {isOfficial && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="mt-0.5 inline-flex shrink-0 cursor-help items-center gap-1 text-[0.6875rem] font-semibold text-[#8a6b2b]">
                <Star className="h-3 w-3" aria-hidden />
                {trs("official")}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {trs("officialTooltip")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Bewertung: Mini-Balken macht Werte zwischen Karten vergleichbar */}
      {rated ? (
        <div
          className="flex flex-col gap-1"
          aria-label={`${tbk("yourRating")}: ${relevance}/100`}
        >
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${relevance}%`, background: accent }}
              />
            </div>
            <span
              className="shrink-0 text-[0.8125rem] font-bold tabular-nums"
              style={{ color: accent }}
            >
              {relevance}
              <span className="font-normal text-[var(--text-faint)]">/100</span>
            </span>
          </div>
          <span className="text-[0.6875rem] text-[var(--text-faint)]">
            {tbk("yourRating")}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Unsichtbarer Platzhalter in Balkenzeilen-Höhe → unbewertete Karten
              sind gleich hoch wie einzeilige bewertete; der CTA bleibt unten. */}
          <span aria-hidden className="invisible text-[0.8125rem] font-bold">
            0
          </span>
          <span className="text-[0.6875rem] font-semibold text-[var(--brand)]">
            {tbk("rateNow")}
          </span>
        </div>
      )}
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

  // Mobile (einspaltig): flache Liste in Original-`args`-Reihenfolge (Backend
  // liefert bereits „offiziell zuerst, dann geseedet gemischt"). Gleiche
  // Sichtbarkeits-Mathe wie der Desktop-Zweispalter, damit der geteilte
  // „Mehr anzeigen"-Button in beiden Layouts denselben Count zeigt.
  const visibleCount = visiblePro.length + visibleContra.length;
  const flatVisible = args.slice(0, visibleCount);
  const flatPeek =
    !expanded && args.length > visibleCount ? args[visibleCount] : null;

  // Eine Spalte: sichtbare Karten + (falls noch welche ausgeblendet sind) der
  // angeschnittene „Peek" der nächsten Karte als rein visueller Vorgeschmack.
  const renderColumn = (items: TaxonomyArgument[]) => {
    const visible = items.slice(0, cap);
    const peek = !expanded && items.length > visible.length ? items[visible.length] : null;
    return (
      <div className="flex flex-col gap-4">
        {visible.map((a) => <ArgumentCard key={a.uri} arg={a} onOpen={onOpen} />)}
        {peek && (
          // Nur im Zweispalter (md+): Peek am unteren Rand jeder Spalte. Die
          // mobile flache Liste hat ihren eigenen Peek (flatPeek).
          <div
            aria-hidden
            className="relative hidden h-[3.25rem] overflow-hidden md:block"
            style={{ maskImage: PEEK_MASK, WebkitMaskImage: PEEK_MASK }}
          >
            <div className="pointer-events-none">
              <ArgumentCard arg={peek} onOpen={() => {}} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Spaltenköpfe nur im Zweispalter — über einer flachen Einspaltigkeit
          wären zwei nebeneinanderliegende Pro/Contra-Köpfe irreführend. */}
      <div className="hidden md:block">
        <ProContraColumnHeaders proCount={pro.length} contraCount={contra.length} />
      </div>
      {/* Desktop: zwei Spalten Pro / Contra. */}
      <div className="mt-3 hidden gap-4 md:grid md:grid-cols-2">
        {renderColumn(pro)}
        {renderColumn(contra)}
      </div>
      {/* Mobile: flache Liste in Backend-Reihenfolge (offiziell zuerst, dann
          Community geseedet gemischt), ein Peek am echten Box-Ende. */}
      <div className="mt-3 flex flex-col gap-4 md:hidden">
        {flatVisible.map((a) => (
          <ArgumentCard key={a.uri} arg={a} onOpen={onOpen} />
        ))}
        {flatPeek && (
          <div
            aria-hidden
            className="relative h-[3.25rem] overflow-hidden"
            style={{ maskImage: PEEK_MASK, WebkitMaskImage: PEEK_MASK }}
          >
            <div className="pointer-events-none">
              <ArgumentCard arg={flatPeek} onOpen={() => {}} />
            </div>
          </div>
        )}
      </div>
      {hasMore && !hideShowMore && (
        <div className="mt-3 flex justify-center">
          <button type="button" className={ACTION_BTN} onClick={handleMore}>
            <ChevronDown className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {t("showMore", { count: remaining })}
            </span>
          </button>
        </div>
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
  subtopic = false,
  index,
  total,
  t,
  limit = 2,
}: {
  node: TaxonomyNode;
  onOpen: (rkey: string) => void;
  onShowMore?: () => void;
  // Optional: zeigt einen runden „+ Neues Argument"-Button auf der unteren Kante.
  onAddArgument?: () => void;
  // Im Detail-Overlay sind die Karten Unterthemen ⇒ „Mehr zum Unterthema …"
  // statt „Mehr zum Thema …".
  subtopic?: boolean;
  // Position (0-basiert) + Gesamtzahl für die Eyebrow-Zeile „THEMA 1 VON 5".
  index?: number;
  total?: number;
  t: T;
  limit?: number;
}) {
  const rated = node.ratedCount ?? 0;

  // Bottom-Aktion (nur Haupt-View, d. h. wenn onAddArgument geliefert wird):
  //  - alle Argumente sichtbar  ⇒ „Neues Argument vorschlagen" (Modal)
  //  - nicht alle (wegen Limit)  ⇒ „Mehr zum Themenfeld …" (öffnet das Overlay).
  // Gate: erst freigeben, wenn der Nutzer genügend Argumente bewertet hat. Ziel
  // sind 2 Bewertungen — hat das Thema aber nur 1 Argument, muss eben dieses 1
  // bewertet sein (sonst käme der Button bei 1 Argument fälschlich sofort).
  // 0 Argumente ⇒ kein Gate (man darf das erste Argument vorschlagen).
  const managed = !!onAddArgument;
  const proCount = node.arguments.filter((a) => a.type === "PRO").length;
  const contraCount = node.arguments.length - proCount;
  const truncated = proCount > limit || contraCount > limit;
  const ratedArgs = node.arguments.filter((a) => typeof a.viewerPreference === "number").length;
  const ratingTarget = Math.min(2, node.arguments.length);
  const needsRating = ratedArgs < ratingTarget;

  // „overlay" = Drilldown-Link in die nächste Stufe. Haupt-View (managed): nur
  // wenn gekürzt wird, sonst „+ Argument". Overlay (nicht managed): immer, sobald
  // ein onShowMore-Ziel existiert (= das Unterthema hat eigene Unterthemen) —
  // unabhängig davon, ob gekürzt wird. Blatt-Unterthemen (kein onShowMore) zeigen
  // stattdessen den inline „Mehr anzeigen"-Button aus ProContraArguments.
  const footer: "none" | "hint" | "overlay" | "add" = managed
    ? needsRating
      ? "hint"
      : truncated
        ? onShowMore
          ? "overlay"
          : "none"
        : "add"
    : onShowMore
      ? "overlay"
      : "none";
  const hasFooter = footer !== "none";

  return (
    <Card className="gap-0 overflow-hidden border-border/60 py-0 shadow-none">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-6">
        <div className="min-w-0">
          {/* Eyebrow statt doppelter Etikettierung („Thema «…»"): kleine
              Muted-Caps-Zeile, darunter der Titel in Serif ohne Guillemets. */}
          {typeof total === "number" && total > 0 && (
            <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              {t(subtopic ? "subthemeEyebrow" : "themeEyebrow", {
                index: (index ?? 0) + 1,
                total,
              })}
            </p>
          )}
          <h3
            className="truncate text-[1.0625rem] font-bold tracking-tight leading-snug"
            style={{
              fontFamily:
                'var(--font-serif), Georgia, "Times New Roman", serif',
            }}
          >
            {node.name}
          </h3>
        </div>
        <span className="mt-0.5 inline-flex shrink-0 items-center rounded-[var(--r-full)] bg-[var(--surface-up)] px-2.5 py-1 text-[0.6875rem] font-medium tabular-nums text-muted-foreground">
          {rated}/{node.argumentCount} {t("rated")}
        </span>
      </div>

      {(node.introduction || node.arguments.length > 0) && (
        <div className={`px-4 sm:px-6 ${hasFooter ? "pb-4" : "pb-5"}`}>
          {node.introduction && (
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {node.introduction}
            </p>
          )}
          {node.arguments.length > 0 && (
            <ProContraArguments
              args={node.arguments}
              onOpen={onOpen}
              // Bei Footer-Drilldown („overlay") übernimmt der Link unten das
              // Weiterblättern → inline „Mehr anzeigen" unterdrücken.
              onShowMore={footer === "overlay" ? undefined : onShowMore}
              limit={limit}
              hideShowMore={managed || footer === "overlay"}
            />
          )}
        </div>
      )}

      {/* Bottom-Zeile: zentriert unten. Hinweis (zu wenig bewertet) oder Aktion
          (beide Buttons gleich, Material-Text-Button-Stil). */}
      {hasFooter && (
        <div className="flex justify-center px-4 pb-5 sm:px-6">
          {footer === "hint" && (
            <p className="text-center text-xs leading-snug text-muted-foreground">
              {t(
                node.arguments.length === 1
                  ? "rateFirstHintOne"
                  : "rateFirstHint",
              )}
            </p>
          )}
          {footer === "add" && (
            <button type="button" onClick={onAddArgument} className={ACTION_BTN}>
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">{t("newArgument")}</span>
            </button>
          )}
          {footer === "overlay" && (
            <button type="button" onClick={onShowMore} className={ACTION_BTN}>
              <Telescope className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {t(subtopic ? "openSubtopicArea" : "openTopicArea", {
                  name: node.name,
                })}
              </span>
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
