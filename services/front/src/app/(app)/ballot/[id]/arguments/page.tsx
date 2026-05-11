"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getBallot, listArguments } from "@/lib/agent";
import { likeBallot, unlikeBallot } from "@/lib/ballots";
import { formatDate } from "@/lib/utils";
import type { BallotWithMetadata, ArgumentWithMetadata } from "@/types/ballots";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";
import { ReviewStatusBadge } from "@/components/pro-contra-badge";
import { ViewToggle } from "@/components/view-toggle";

function ArgumentCard({
  arg,
  index,
  type,
  onClick,
}: {
  arg: ArgumentWithMetadata;
  index: number;
  type: "PRO" | "CONTRA";
  onClick: () => void;
}) {
  const tc = useTranslations("common");
  const borderColor = type === "PRO" ? "var(--green)" : "var(--red)";
  return (
    <div
      className="bg-card border border-border rounded-[var(--r)] p-4 cursor-pointer card-hover relative overflow-hidden animate-fade-up"
      style={{ borderLeft: `3px solid ${borderColor}` }}
      onClick={onClick}
    >
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <h4 className="text-[13.5px] font-bold leading-snug tracking-tight">
          {arg.record.title}
        </h4>
        <span className="text-[11px] font-semibold text-[var(--text-faint)] shrink-0 mt-0.5">
          #{String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-[var(--text-mid)] mb-3 line-clamp-3">
        {arg.record.body}
      </p>
      <div className="flex items-center gap-1.5">
        {(arg.commentCount ?? 0) > 0 && (
          <span className="tag">
            <MessageCircle className="h-3 w-3" /> {arg.commentCount}
          </span>
        )}
        <ReviewStatusBadge status={arg.reviewStatus} />
        <span className="ml-auto text-[11.5px] text-[var(--text-faint)] rounded-[var(--r-full)] px-2.5 py-0.5 font-medium border border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-up)] hover:text-[var(--text-mid)] transition-all cursor-pointer">
          {"\u2191"} {tc("helpful")}
        </span>
      </div>
    </div>
  );
}

export default function BallotDetail() {
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
        setBallot((prev) =>
          prev ? { ...prev, viewer: { like: likeUri } } : prev,
        );
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
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-3.5">
              {ballot.record.topic && (
                <span className="tag eyebrow">{ballot.record.topic}</span>
              )}
              <span className="label">
                {formatDate(ballot.record.voteDate)}
              </span>
            </div>

            {/* Main: title + right actions */}
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
                  {"\u2764"}
                  {"\u00a0"}
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

            {/* Ratio bar */}
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

          {/* Section bar */}
          <div
            className="section-bar animate-fade-up"
            style={{ animationDelay: "0.1s" }}
          >
            <h2>{t("arguments")}</h2>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 animate-fade-up"
            style={{ gap: "var(--gap)", animationDelay: "0.15s" }}
          >
            {/* Pro column */}
            <div
              className="flex flex-col"
              style={{ gap: "calc(var(--gap) - 6px)" }}
            >
              <div className="col-pill pro">
                <span className="eyebrow text-[var(--green)]">{tc("pro")}</span>
                <span className="text-[11px] font-medium text-[var(--green)] opacity-60">
                  {t("proArguments", { count: proArgs.length })}
                </span>
              </div>
              {proArgs.map((arg, i) => (
                <ArgumentCard
                  key={arg.uri}
                  arg={arg}
                  index={i}
                  type="PRO"
                  onClick={() =>
                    router.push(
                      `/ballot/${id}/arguments/${arg.uri.split("/").pop()}`,
                    )
                  }
                />
              ))}
              {proArgs.length === 0 && (
                <p className="text-sm text-[var(--text-mid)] px-1 py-4">
                  {t("noProArguments")}
                </p>
              )}
              <button type="button" className="btn-dashed">
                {t("addArgument")}
              </button>
            </div>

            {/* Contra column */}
            <div
              className="flex flex-col"
              style={{ gap: "calc(var(--gap) - 6px)" }}
            >
              <div className="col-pill contra">
                <span className="eyebrow text-[var(--red)]">
                  {tc("contra")}
                </span>
                <span className="text-[11px] font-medium text-[var(--red)] opacity-60">
                  {t("proArguments", { count: contraArgs.length })}
                </span>
              </div>
              {contraArgs.map((arg, i) => (
                <ArgumentCard
                  key={arg.uri}
                  arg={arg}
                  index={i}
                  type="CONTRA"
                  onClick={() =>
                    router.push(
                      `/ballot/${id}/arguments/${arg.uri.split("/").pop()}`,
                    )
                  }
                />
              ))}
              {contraArgs.length === 0 && (
                <p className="text-sm text-[var(--text-mid)] px-1 py-4">
                  {t("noContraArguments")}
                </p>
              )}
              <button type="button" className="btn-dashed">
                {t("addArgument")}
              </button>
            </div>
          </div>

          {arguments_.length === 0 && !loading && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("noArguments")}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
