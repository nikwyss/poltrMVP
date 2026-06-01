"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getBallot, listArguments } from "@/lib/agent";
import { loadCached, patchCached } from "@/lib/pageCache";
import { useScrollRestore } from "@/lib/scrollRestore";
import { formatDate } from "@/lib/utils";
import type { Ballot, ArgumentWithMetadata } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ViewToggle } from "@/components/view-toggle";
import { ProContraColumnHeaders } from "@/components/pro-contra-column-headers";
import { PageBackdrop } from "@/components/page-backdrop";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ArgumentDetailPage from "../[argRkey]/page";
import CommentDetailPage from "../feed/comment/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Section-Rail: the booklet's sections in document order. Drives both the
// rendered sections and the fixed rail bars (which sections pin top/bottom).
type SectionVariant = "official" | "community" | "evaluation";
const BOOKLET_SECTIONS: ReadonlyArray<{
  id: string;
  variant: SectionVariant;
  marker: string;
  titleKey: string;
}> = [
  {
    id: "na-sec-official",
    variant: "official",
    marker: "★",
    titleKey: "officialTitle",
  },
  {
    id: "na-sec-community",
    variant: "community",
    marker: "◐",
    titleKey: "communityTitle",
  },
  {
    id: "na-sec-evaluation",
    variant: "evaluation",
    marker: "Σ",
    titleKey: "auswertungTitle",
  },
];

// Community-Sektion: initial sichtbare Karten je Spalte; dient zugleich als
// Schrittweite für "Mehr anzeigen" (jeweils so viele weitere je Spalte).
const COMMUNITY_ARGS_PAGE_SIZE = 7;

function sourceKind(
  record: ArgumentWithMetadata["record"],
): "official" | "organization" | "user" {
  const t = record.source?.$type;
  if (t === "app.ch.poltr.ballot.argument#sourceOfficial") return "official";
  if (t === "app.ch.poltr.ballot.argument#sourceOrganization")
    return "organization";
  return "user";
}

// ---------------------------------------------------------------------------
// Expandable description — clamps to 5 lines, "mehr/weniger"-Toggle. Der
// Button erscheint nur, wenn der Text tatsächlich über 5 Zeilen hinausgeht.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ArgumentCardCompact({
  arg,
  onClick,
}: {
  arg: ArgumentWithMetadata;
  onClick: () => void;
}) {
  const tbk = useTranslations("booklet");
  const trs = useTranslations("reviewStatus");
  const type = arg.record.type;
  // Relevanz-Bewertung des Users (1–100) oder null, wenn noch nicht bewertet.
  // Bewertet/unbewertet ist die einzige Statusachse — alles daraus abgeleitet.
  const relevance = arg.viewer?.preference ?? null;
  const rated = relevance !== null;

  // Offizielle Argumente (Bundeskanzlei) durchlaufen kein Verfahren — sie werden
  // als "Offiziell" ausgewiesen, nicht mit einem Review-Status.
  const isOfficial = sourceKind(arg.record) === "official";

  // Review-Status oben rechts (z. B. "Begutachtet"). reviewStatus → i18n-Key.
  const statusKey =
    !isOfficial && arg.peerreviewStatus
      ? {
          preliminary: "preliminary",
          approved: "peerReviewed",
          rejected: "rejected",
        }[arg.peerreviewStatus]
      : null;

  return (
    <div
      className={`na-card na-card-${type.toLowerCase()} na-card-${rated ? "rated" : "unrated"}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="na-card-top">
        <div className="na-card-top-left">
          <span className="na-badge">
            {type === "PRO" ? tbk("proArgument") : tbk("contraArgument")}
          </span>
        </div>
        {rated &&
          (isOfficial ? (
            <span className="na-card-status na-card-status--official">
              {trs("official")}
            </span>
          ) : (
            statusKey && (
              <span className="na-card-status">{trs(statusKey)}</span>
            )
          ))}
      </div>

      <div className="na-card-body">
        <div className="na-card-title">{arg.record.title}</div>
        {rated && (
          <div
            className="na-card-score"
            aria-label={`${tbk("relevanceTitle")}: ${relevance}`}
          >
            <span className="na-card-index">
              {relevance}
              <span className="na-card-index-max">/100</span>
            </span>
            <span className="na-card-score-label">
              {tbk("relevanceForYou")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section shell — shared sticky-header chrome for all booklet sections.
// ---------------------------------------------------------------------------

function SectionShell({
  id,
  variant,
  marker,
  title,
  subtitle,
  colHeaders,
  children,
}: {
  id: string;
  variant: "official" | "community" | "evaluation";
  marker: string;
  title: string;
  subtitle: string;
  colHeaders?: ReactNode;
  children: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { rootMargin: "-104px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <section id={id} className={`na-section na-section-${variant}`}>
      {/* sentinel: when this leaves the viewport at 97px from top, header is sticky */}
      <div ref={sentinelRef} style={{ height: 0 }} />

      <div
        className={`na-section-sticky-header${isSticky ? " na-section-sticky-header--active" : ""}`}
      >
        <div className="na-section-header">
          <div className="na-section-marker">{marker}</div>
          <div className="na-section-title">{title}</div>
          <div className="na-section-subtitle">{subtitle}</div>
        </div>
        {colHeaders}
      </div>

      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Argument section — pro/contra columns of argument cards.
// ---------------------------------------------------------------------------

function ArgumentSection({
  id,
  variant,
  marker,
  title,
  subtitle,
  proArgs,
  contraArgs,
  onOpen,
  limit,
}: {
  id: string;
  variant: "official" | "community";
  marker: string;
  title: string;
  subtitle: string;
  proArgs: ArgumentWithMetadata[];
  contraArgs: ArgumentWithMetadata[];
  onOpen: (rkey: string) => void;
  limit?: number;
}) {
  const t = useTranslations("ballotDetail");
  const tbk = useTranslations("booklet");

  // Clientseitige Höhenbegrenzung: initial `limit` Karten je Spalte, "Mehr anzeigen"
  // blendet etappenweise je `limit` weitere ein (die Argumente sind bereits geladen).
  const [visibleCount, setVisibleCount] = useState(limit ?? Infinity);
  const cap = limit ? visibleCount : Infinity;
  const visiblePro = proArgs.slice(0, cap);
  const visibleContra = contraArgs.slice(0, cap);
  // Wie viele Karten die nächste Etappe einblenden würde (über beide Spalten, am Rest gekappt).
  const nextBatchCount = limit
    ? Math.min(proArgs.length, cap + limit) -
      visiblePro.length +
      (Math.min(contraArgs.length, cap + limit) - visibleContra.length)
    : 0;
  const hasMore = nextBatchCount > 0;

  const colHeaders = (
    <ProContraColumnHeaders
      proCount={proArgs.length}
      contraCount={contraArgs.length}
    />
  );

  return (
    <SectionShell
      id={id}
      variant={variant}
      marker={marker}
      title={title}
      subtitle={subtitle}
      colHeaders={colHeaders}
    >
      <div className="na-columns">
        <div className="na-column">
          {visiblePro.map((arg) => (
            <ArgumentCardCompact
              key={arg.uri}
              arg={arg}
              onClick={() => onOpen(arg.uri.split("/").pop()!)}
            />
          ))}
          {proArgs.length === 0 && (
            <p className="na-empty">{t("noProArguments")}</p>
          )}
        </div>
        <div className="na-column">
          {visibleContra.map((arg) => (
            <ArgumentCardCompact
              key={arg.uri}
              arg={arg}
              onClick={() => onOpen(arg.uri.split("/").pop()!)}
            />
          ))}
          {contraArgs.length === 0 && (
            <p className="na-empty">{t("noContraArguments")}</p>
          )}
        </div>
      </div>

      {hasMore && (
        <button
          type="button"
          className="na-show-more"
          onClick={() => setVisibleCount((c) => c + (limit ?? 0))}
        >
          {tbk("showMore", { count: nextBatchCount })}
        </button>
      )}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Evaluation section — placeholder for now (charts/stats come later).
// ---------------------------------------------------------------------------

function EvaluationSection({
  id,
  marker,
  title,
  subtitle,
  placeholder,
}: {
  id: string;
  marker: string;
  title: string;
  subtitle: string;
  placeholder: string;
}) {
  return (
    <SectionShell
      id={id}
      variant="evaluation"
      marker={marker}
      title={title}
      subtitle={subtitle}
    >
      <p className="na-placeholder">{placeholder}</p>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BallotDetailNewArguments() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const t = useTranslations("ballotDetail");
  const tc = useTranslations("common");
  const tbk = useTranslations("booklet");
  const tbt = useTranslations("ballotType");

  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [arguments_, setArguments] = useState<ArgumentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sticky-Section-Rail (Akkordeon): Abschnitte, an denen man vorbeigescrollt ist,
  // pinnen oben; Abschnitte unter dem Fold pinnen unten. State pro Abschnitt-Id.
  const [railState, setRailState] = useState<
    Record<string, "above" | "in" | "below">
  >({});

  // Overlay stack — encoded in the URL so browser-back and deep links work.
  // `?arg=<rkey>` is the (optional) bottom argument overlay; each `?comment=<uri>`
  // (repeatable) is a stacked comment overlay. The top entry is what's visible;
  // the entry beneath it determines the back-button label.
  const argRkeyParam = searchParams.get("arg");
  const commentChain = useMemo(
    () => searchParams.getAll("comment"),
    [searchParams],
  );
  const topCommentUri = commentChain[commentChain.length - 1] ?? null;
  const argIsTop = !!argRkeyParam && commentChain.length === 0;

  const [sheetOpen, setSheetOpen] = useState(argIsTop);
  const [displayedArgRkey, setDisplayedArgRkey] = useState<string | null>(
    argRkeyParam,
  );
  const [commentSheetOpen, setCommentSheetOpen] = useState(!!topCommentUri);
  const [displayedCommentUri, setDisplayedCommentUri] = useState<string | null>(
    topCommentUri,
  );

  const commentBackLabel =
    commentChain.length >= 2
      ? tc("backToPost")
      : argRkeyParam
        ? tc("backToArgument")
        : tc("close");

  useEffect(() => {
    if (argRkeyParam) setDisplayedArgRkey(argRkeyParam);
    if (argIsTop) {
      setSheetOpen(true);
    } else {
      setSheetOpen(false);
      if (!argRkeyParam) {
        const t = setTimeout(() => setDisplayedArgRkey(null), 350);
        return () => clearTimeout(t);
      }
    }
  }, [argRkeyParam, argIsTop]);

  useEffect(() => {
    if (topCommentUri) {
      setDisplayedCommentUri(topCommentUri);
      setCommentSheetOpen(true);
    } else {
      setCommentSheetOpen(false);
      const t = setTimeout(() => setDisplayedCommentUri(null), 350);
      return () => clearTimeout(t);
    }
  }, [topCommentUri]);

  const openArgument = useCallback(
    (rkey: string) => router.push(`?arg=${rkey}`, { scroll: false }),
    [router],
  );

  // Bewertung im Overlay vergeben → Card live aktualisieren (State) und den
  // Seiten-Cache nachziehen (für Back-Navigation / Remount), ohne Refetch.
  const handleArgRated = useCallback(
    (argUri: string, preference: number | null) => {
      const apply = (a: ArgumentWithMetadata): ArgumentWithMetadata => {
        if (a.uri !== argUri) return a;
        const viewer = { ...a.viewer };
        if (preference === null) delete viewer.preference;
        else viewer.preference = preference;
        return { ...a, viewer };
      };
      setArguments((prev) => prev.map(apply));
      patchCached<{ ballot: Ballot; args: ArgumentWithMetadata[] }>(
        `ballot:${id}`,
        (cur) => ({ ...cur, args: cur.args.map(apply) }),
      );
    },
    [id],
  );

  const openComment = useCallback(
    (uri: string) => {
      const qp = new URLSearchParams(searchParams.toString());
      qp.append("comment", uri);
      router.push(`?${qp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Header back button pops one level off the stack via browser history.
  const closeOverlay = useCallback(() => {
    router.back();
  }, [router]);

  // Clicking the backdrop (or Escape) dismisses the whole overlay stack at once.
  const closeAllOverlays = useCallback(() => {
    router.push("?", { scroll: false });
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/");
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading, router, id]);

  const loadData = async () => {
    if (!user || !id) return;
    setLoading(true);
    setError("");
    try {
      const { ballot: ballotData, args: argsData } = await loadCached(
        `ballot:${id}`,
        async () => {
          const [b, a] = await Promise.all([getBallot(id), listArguments(id)]);
          return { ballot: b, args: a };
        },
      );
      setBallot(ballotData);
      setArguments(argsData);
    } catch (err) {
      console.error("Error loading ballot detail:", err);
      setError(err instanceof Error ? err.message : "Failed to load ballot");
    } finally {
      setLoading(false);
    }
  };

  useScrollRestore(!loading && !!ballot);

  // Pinn-Zustände der Section-Rail anhand der Scroll-Position berechnen.
  useEffect(() => {
    if (loading || !ballot) return;
    const TOP = 102; // Stack-Linie unter der Sub-Nav
    const BAR_H = 40; // Höhe einer fixierten Titel-Leiste
    let raf = 0;
    const update = () => {
      raf = 0;
      const next: Record<string, "above" | "in" | "below"> = {};
      for (const sec of BOOKLET_SECTIONS) {
        const el = document.getElementById(sec.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top < TOP && r.bottom <= TOP + BAR_H) {
          // vollständig nach oben weggescrollt → Top-Rail
          next[sec.id] = "above";
        } else if (r.top > window.innerHeight - BAR_H) {
          // noch unter dem Fold → Bottom-Rail
          next[sec.id] = "below";
        } else {
          next[sec.id] = "in";
        }
      }
      setRailState((prev) => {
        // nur bei tatsächlicher Änderung neu setzen (Re-Renders sparen)
        const changed = BOOKLET_SECTIONS.some((s) => prev[s.id] !== next[s.id]);
        return changed ? next : prev;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [loading, ballot]);

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 110;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc("restoringSession")}</span>
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  // Bucket arguments by source × type
  const officialPro: ArgumentWithMetadata[] = [];
  const officialContra: ArgumentWithMetadata[] = [];
  const userPro: ArgumentWithMetadata[] = [];
  const userContra: ArgumentWithMetadata[] = [];
  for (const a of arguments_) {
    const kind = sourceKind(a.record);
    if (kind === "official") {
      (a.record.type === "PRO" ? officialPro : officialContra).push(a);
    } else {
      // organization → fall back to user bucket for now (will get its own
      // section once the org-publishing path is wired up).
      (a.record.type === "PRO" ? userPro : userContra).push(a);
    }
  }

  const proArgs = arguments_.filter((a) => a.record.type === "PRO");
  const contraArgs = arguments_.filter((a) => a.record.type === "CONTRA");
  const totalArgs = proArgs.length + contraArgs.length;
  const proPercent =
    totalArgs > 0 ? Math.round((proArgs.length / totalArgs) * 100) : 50;

  return (
    <div
      className="max-w-[var(--page-max)] mx-auto"
      style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}
    >
      <PageBackdrop src="/images/schrattenfluh.svg" />

      {/* View-Toggle (Titel steckt in der Hero-Card darunter) */}
      <nav className="flex items-center justify-end gap-2 pt-5 text-xs label">
        <ViewToggle active="booklet" ballotId={id} />
      </nav>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 gap-3">
            <Spinner />
            <span className="text-muted-foreground">{t("loadingBallot")}</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>{tc("error")}:</strong> {error}
            </span>
            <Button variant="destructive" size="sm" onClick={loadData}>
              {tc("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && ballot && (
        <>
          {/* Hero card */}
          <div className="bg-card border border-border rounded-[calc(var(--r)+6px)] px-8 py-8 md:px-11 md:py-9 animate-fade-up overflow-hidden">
            <div className="flex items-center gap-2 mb-3.5">
              <span className="label">
                {formatDate(ballot.voteDate)}
              </span>
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
                style={{
                  fontFamily:
                    'var(--font-serif), Georgia, "Times New Roman", serif',
                }}
              >
                {ballot.title}
              </h1>
              <div className="flex gap-8 shrink-0 pt-1">
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

            {ballot.description && <ExpandableText text={ballot.description} />}
          </div>

          {/* Section 1: Official */}
          <ArgumentSection
            id="na-sec-official"
            variant="official"
            marker="★"
            title={tbk("officialTitle")}
            subtitle={tbk("officialSubtitle")}
            proArgs={officialPro}
            contraArgs={officialContra}
            onOpen={openArgument}
          />

          {/* Section 2: Community */}
          <ArgumentSection
            id="na-sec-community"
            variant="community"
            marker="◐"
            title={tbk("communityTitle")}
            subtitle={tbk("communitySubtitle")}
            proArgs={userPro}
            contraArgs={userContra}
            onOpen={openArgument}
            limit={COMMUNITY_ARGS_PAGE_SIZE}
          />

          {/* Section 3: Auswertung (Platzhalter — Inhalt folgt später) */}
          <EvaluationSection
            id="na-sec-evaluation"
            marker="Σ"
            title={tbk("auswertungTitle")}
            subtitle={tbk("auswertungSubtitle")}
            placeholder={tbk("auswertungPlaceholder")}
          />

          {arguments_.length === 0 && !loading && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("noArguments")}
              </CardContent>
            </Card>
          )}

          {/* Section-Rail: vorbeigescrollte Abschnitte pinnen oben (gestapelt),
              Abschnitte unter dem Fold pinnen unten — alle klickbar zum Springen. */}
          {(() => {
            const titles: Record<string, string> = {
              "na-sec-official": tbk("officialTitle"),
              "na-sec-community": tbk("communityTitle"),
              "na-sec-evaluation": tbk("auswertungTitle"),
            };
            const above = BOOKLET_SECTIONS.filter(
              (s) => railState[s.id] === "above",
            );
            const below = BOOKLET_SECTIONS.filter(
              (s) => railState[s.id] === "below",
            );
            return (
              <>
                {above.map((s, i) => (
                  <div
                    key={s.id}
                    className="na-railbar na-railbar-top"
                    style={{ top: 102 + i * 40 }}
                  >
                    <button
                      type="button"
                      className="na-railbar-inner"
                      onClick={() => scrollToSection(s.id)}
                    >
                      <span
                        className={`na-railbar-marker na-railbar-marker-${s.variant}`}
                      >
                        {s.marker}
                      </span>
                      <span className="na-railbar-title">{titles[s.id]}</span>
                    </button>
                  </div>
                ))}
                {below.map((s, i) => (
                  <div
                    key={s.id}
                    className="na-railbar na-railbar-bottom"
                    style={{ bottom: (below.length - 1 - i) * 40 }}
                  >
                    <button
                      type="button"
                      className="na-railbar-inner"
                      onClick={() => scrollToSection(s.id)}
                    >
                      <span
                        className={`na-railbar-marker na-railbar-marker-${s.variant}`}
                      >
                        {s.marker}
                      </span>
                      <span className="na-railbar-title">{titles[s.id]}</span>
                      <span className="na-railbar-hint">↓</span>
                    </button>
                  </div>
                ))}
              </>
            );
          })()}
        </>
      )}

      <style jsx>{`
        :global(.na-section-sticky-header) {
          position: sticky;
          top: 102px;
          z-index: 4;
          background: inherit;
          padding: 8px 0 8px;
          overflow: visible;
        }
        :global(.na-section-official .na-section-sticky-header) {
          // background: transparent;
          background: var(--bg, #f9f9f8);
        }
        :global(.na-section-official .na-section-sticky-header--active) {
          background: var(--bg);
        }
        :global(.na-section-community .na-section-sticky-header) {
          background: var(--bg, #f9f9f8);
          /* unter der oben angepinnten Official-Leiste (102px) stapeln */
          top: 142px;
        }
        :global(.na-section-evaluation .na-section-sticky-header) {
          background: var(--bg, #f9f9f8);
          /* dritte Stapelebene unter Official (102) / Community (142) */
          top: 182px;
        }

        /* ── Section-Rail: fixierte, klickbare Titel-Leisten ── */
        :global(.na-railbar) {
          position: fixed;
          left: 0;
          right: 0;
          z-index: 30;
          height: 40px;
          background: var(--bg);
        }
        :global(.na-railbar-top) {
          top: 102px;
        }
        :global(.na-railbar-bottom) {
          bottom: 0;
        }
        :global(.na-railbar-inner) {
          display: flex;
          align-items: center;
          gap: 11px;
          width: 100%;
          height: 100%;
          max-width: var(--page-max);
          margin: 0 auto;
          /* an die Section-Header ausrichten: page-px + Section-Padding(14) + Header-Padding(4) */
          padding: 0 var(--page-px) 0 calc(var(--page-px) + 18px);
          background: transparent;
          border: none;
          font: inherit;
          color: var(--text);
          text-align: left;
          cursor: pointer;
        }
        :global(.na-railbar-marker) {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
        }
        /* Railbars zeigen die eingeklappte (inaktive) Sektion → gedämpft grau */
        :global(.na-railbar-marker-official),
        :global(.na-railbar-marker-community),
        :global(.na-railbar-marker-evaluation) {
          background: #888;
        }
        :global(.na-railbar-title) {
          font-size: 0.9375rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        :global(.na-railbar-hint) {
          margin-left: auto;
          color: var(--text-faint);
          font-size: 0.875rem;
        }
        /* fade only when sticky is active */
        :global(.na-section-sticky-header--active::after) {
          content: "";
          position: absolute;
          bottom: -24px;
          left: 0;
          right: 0;
          height: 24px;
          pointer-events: none;
          z-index: 3;
        }
        :global(.na-section-official .na-section-sticky-header--active::after) {
          background: linear-gradient(
            to bottom,
            var(--bg, #f9f9f8),
            rgba(249, 249, 248, 0)
          );
          // background: linear-gradient(to bottom, var(--bg), transparent);
        }
        :global(
          .na-section-community .na-section-sticky-header--active::after
        ) {
          background: linear-gradient(
            to bottom,
            var(--bg, #f9f9f8),
            rgba(249, 249, 248, 0)
          );
        }
        :global(
          .na-section-evaluation .na-section-sticky-header--active::after
        ) {
          background: linear-gradient(
            to bottom,
            var(--bg, #f9f9f8),
            rgba(249, 249, 248, 0)
          );
        }

        :global(.na-section) {
          margin-top: 6px;
          border-radius: 10px;
          padding: 18px 14px 20px;
        }
        :global(.na-section-official) {
          background: transparent;
          // position: relative;
          // background: transparent;
          // padding-top: 132px;
        }
        :global(.na-section-community) {
          background: transparent;
        }
        :global(.na-section-evaluation) {
          background: transparent;
        }

        :global(.na-section-header) {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 18px;
          padding: 0 4px;
        }
        :global(.na-section-marker) {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
        }
        /* Section-Header zeigt die aktive (expandierte) Sektion → farbig */
        :global(.na-section-official .na-section-marker) {
          background: #8a6b2b;
        }
        :global(.na-section-community .na-section-marker) {
          background: #5a6b8a;
        }
        :global(.na-section-evaluation .na-section-marker) {
          background: #4a7a5a;
        }
        :global(.na-section-title) {
          font-size: 0.9375rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        :global(.na-section-official .na-section-title) {
          color: #8a6b2b;
        }
        :global(.na-section-community .na-section-title) {
          color: #5a6b8a;
        }
        :global(.na-section-evaluation .na-section-title) {
          color: #4a7a5a;
        }
        :global(.na-section-subtitle) {
          font-size: 0.75rem;
          color: #888;
          margin-left: auto;
        }

        :global(.na-columns) {
          display: grid;
          /* minmax(0, 1fr) statt 1fr: verhindert, dass eine lange, nicht umbrechbare
             Überschrift (z. B. "Versorgungssicherheit") die Spalte über ihren Anteil
             hinaus aufbläht und rechts über den Rand schiebt. */
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
          position: relative;
          z-index: 1;
        }
        :global(.na-column) {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        :global(.na-empty) {
          font-size: 0.875rem;
          color: #888;
          padding: 8px 4px;
        }
        :global(.na-placeholder) {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          font-size: 0.875rem;
          color: #888;
          text-align: center;
          border: 1px dashed var(--line);
          border-radius: 10px;
        }
        :global(.na-show-more) {
          width: 100%;
          margin-top: 12px;
          padding: 10px 0;
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 7px;
          font: inherit;
          font-size: 0.875rem;
          font-weight: 600;
          color: #5a6b8a;
          cursor: pointer;
          transition:
            background 0.15s ease,
            border-color 0.15s ease;
        }
        :global(.na-show-more:hover) {
          border-color: var(--line-mid);
          background: #fff;
        }

        /* Würdevolle Card: großzügig, zweizeilig, Serif-Titel, Index als Wasserzeichen */
        :global(.na-card) {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 11px;
          background: #fff;
          border: 1px solid var(--line);
          border-left: 5px solid var(--line);
          border-radius: 12px;
          padding: 16px 20px 18px;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            border-color 0.15s ease,
            opacity 0.15s ease;
        }
        :global(.na-card:hover) {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.07);
        }
        :global(.na-card-top) {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        :global(.na-card-top-left) {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        /* Ungelesen-Marker: kleiner Punkt in der Argumentfarbe (Pro grün / Contra rot) */
        // :global(.na-dot) {
        //   width: 9px;
        //   height: 9px;
        //   border-radius: 50%;
        //   background: #b8862b;
        //   flex-shrink: 0;
        //   box-shadow: 0 0 0 3px rgba(184, 134, 43, 0.14);
        // }
        // :global(.na-card-pro .na-dot) {
        //   background: var(--pro);
        //   box-shadow: 0 0 0 3px color-mix(in srgb, var(--pro) 16%, transparent);
        // }
        // :global(.na-card-contra .na-dot) {
        //   background: var(--contra);
        //   box-shadow: 0 0 0 3px
        //     color-mix(in srgb, var(--contra) 16%, transparent);
        // }
        :global(.na-card-title) {
          position: relative;
          z-index: 1;
          font-family: var(--font-serif), Georgia, "Times New Roman", serif;
          font-size: 1.25rem;
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -0.01em;
        }

        /* Review-Status oben rechts (dezenter Text, z. B. "Begutachtet") */
        :global(.na-card-status) {
          flex-shrink: 0;
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          color: var(--text-faint);
        }
        /* Offiziell-Marker: Bernstein/Gold, passend zur ★-Official-Sektion */
        :global(.na-card-status--official) {
          font-weight: 700;
          color: #8a6b2b;
        }

        /* Inhalt: Titel links, persönliche Bewertung unten rechts */
        :global(.na-card-body) {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }
        :global(.na-card-body .na-card-title) {
          flex: 1;
          min-width: 0;
          overflow-wrap: break-word;
        }
        /* Persönliche Relevanz-Bewertung unten rechts (Zahl in Argumentfarbe + Label) */
        :global(.na-card-score) {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          line-height: 1;
        }
        :global(.na-card-index) {
          /* Sans (erbt von der Card) — passt zu den "111/159"-Zählern oben;
             die Farbe (grün/rot) trägt hier den Charakter. */
          font-family: inherit;
          font-size: 1.875rem;
          font-weight: 700;
          line-height: 0.9;
          color: var(--text);
          user-select: none;
          white-space: nowrap;
        }
        /* "/100" als zurückgenommener Nenner an der Score-Zahl */
        :global(.na-card-index-max) {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-faint);
        }
        :global(.na-card-pro .na-card-index) {
          color: var(--pro);
        }
        :global(.na-card-contra .na-card-index) {
          color: var(--contra);
        }
        :global(.na-card-score-label) {
          margin-top: 5px;
          font-size: 0.625rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-faint);
        }

        /* Pro/Contra-Badge + Farbe auf dem linken Balken */
        :global(.na-badge) {
          flex-shrink: 0;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 3px 10px;
          border-radius: var(--r-full, 999px);
        }
        :global(.na-card-pro) {
          border-left-color: var(--pro);
        }
        :global(.na-card-pro .na-badge) {
          background: var(--pro-dim);
          color: var(--pro);
        }
        :global(.na-card-contra) {
          border-left-color: var(--contra);
        }
        :global(.na-card-contra .na-badge) {
          background: var(--contra-dim);
          color: var(--contra);
        }

        /* Unbewertet → warmer Pergament-/Creme-Ton: hebt offene Argumente ab, ohne zu
           schreien, und passt zum Serif-Dossier. Goldpunkt + fetter, dunkler Titel. */
        :global(.na-card-unrated) {
          background: #fff7edfc;
          border-top-color: #ecddbb;
          border-right-color: #ecddbb;
          border-bottom-color: #ecddbb;
        }
        :global(.na-card-unrated .na-card-title) {
          font-weight: 700;
          color: var(--text);
        }
        /* Bewertet → Titel leichter, damit Unbewertetes von selbst heraussticht */
        :global(.na-card-rated .na-card-title) {
          font-weight: 500;
        }

        /* Mobile: collapse to single column, interleave PRO/CONTRA */
        @media (max-width: 640px) {
          :global(.na-columns-header) {
            display: none;
          }
          :global(.na-columns) {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          :global(.na-column) {
            display: contents;
          }
          :global(.na-column:first-child .na-card:nth-child(1)) {
            order: 1;
          }
          :global(.na-column:last-child .na-card:nth-child(1)) {
            order: 2;
          }
          :global(.na-column:first-child .na-card:nth-child(2)) {
            order: 3;
          }
          :global(.na-column:last-child .na-card:nth-child(2)) {
            order: 4;
          }
          :global(.na-column:first-child .na-card:nth-child(3)) {
            order: 5;
          }
          :global(.na-column:last-child .na-card:nth-child(3)) {
            order: 6;
          }
          :global(.na-column:first-child .na-card:nth-child(4)) {
            order: 7;
          }
          :global(.na-column:last-child .na-card:nth-child(4)) {
            order: 8;
          }
          :global(.na-column:first-child .na-card:nth-child(5)) {
            order: 9;
          }
          :global(.na-column:last-child .na-card:nth-child(5)) {
            order: 10;
          }
          :global(.na-column:first-child .na-card:nth-child(6)) {
            order: 11;
          }
          :global(.na-column:last-child .na-card:nth-child(6)) {
            order: 12;
          }
        }
      `}</style>

      {/* Argument detail overlay — hidden while a comment overlay is on top */}
      <Dialog
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeAllOverlays();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-4xl w-full h-[92vh] p-0 bg-transparent border-0 shadow-none"
        >
          {displayedArgRkey && (
            <ArgumentDetailPage
              isOverlay
              onClose={closeOverlay}
              argRkeyOverride={displayedArgRkey}
              onNavigateToComment={openComment}
              onRated={handleArgRated}
              backLabel={tc("close")}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Comment detail overlay */}
      <Dialog
        open={commentSheetOpen}
        onOpenChange={(open) => {
          if (!open) closeAllOverlays();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-4xl w-full h-[92vh] overflow-y-auto p-0 flex flex-col gap-0 bg-[#fff8ef] rounded-2xl shadow-[0_30px_70px_-20px_rgba(45,35,22,0.45)]"
        >
          {displayedCommentUri && (
            <CommentDetailPage
              isOverlay
              onClose={closeOverlay}
              commentUriOverride={displayedCommentUri}
              onNavigateToComment={openComment}
              onNavigateToArgument={openArgument}
              backLabel={commentBackLabel}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
