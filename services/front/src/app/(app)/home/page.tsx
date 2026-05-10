"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { listBallots } from "@/lib/agent";
import { likeBallot, unlikeBallot } from "@/lib/ballots";
import { formatDate } from "@/lib/utils";
import type { BallotWithMetadata } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle } from "lucide-react";
import { Spinner } from "@/components/spinner";

function BallotCard({
  ballot,
  onLike,
  onClick,
}: {
  ballot: BallotWithMetadata;
  onLike: (b: BallotWithMetadata) => void;
  onClick: () => void;
}) {
  const t = useTranslations("ballots");
  return (
    <div
      className="bg-card border border-border rounded-[var(--r)] p-5 cursor-pointer card-hover"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-lg leading-tight tracking-tight">
          {ballot.record.title}
        </h3>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onLike(ballot);
          }}
          className="like-pill shrink-0 ml-2"
          data-liked={ballot.viewer?.like ? "true" : "false"}
        >
          {"\u2764"}
          {"\u00a0"}
          {ballot.likeCount ?? 0}
        </button>
      </div>

      {ballot.record.topic && (
        <span className="tag eyebrow mb-2">{ballot.record.topic}</span>
      )}

      {ballot.record.text && (
        <p className="text-[12.5px] text-[var(--text-mid)] mb-3 leading-relaxed line-clamp-3">
          {ballot.record.text}
        </p>
      )}

      <div className="flex justify-between items-center pt-3 border-t border-border">
        <span className="label">{formatDate(ballot.record.voteDate)}</span>
        <div className="flex gap-1.5">
          {(ballot.argumentCount ?? 0) > 0 && (
            <span className="tag">
              {t("arguments", { count: ballot.argumentCount ?? 0 })}
            </span>
          )}
          {(ballot.commentCount ?? 0) > 0 && (
            <span className="tag">
              <MessageCircle className="h-3 w-3" /> {ballot.commentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function BallotGrid({
  ballots,
  onLike,
  router,
}: {
  ballots: BallotWithMetadata[];
  onLike: (b: BallotWithMetadata) => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (ballots.length === 0) return null;
  return (
    <div
      className="grid"
      style={{
        gap: "var(--gap)",
        gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
      }}
    >
      {ballots.map((ballot) => {
        const rkey = ballot.uri.split("/").pop();
        return (
          <BallotCard
            key={ballot.uri}
            ballot={ballot}
            onLike={onLike}
            onClick={() => rkey && router.push(`/ballots/${rkey}`)}
          />
        );
      })}
    </div>
  );
}

export default function Home() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("ballots");
  const th = useTranslations("home");
  const tc = useTranslations("common");
  const [ballots, setBallots] = useState<BallotWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/");
      return;
    }
    loadBallots();
  }, [isAuthenticated, authLoading, router]);

  const loadBallots = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const data: BallotWithMetadata[] = await listBallots();
      setBallots(data || []);
    } catch (err) {
      console.error("Error loading ballots:", err);
      setError(err instanceof Error ? err.message : "Failed to load ballots");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLike = useCallback(
    async (ballot: BallotWithMetadata) => {
      const isLiked = !!ballot.viewer?.like;

      setBallots((prev) =>
        prev.map((b) =>
          b.uri === ballot.uri
            ? {
                ...b,
                likeCount: (b.likeCount ?? 0) + (isLiked ? -1 : 1),
                viewer: isLiked ? undefined : { like: "__pending__" },
              }
            : b
        )
      );

      try {
        if (isLiked) {
          await unlikeBallot(ballot.viewer!.like!);
          setBallots((prev) =>
            prev.map((b) =>
              b.uri === ballot.uri ? { ...b, viewer: undefined } : b
            )
          );
        } else {
          const likeUri = await likeBallot(ballot.uri, ballot.cid);
          setBallots((prev) =>
            prev.map((b) =>
              b.uri === ballot.uri ? { ...b, viewer: { like: likeUri } } : b
            )
          );
        }
      } catch (err) {
        console.error("Failed to toggle like:", err);
        setBallots((prev) =>
          prev.map((b) =>
            b.uri === ballot.uri
              ? {
                  ...b,
                  likeCount: (b.likeCount ?? 0) + (isLiked ? 1 : -1),
                  viewer: isLiked
                    ? { like: ballot.viewer!.like! }
                    : undefined,
                }
              : b
          )
        );
      }
    },
    []
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc("restoringSession")}</span>
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  const today = new Date().toISOString().split("T")[0];
  const upcoming = ballots.filter((b) => b.record.voteDate >= today);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "calc(var(--gap) * 2)",
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight pt-5">
        {th("hello", { name: user.displayName })}
      </h1>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 gap-3">
            <Spinner />
            <span className="text-muted-foreground">{t("loading")}</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>{tc("error")}:</strong> {error}
            </span>
            <Button variant="destructive" size="sm" onClick={loadBallots}>
              {tc("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !error && upcoming.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="text-muted-foreground text-lg">
              {th("noBallots")}
            </p>
            <Button variant="link" onClick={() => router.push("/ballots")}>
              {th("viewArchived")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && upcoming.length > 0 && (
        <section>
          <div className="section-bar">
            <h2>
              {t("current")}
              <span className="text-[var(--text-faint)] font-normal ml-2 text-sm">
                ({upcoming.length})
              </span>
            </h2>
          </div>
          <BallotGrid
            ballots={upcoming}
            onLike={handleToggleLike}
            router={router}
          />
        </section>
      )}
    </div>
  );
}
