"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { listBallots } from "@/lib/agent";
import { formatDate } from "@/lib/utils";
import type { Ballot } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle } from "lucide-react";
import { Spinner } from "@/components/spinner";

function BallotCard({
  ballot,
  onClick,
}: {
  ballot: Ballot;
  onClick: () => void;
}) {
  const t = useTranslations("ballots");
  return (
    <div
      className="bg-card border border-border rounded-[var(--r)] p-5 cursor-pointer card-hover"
      onClick={onClick}
    >
      <h3 className="font-bold text-lg leading-tight tracking-tight mb-2">
        {ballot.title}
      </h3>

      {ballot.topic && (
        <span className="tag eyebrow mb-2">{ballot.topic}</span>
      )}

      {ballot.description && (
        <p className="text-[0.78125rem] text-[var(--text-mid)] mb-3 leading-relaxed line-clamp-3">
          {ballot.description}
        </p>
      )}

      <div className="flex justify-between items-center pt-3 border-t border-border">
        <span className="label">{formatDate(ballot.voteDate)}</span>
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
  router,
}: {
  ballots: Ballot[];
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
      {ballots.map((ballot) => (
        <BallotCard
          key={ballot.rkey}
          ballot={ballot}
          onClick={() => router.push(`/ballot/${ballot.rkey}/arguments`)}
        />
      ))}
    </div>
  );
}

export default function BallotSearch() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("ballots");
  const tc = useTranslations("common");
  const [ballots, setBallots] = useState<Ballot[]>([]);
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
      const ballots: Ballot[] = await listBallots();
      setBallots(ballots || []);
    } catch (err) {
      console.error("Error loading ballots:", err);
      setError(err instanceof Error ? err.message : "Failed to load ballots");
    } finally {
      setLoading(false);
    }
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

  const today = new Date().toISOString().split("T")[0];
  const upcoming = ballots.filter((b) => b.voteDate >= today);
  const archived = ballots.filter((b) => b.voteDate < today);

  return (
    <div
      className=""
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "calc(var(--gap) * 2)",
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight pt-5">{t("title")}</h1>

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

      {!loading && !error && ballots.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-lg">{t("noneFound")}</p>
          </CardContent>
        </Card>
      )}

      {!loading && ballots.length > 0 && (
        <>
          {/* Upcoming */}
          <section>
            <div className="section-bar">
              <h2>
                {t("current")}
                {upcoming.length > 0 && (
                  <span className="text-[var(--text-faint)] font-normal ml-2 text-sm">
                    ({upcoming.length})
                  </span>
                )}
              </h2>
            </div>
            {upcoming.length > 0 ? (
              <BallotGrid ballots={upcoming} router={router} />
            ) : (
              <div
                className="grid"
                style={{
                  gap: "var(--gap)",
                  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                }}
              >
                <p className="text-sm text-[var(--text-mid)] py-10">
                  {t("noCurrent")}
                </p>
              </div>
            )}
          </section>

          {/* Archived */}
          <section>
            <div className="section-bar">
              <h2>
                {t("archived")}
                {archived.length > 0 && (
                  <span className="text-[var(--text-faint)] font-normal ml-2 text-sm">
                    ({archived.length})
                  </span>
                )}
              </h2>
            </div>
            {archived.length > 0 ? (
              <BallotGrid ballots={archived} router={router} />
            ) : (
              <p className="text-sm text-[var(--text-mid)]">
                {t("noArchived")}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
