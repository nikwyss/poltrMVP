"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getBallot, listArguments } from "@/lib/agent";
import { loadCached } from "@/lib/pageCache";
import { useScrollRestore } from "@/lib/scrollRestore";
import { formatDate } from "@/lib/utils";
import type {
  BallotWithMetadata,
  ArgumentWithMetadata,
} from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ViewToggle } from "@/components/view-toggle";
import { ProContraBadge } from "@/components/pro-contra-badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import ArgumentDetailPage from "../[argRkey]/page";
import CommentDetailPage from "../feed/comment/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourceKind(record: ArgumentWithMetadata["record"]): "official" | "organization" | "user" {
  const t = record.source?.$type;
  if (t === "app.ch.poltr.ballot.argument#sourceOfficial") return "official";
  if (t === "app.ch.poltr.ballot.argument#sourceOrganization") return "organization";
  return "user";
}

type AttributionLabels = {
  bundesrat: string;
  initiativkomitee: string;
  organization: string;
  anonymous: string;
};

function attributionLine(
  arg: ArgumentWithMetadata,
  kind: "official" | "organization" | "user",
  labels: AttributionLabels,
): string {
  if (kind === "official") {
    const section =
      arg.record.source && "section" in arg.record.source ? arg.record.source.section : undefined;
    if (section) return section;
    return arg.record.type === "PRO" ? labels.bundesrat : labels.initiativkomitee;
  }
  if (kind === "organization") {
    const orgKey =
      arg.record.source && "orgKey" in arg.record.source ? arg.record.source.orgKey : undefined;
    return orgKey ? orgKey : labels.organization;
  }
  return arg.author?.displayName || labels.anonymous;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ArgumentCardCompact({
  arg,
  kind,
  onClick,
}: {
  arg: ArgumentWithMetadata;
  kind: "official" | "organization" | "user";
  onClick: () => void;
}) {
  const tc = useTranslations("common");
  const trs = useTranslations("reviewStatus");
  const tbk = useTranslations("booklet");
  const tf = useTranslations("feed");
  const type = arg.record.type;
  const labels: AttributionLabels = {
    bundesrat: tbk("fallbackBundesrat"),
    initiativkomitee: tbk("fallbackInitiativkomitee"),
    organization: tbk("fallbackOrganization"),
    anonymous: tc("anonymous"),
  };

  return (
    <div
      className={`na-card na-card-${type.toLowerCase()}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="na-card-header">
        <div className="na-card-title">{arg.record.title}</div>
        <ProContraBadge type={type.toLowerCase()} />
      </div>
      <div className="na-card-body">{arg.record.body}</div>
      <div className="na-card-footer">
        <span>
          {kind === "user"
            ? trs("preliminary")
            : attributionLine(arg, kind, labels)}
        </span>
        <span className="na-helpful">
          {/* {"↑"} {(arg.likeCount ?? 0)} {tc("helpful")} */}
          {(arg.commentCount ?? 0) > 0 && (
            // <> ·</>
            <> {tf("comments", { count: arg.commentCount ?? 0 })}</>
          )}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
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
}: {
  id: string;
  variant: "official" | "community";
  marker: string;
  title: string;
  subtitle: string;
  proArgs: ArgumentWithMetadata[];
  contraArgs: ArgumentWithMetadata[];
  onOpen: (rkey: string) => void;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("ballotDetail");
  const kind: "official" | "user" = variant === "official" ? "official" : "user";
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


      <div className={`na-section-sticky-header${isSticky ? " na-section-sticky-header--active" : ""}`}>
        <div className="na-section-header">
          <div className="na-section-marker">{marker}</div>
          <div className="na-section-title">{title}</div>
          <div className="na-section-subtitle">{subtitle}</div>
        </div>

        <div className="na-section-col-headers">
          <div className="na-section-col-label na-section-col-pro">
            <span>{tc("pro")}</span>
            <span className="na-col-count">{proArgs.length}</span>
          </div>
          <div className="na-section-col-label na-section-col-contra">
            <span>{tc("contra")}</span>
            <span className="na-col-count">{contraArgs.length}</span>
          </div>
        </div>
      </div>

      <div className="na-columns">
        <div className="na-column">
          {proArgs.map((arg) => (
            <ArgumentCardCompact
              key={arg.uri}
              arg={arg}
              kind={kind}
              onClick={() => onOpen(arg.uri.split("/").pop()!)}
            />
          ))}
          {proArgs.length === 0 && (
            <p className="na-empty">{t("noProArguments")}</p>
          )}
        </div>
        <div className="na-column">
          {contraArgs.map((arg) => (
            <ArgumentCardCompact
              key={arg.uri}
              arg={arg}
              kind={kind}
              onClick={() => onOpen(arg.uri.split("/").pop()!)}
            />
          ))}
          {contraArgs.length === 0 && (
            <p className="na-empty">{t("noContraArguments")}</p>
          )}
        </div>
      </div>
    </section>
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
  const tb = useTranslations("ballots");
  const tc = useTranslations("common");
  const tbk = useTranslations("booklet");

  const [ballot, setBallot] = useState<BallotWithMetadata | null>(null);
  const [arguments_, setArguments] = useState<ArgumentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sticky-Section-Rail (Akkordeon): Official pinnt oben, sobald man daran vorbeiscrollt;
  // Community ist am unteren Rand angepinnt, solange sie unter dem Fold liegt.
  const [officialPinned, setOfficialPinned] = useState(false);
  const [communityBelow, setCommunityBelow] = useState(false);

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
          const [b, a] = await Promise.all([
            getBallot(id),
            listArguments(id),
          ]);
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
      const off = document.getElementById("na-sec-official");
      const com = document.getElementById("na-sec-community");
      if (off) {
        const r = off.getBoundingClientRect();
        // Official ist „vorbeigescrollt", sobald sein unteres Ende die Stack-Linie erreicht.
        setOfficialPinned(r.top < TOP && r.bottom <= TOP + BAR_H);
      }
      if (com) {
        const r = com.getBoundingClientRect();
        setCommunityBelow(r.top > window.innerHeight - BAR_H);
      }
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
              {ballot.record.topic && (
                <span className="tag eyebrow">{ballot.record.topic}</span>
              )}
              <span className="label">{formatDate(ballot.record.voteDate)}</span>
            </div>

            <div className="flex justify-between items-start gap-6 mb-5">
              <h1 className="text-4xl md:text-[2.75rem] font-bold tracking-tight leading-[0.92]">
                {ballot.record.title}
              </h1>
              <div className="flex flex-col items-end gap-2.5 shrink-0">
                <div className="flex gap-1.5">
                  {(ballot.argumentCount ?? 0) > 0 && (
                    <span className="tag">
                      {tb("arguments", { count: ballot.argumentCount ?? 0 })}
                    </span>
                  )}
                  {(ballot.commentCount ?? 0) > 0 && (
                    <span className="tag">
                      {tb("comments", { count: ballot.commentCount ?? 0 })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {ballot.record.text && (
              <p className="text-sm text-[var(--text-mid)] leading-relaxed mb-5 max-w-2xl">
                {ballot.record.text}
              </p>
            )}

            {totalArgs > 0 && (
              <div className="mt-1">
                <div className="flex justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--pro)]">
                    <span className="inline-block size-[7px] rounded-sm bg-[var(--pro)]" />
                    {tc("pro")} — {proArgs.length}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--contra)]">
                    {tc("contra")} — {contraArgs.length}
                    <span className="inline-block size-[7px] rounded-sm bg-[var(--contra)]" />
                  </div>
                </div>
                <div className="h-[5px] rounded-[var(--r-full)] bg-[var(--surface-up)] border border-border overflow-hidden flex">
                  <div
                    className="h-full rounded-l-[var(--r-full)] bg-[var(--pro)] transition-all duration-500"
                    style={{ width: `${proPercent}%` }}
                  />
                  <div
                    className="h-full rounded-r-[var(--r-full)] bg-[var(--contra)] transition-all duration-500"
                    style={{ width: `${100 - proPercent}%` }}
                  />
                </div>
              </div>
            )}
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
          />

          {arguments_.length === 0 && !loading && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("noArguments")}
              </CardContent>
            </Card>
          )}

          {/* Section-Rail: Official oben angepinnt, während man in Community liest */}
          {officialPinned && (
            <div className="na-railbar na-railbar-top">
              <button
                type="button"
                className="na-railbar-inner"
                onClick={() => scrollToSection("na-sec-official")}
              >
                <span className="na-railbar-marker na-railbar-marker-official">★</span>
                <span className="na-railbar-title">{tbk("officialTitle")}</span>
              </button>
            </div>
          )}
          {/* Community am unteren Rand angepinnt, solange unter dem Fold — klickbar zum Springen */}
          {communityBelow && (
            <div className="na-railbar na-railbar-bottom">
              <button
                type="button"
                className="na-railbar-inner"
                onClick={() => scrollToSection("na-sec-community")}
              >
                <span className="na-railbar-marker na-railbar-marker-community">◐</span>
                <span className="na-railbar-title">{tbk("communityTitle")}</span>
                <span className="na-railbar-hint">↓</span>
              </button>
            </div>
          )}
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
        :global(.na-railbar-marker-community) {
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
        :global(.na-section-col-headers) {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 8px;
        }
        :global(.na-section-col-label) {
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 0.78125rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        :global(.na-section-col-pro) {
          background: var(--pro-dim);
          color: var(--pro);
          border: 1px solid var(--pro-border);
        }
        :global(.na-section-col-contra) {
          background: var(--contra-dim);
          color: var(--contra);
          border: 1px solid var(--contra-border);
        }

        /* fade only when sticky is active */
        :global(.na-section-sticky-header--active::after) {
          content: '';
          position: absolute;
          bottom: -24px;
          left: 0;
          right: 0;
          height: 24px;
          pointer-events: none;
          z-index: 3;
        }
        :global(.na-section-official .na-section-sticky-header--active::after) {
          background: linear-gradient(to bottom, var(--bg, #f9f9f8), rgba(249,249,248,0));
          // background: linear-gradient(to bottom, var(--bg), transparent);
        }
        :global(.na-section-community .na-section-sticky-header--active::after) {
          background: linear-gradient(to bottom, var(--bg, #f9f9f8), rgba(249,249,248,0));
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
        :global(.na-section-subtitle) {
          font-size: 0.75rem;
          color: #888;
          margin-left: auto;
        }

        :global(.na-columns) {
          display: grid;
          grid-template-columns: 1fr 1fr;
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

        :global(.na-card) {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 7px;
          padding: 12px 14px;
          cursor: pointer;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            border-color 0.15s ease;
        }
        :global(.na-card:hover) {
          transform: translateY(-1px);
          border-color: var(--line-mid);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 2px 10px rgba(0, 0, 0, 0.05);
        }
        :global(.na-card-header) {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
          padding-bottom: 9px;
          border-bottom: 1px solid var(--line);
          gap: 8px;
        }
        :global(.na-card-title) {
          font-size: 1rem;
          font-weight: 600;
          line-height: 1.3;
          flex: 1;
        }
        :global(.na-card-body) {
          font-size: 0.9375rem;
          color: #555;
          line-height: 1.5;
          margin-bottom: 10px;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        :global(.na-card-footer) {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8125rem;
          color: #888;
          padding-top: 8px;
          border-top: 1px solid var(--line);
        }
        :global(.na-helpful) {
          color: #555;
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

          /* Pro/Contra dot before title since column header is hidden */
          :global(.na-card-title::before) {
            content: "";
            display: inline-block;
            width: 7px;
            height: 7px;
            border-radius: 50%;
            margin-right: 7px;
            vertical-align: middle;
            transform: translateY(-1px);
          }
          :global(.na-card-pro .na-card-title::before) {
            background: var(--pro);
          }
          :global(.na-card-contra .na-card-title::before) {
            background: var(--contra);
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
          className="sm:max-w-4xl w-full h-[92vh] overflow-y-auto p-0 flex flex-col gap-0"
        >
          {displayedArgRkey && (
            <ArgumentDetailPage
              isOverlay
              onClose={closeOverlay}
              argRkeyOverride={displayedArgRkey}
              onNavigateToComment={openComment}
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
          className="sm:max-w-4xl w-full h-[92vh] overflow-y-auto p-0 flex flex-col gap-0"
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
