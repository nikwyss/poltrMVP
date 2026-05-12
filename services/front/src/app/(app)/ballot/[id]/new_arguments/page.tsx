"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getBallot, listArguments } from "@/lib/agent";
import { likeBallot, unlikeBallot } from "@/lib/ballots";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourceKind(record: ArgumentWithMetadata["record"]): "official" | "organization" | "user" {
  const t = record.source?.$type;
  if (t === "app.ch.poltr.ballot.argument#sourceOfficial") return "official";
  if (t === "app.ch.poltr.ballot.argument#sourceOrganization") return "organization";
  return "user";
}

/**
 * Render the "byline" beneath the title. For curated content this names
 * the upstream source (Bundesrat / Initiativkomitee, or org slug); for user
 * arguments this is the pseudonym.
 */
function attributionLine(
  arg: ArgumentWithMetadata,
  kind: "official" | "organization" | "user",
): string {
  if (kind === "official") {
    // Heuristic: leaflet sections name PRO sources "Bundesrat (& Parlament)"
    // and CONTRA sources "Initiativkomitee" / "Referendumskomitee". Prefer the
    // section text from the lexicon when present.
    const section =
      arg.record.source && "section" in arg.record.source ? arg.record.source.section : undefined;
    if (section) return `— ${section}`;
    return arg.record.type === "PRO"
      ? "— Bundesrat"
      : "— Initiativkomitee";
  }
  if (kind === "organization") {
    const orgKey =
      arg.record.source && "orgKey" in arg.record.source ? arg.record.source.orgKey : undefined;
    return orgKey ? `— ${orgKey}` : "— Organisation";
  }
  // user
  const name = arg.author?.displayName || "anonym";
  return `@${name.toLowerCase().replace(/\s+/g, "_")}`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ArgumentCardCompact({
  arg,
  index,
  kind,
  onClick,
}: {
  arg: ArgumentWithMetadata;
  index: number;
  kind: "official" | "organization" | "user";
  onClick: () => void;
}) {
  const tc = useTranslations("common");
  const type = arg.record.type;

  return (
    <div
      className={`na-card na-card-${type.toLowerCase()}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="na-card-header">
        <div className="na-card-title">{arg.record.title}</div>
        <div className="na-card-number">
          #{String(index + 1).padStart(2, "0")}
        </div>
      </div>
      <div className="na-card-author">{attributionLine(arg, kind)}</div>
      <div className="na-card-body">{arg.record.body}</div>
      <div className="na-card-footer">
        <span>
          {kind === "user" ? tc("preliminary") || "Vorläufig" : ""}
          {kind !== "user" ? "Offiziell" : ""}
        </span>
        <span className="na-helpful">
          {"↑"} {(arg.likeCount ?? 0)} {tc("helpful")}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

function ArgumentSection({
  variant,
  marker,
  title,
  subtitle,
  proArgs,
  contraArgs,
  ballotId,
}: {
  variant: "official" | "community";
  marker: string;
  title: string;
  subtitle: string;
  proArgs: ArgumentWithMetadata[];
  contraArgs: ArgumentWithMetadata[];
  ballotId: string;
}) {
  const router = useRouter();
  const kind: "official" | "user" = variant === "official" ? "official" : "user";

  const open = (uri: string) =>
    router.push(`/ballot/${ballotId}/arguments/${uri.split("/").pop()}`);

  return (
    <section className={`na-section na-section-${variant}`}>
      <div className="na-section-header">
        <div className="na-section-marker">{marker}</div>
        <div className="na-section-title">{title}</div>
        <div className="na-section-subtitle">{subtitle}</div>
      </div>

      <div className="na-columns">
        <div className="na-column">
          {proArgs.map((arg, i) => (
            <ArgumentCardCompact
              key={arg.uri}
              arg={arg}
              index={i}
              kind={kind}
              onClick={() => open(arg.uri)}
            />
          ))}
          {proArgs.length === 0 && (
            <p className="na-empty">Keine PRO-Argumente.</p>
          )}
        </div>
        <div className="na-column">
          {contraArgs.map((arg, i) => (
            <ArgumentCardCompact
              key={arg.uri}
              arg={arg}
              index={i}
              kind={kind}
              onClick={() => open(arg.uri)}
            />
          ))}
          {contraArgs.length === 0 && (
            <p className="na-empty">Keine CONTRA-Argumente.</p>
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
  const id = params.id as string;
  const t = useTranslations("ballotDetail");
  const tb = useTranslations("ballots");
  const tc = useTranslations("common");

  const [ballot, setBallot] = useState<BallotWithMetadata | null>(null);
  const [arguments_, setArguments] = useState<ArgumentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      const [ballotData, argsData] = await Promise.all([
        getBallot(id),
        listArguments(id),
      ]);
      setBallot(ballotData);
      setArguments(argsData);
    } catch (err) {
      console.error("Error loading ballot detail:", err);
      setError(err instanceof Error ? err.message : "Failed to load ballot");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLike = useCallback(async () => {
    if (!ballot) return;
    const isLiked = !!ballot.viewer?.like;

    setBallot((prev) =>
      prev
        ? {
            ...prev,
            likeCount: (prev.likeCount ?? 0) + (isLiked ? -1 : 1),
            viewer: isLiked ? undefined : { like: "__pending__" },
          }
        : prev,
    );

    try {
      if (isLiked) {
        await unlikeBallot(ballot.viewer!.like!);
        setBallot((prev) => (prev ? { ...prev, viewer: undefined } : prev));
      } else {
        const likeUri = await likeBallot(ballot.uri, ballot.cid);
        setBallot((prev) => (prev ? { ...prev, viewer: { like: likeUri } } : prev));
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
      setBallot((prev) =>
        prev
          ? {
              ...prev,
              likeCount: (prev.likeCount ?? 0) + (isLiked ? 1 : -1),
              viewer: isLiked ? { like: ballot.viewer!.like! } : undefined,
            }
          : prev,
      );
    }
  }, [ballot]);

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
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 pt-5 text-xs label">
        <span className="text-[var(--text)] font-semibold truncate">
          {ballot?.record.title ?? "..."}
        </span>
        <div className="ml-auto">
          <ViewToggle active="columns" ballotId={id} />
        </div>
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
              <h1 className="text-4xl md:text-[44px] font-bold tracking-tight leading-[0.92]">
                {ballot.record.title}
              </h1>
              <div className="flex flex-col items-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  className="like-pill"
                  data-liked={ballot.viewer?.like ? "true" : "false"}
                >
                  {"❤"}
                  {" "}
                  {ballot.likeCount ?? 0}
                </button>
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
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--green)]">
                    <span className="inline-block size-[7px] rounded-sm bg-[var(--green)]" />
                    {tc("pro")} — {proArgs.length}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--red)]">
                    {tc("contra")} — {contraArgs.length}
                    <span className="inline-block size-[7px] rounded-sm bg-[var(--red)]" />
                  </div>
                </div>
                <div className="h-[5px] rounded-[var(--r-full)] bg-[var(--surface-up)] border border-border overflow-hidden flex">
                  <div
                    className="h-full rounded-l-[var(--r-full)] bg-[var(--green)] transition-all duration-500"
                    style={{ width: `${proPercent}%` }}
                  />
                  <div
                    className="h-full rounded-r-[var(--r-full)] bg-[var(--red)] transition-all duration-500"
                    style={{ width: `${100 - proPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sticky Pro/Contra column header */}
          <div className="na-columns-header">
            <div className="na-col-label na-col-pro">
              <span>{tc("pro")}</span>
              <span className="na-col-count">{proArgs.length}</span>
            </div>
            <div className="na-col-label na-col-contra">
              <span>{tc("contra")}</span>
              <span className="na-col-count">{contraArgs.length}</span>
            </div>
          </div>

          {/* Section 1: Official */}
          <ArgumentSection
            variant="official"
            marker="★"
            title="Offizielle Argumente"
            subtitle="aus dem Abstimmungsbüchlein der Bundeskanzlei"
            proArgs={officialPro}
            contraArgs={officialContra}
            ballotId={id}
          />

          {/* Section 2: Community */}
          <ArgumentSection
            variant="community"
            marker="◐"
            title="Community"
            subtitle="Argumente von Userinnen und Usern"
            proArgs={userPro}
            contraArgs={userContra}
            ballotId={id}
          />

          {arguments_.length === 0 && !loading && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("noArguments")}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <style jsx>{`
        :global(.na-columns-header) {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          position: sticky;
          top: 0;
          z-index: 5;
        }
        :global(.na-col-label) {
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        :global(.na-col-pro) {
          background: #ecf6f0;
          color: #2d8659;
          border: 1px solid #c5e2d2;
        }
        :global(.na-col-contra) {
          background: #fbedef;
          color: #b8455a;
          border: 1px solid #f0cdd3;
        }
        :global(.na-col-count) {
          font-weight: 500;
          font-size: 11px;
          opacity: 0.8;
        }

        :global(.na-section) {
          margin-top: 6px;
          border-radius: 10px;
          padding: 14px 14px 16px;
        }
        :global(.na-section-official) {
          background: #f4ede0;
          border: 1px solid #e8dcc1;
        }
        :global(.na-section-community) {
          background: transparent;
          border: 1px dashed #e5e3de;
        }

        :global(.na-section-header) {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          padding: 0 4px;
        }
        :global(.na-section-marker) {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
        }
        :global(.na-section-official .na-section-marker) {
          background: #8a6b2b;
        }
        :global(.na-section-community .na-section-marker) {
          background: #888;
        }
        :global(.na-section-title) {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        :global(.na-section-official .na-section-title) {
          color: #8a6b2b;
        }
        :global(.na-section-subtitle) {
          font-size: 11px;
          color: #888;
          margin-left: auto;
        }

        :global(.na-columns) {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        :global(.na-column) {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        :global(.na-empty) {
          font-size: 12px;
          color: #888;
          padding: 8px 4px;
        }

        :global(.na-card) {
          background: white;
          border: 1px solid #e5e3de;
          border-radius: 8px;
          padding: 12px 14px;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            border-color 0.15s ease;
        }
        :global(.na-card:hover) {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        :global(.na-section-official .na-card) {
          border-left: 3px solid #8a6b2b;
        }
        :global(.na-card-pro) {
          border-top: 2px solid #c5e2d2;
        }
        :global(.na-card-contra) {
          border-top: 2px solid #f0cdd3;
        }
        :global(.na-card-header) {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 4px;
          gap: 8px;
        }
        :global(.na-card-title) {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.3;
          flex: 1;
        }
        :global(.na-card-number) {
          font-size: 10px;
          color: #888;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        :global(.na-card-author) {
          font-size: 11px;
          color: #888;
          margin-bottom: 6px;
          font-style: italic;
        }
        :global(.na-card-body) {
          font-size: 12px;
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
          font-size: 11px;
          color: #888;
          padding-top: 8px;
          border-top: 1px solid #e5e3de;
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
            background: #2d8659;
          }
          :global(.na-card-contra .na-card-title::before) {
            background: #b8455a;
          }
        }
      `}</style>
    </div>
  );
}
