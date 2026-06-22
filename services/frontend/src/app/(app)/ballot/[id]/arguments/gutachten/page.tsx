"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import { getBallot, listPeerreviews } from "@/lib/agent";
import { formatRelativeTime } from "@/lib/utils";
import type { Ballot, PeerreviewListItem } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/spinner";
import { ProContraBadge } from "@/components/pro-contra-badge";
import { ArgumentariumHeader } from "@/components/argumentarium-header";
import { ViewToggle } from "@/components/view-toggle";
import { useOverlay } from "@/lib/overlay";
import { cn } from "@/lib/utils";

type Scope = "mine" | "all";

// ---------------------------------------------------------------------------
// Status badge — derives the visible state from the lifecycle + terminal
// outcome. Order matters: a finalized outcome (approved/rejected) wins over the
// lifecycle state; otherwise the grace window is called out, then plain open.
// ---------------------------------------------------------------------------

function StatusBadge({ item }: { item: PeerreviewListItem }) {
  const t = useTranslations("gutachten");

  let label: string;
  let style: React.CSSProperties;

  if (item.peerreviewStatus === "approved") {
    label = t("statusApproved");
    style = { backgroundColor: "var(--pro-dim)", color: "var(--pro)" };
  } else if (item.peerreviewStatus === "rejected") {
    label = t("statusRejected");
    style = { backgroundColor: "var(--contra-dim)", color: "var(--contra)" };
  } else if (item.state === "provisional_closed") {
    label = t("statusGrace");
    style = { backgroundColor: "#fef3c7", color: "#92400e" };
  } else {
    label = t("statusOpen");
    style = { backgroundColor: "#dbeafe", color: "#1e40af" };
  }

  return (
    <Badge className="text-xs font-semibold" style={style}>
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Role badge — why this row is in *your* list. Priority: an open review task
// (actionable) wins over "already reviewed"; authorship is the fallback. Only
// meaningful in scope='mine'; returns null when the viewer has no role.
// ---------------------------------------------------------------------------

function RoleBadge({ item }: { item: PeerreviewListItem }) {
  const t = useTranslations("gutachten");
  const isClosed = item.state === "closed";

  let label: string | null = null;
  let style: React.CSSProperties = {};

  if (item.viewerInvited && !item.viewerResponded && !isClosed) {
    label = t("roleToReview");
    style = { backgroundColor: "#ede9fe", color: "#5b21b6" }; // violet — action
  } else if (item.viewerInvited && item.viewerResponded) {
    label = t("roleReviewed");
    style = { backgroundColor: "#e5e7eb", color: "#374151" }; // neutral — done
  } else if (item.viewerIsAuthor) {
    label = t("roleAuthor");
    style = { backgroundColor: "#fef3c7", color: "#92400e" }; // amber — yours
  }

  if (!label) return null;
  return (
    <Badge className="text-xs font-semibold" style={style}>
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// One Gutachten row
// ---------------------------------------------------------------------------

function ReviewRow({
  item,
  onOpen,
}: {
  item: PeerreviewListItem;
  onOpen: (argumentUri: string) => void;
}) {
  const t = useTranslations("gutachten");
  const isClosed = item.state === "closed";
  const timestamp = isClosed ? item.closedAt : item.openedAt;

  return (
    <button
      type="button"
      onClick={() => onOpen(item.argumentUri)}
      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="flex-1 font-semibold text-sm leading-snug">
          {item.title}
        </span>
        <ProContraBadge
          type={item.type === "PRO" ? "pro" : "contra"}
          variant="soft"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <StatusBadge item={item} />
        <span>
          {item.approvals}↑ · {item.rejections}↓ · {item.totalReviews}/
          {item.quorum} {t("votes")}
        </span>
        <RoleBadge item={item} />
        {timestamp && (
          <span className="ml-auto whitespace-nowrap">
            {formatRelativeTime(timestamp)}
          </span>
        )}
      </div>
    </button>
  );
}

function ReviewSection({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: PeerreviewListItem[];
  onOpen: (argumentUri: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="sticky top-0 z-10 bg-[var(--bg)] py-2 text-sm font-semibold text-[var(--text-mid)]">
        {title} <span className="text-[var(--text-faint)]">· {items.length}</span>
      </h2>
      <div className="border rounded-lg overflow-hidden divide-y divide-border bg-[var(--surface)]">
        {items.map((item) => (
          <ReviewRow key={item.argumentUri} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function GutachtenContent() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations("gutachten");
  const tc = useTranslations("common");

  // Overlay is provided + rendered by app/(app)/layout.tsx — opening the
  // peer-review detail is just a navigate() to the `peerreview` entry, keyed by
  // the argument's AT-URI (overlay ids may contain `:` and `/`).
  const { navigate } = useOverlay();

  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [ballotLoading, setBallotLoading] = useState(true);
  const [ballotError, setBallotError] = useState("");

  const [scope, setScope] = useState<Scope>("mine");
  const [items, setItems] = useState<PeerreviewListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const openReview = useCallback(
    (argumentUri: string) => navigate({ type: "peerreview", id: argumentUri }),
    [navigate],
  );

  const loadBallot = useCallback(async () => {
    if (!id) return;
    setBallotLoading(true);
    setBallotError("");
    try {
      setBallot(await getBallot(id));
    } catch (err) {
      setBallotError(err instanceof Error ? err.message : "Failed to load ballot");
    } finally {
      setBallotLoading(false);
    }
  }, [id]);

  const loadReviews = useCallback(async () => {
    if (!id) return;
    setListLoading(true);
    setListError("");
    try {
      setItems(await listPeerreviews(id, scope));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load reviews");
    } finally {
      setListLoading(false);
    }
  }, [id, scope]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/");
      return;
    }
    loadBallot();
  }, [isAuthenticated, authLoading, router, id, loadBallot]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !id) return;
    loadReviews();
  }, [authLoading, isAuthenticated, id, scope, loadReviews]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc("restoringSession")}</span>
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  // Backend already sorts current-before-closed, newest-first within group; we
  // only split into the two visible buckets.
  const current = items.filter((i) => i.state !== "closed");
  const closed = items.filter((i) => i.state === "closed");

  // View-specific meta line: «120 Gutachten · 3 offen · 4 eigene». Counts
  // reflect the currently loaded list (i.e. the active scope). Zero counts are
  // dropped, matching the default header's behaviour.
  const ownCount = items.filter((i) => i.viewerIsAuthor).length;
  const metaItems = [
    { value: items.length, label: t("metaReviews") },
    { value: current.length, label: t("metaOpen") },
    { value: ownCount, label: t("metaOwn") },
  ].filter((m) => m.value > 0);

  return (
    <div
      className="max-w-[var(--page-max)] mx-auto pb-[35vh]"
      style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}
    >
      {ballotError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>{tc("error")}:</strong> {ballotError}
            </span>
            <Button variant="destructive" size="sm" onClick={loadBallot}>
              {tc("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!ballotLoading && ballot && (
        <div className="animate-fade-up">
          <ArgumentariumHeader
            ballot={ballot}
            actions={<ViewToggle active="gutachten" ballotId={id} />}
            intro={t("intro")}
            metaItems={metaItems}
          />
        </div>
      )}

      {/* Scope toggle: Meine / Alle */}
      <div className="flex items-center gap-1.5 px-1">
        {(["mine", "all"] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              "rounded-[var(--r-sm)] border px-3 py-1 text-sm transition-all duration-150 cursor-pointer",
              s === scope
                ? "border-[var(--line-mid)] bg-accent text-[var(--text)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-mid)] hover:bg-accent hover:border-[var(--line-mid)]",
            )}
          >
            {s === "mine" ? t("scopeMine") : t("scopeAll")}
          </button>
        ))}
      </div>

      {(ballotLoading || listLoading) && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Spinner />
          </CardContent>
        </Card>
      )}

      {listError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>{tc("error")}:</strong> {listError}
            </span>
            <Button variant="destructive" size="sm" onClick={loadReviews}>
              {tc("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!listLoading && !listError && items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p>{scope === "mine" ? t("emptyMine") : t("empty")}</p>
            {scope === "mine" && (
              <Button
                variant="link"
                size="sm"
                className="mt-1"
                onClick={() => setScope("all")}
              >
                {t("showAll")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!listLoading && !listError && items.length > 0 && (
        <div className="flex flex-col gap-5">
          <ReviewSection
            title={t("sectionCurrent")}
            items={current}
            onOpen={openReview}
          />
          <ReviewSection
            title={t("sectionClosed")}
            items={closed}
            onOpen={openReview}
          />
        </div>
      )}
    </div>
  );
}

export default function BallotPeerReviews() {
  // Overlay is provided + rendered by app/(app)/layout.tsx — pages just open
  // entries via `useOverlay().navigate(…)`. No wrapper here.
  return <GutachtenContent />;
}
