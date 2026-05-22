"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/AuthContext";
import {
  getBallot,
  listActivity,
  markActivitySeen,
  createArgument,
} from "@/lib/agent";
import { loadCached } from "@/lib/pageCache";
import { useScrollRestore } from "@/lib/scrollRestore";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { BallotWithMetadata, ActivityItem } from "@/types/ballots";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/spinner";
import { ProContraBadge } from "@/components/pro-contra-badge";

import { ViewToggle } from "@/components/view-toggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ArgumentDetailPage from "@/app/(app)/ballot/[id]/arguments/[argRkey]/page";
import CommentDetailPage from "@/app/(app)/ballot/[id]/arguments/feed/comment/page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Add Argument Modal (using Dialog)
// ---------------------------------------------------------------------------

function AddArgumentModal({
  ballotUri,
  open,
  onOpenChange,
  onCreated,
}: {
  ballotUri: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("feed");
  const tc = useTranslations("common");
  const [argType, setArgType] = useState<"PRO" | "CONTRA">("PRO");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await createArgument(ballotUri, title.trim(), body.trim(), argType);
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create argument",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addArgument")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {(["PRO", "CONTRA"] as const).map((typ) => {
              const selected = argType === typ;
              const isPro = typ === "PRO";
              return (
                <Button
                  key={typ}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  className={`flex-1 ${selected ? (isPro ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700") : ""}`}
                  onClick={() => setArgType(typ)}
                >
                  {isPro ? tc("pro") : tc("contra")}
                </Button>
              );
            })}
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
          />

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("yourArgument")}
            rows={5}
          />

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !body.trim() || submitting}
          >
            {submitting ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Feed layout helpers
// ---------------------------------------------------------------------------

interface ActivityCardProps {
  item: ActivityItem;
  onNavigate: (item: ActivityItem) => void;
}

function ContextAvatar({ displayName }: { displayName?: string }) {
  const initial = (displayName || "?")[0].toUpperCase();
  return (
    <div
      className="relative z-[1] flex items-center justify-center rounded-full shrink-0"
      style={{
        width: 36,
        height: 36,
        backgroundColor: "#93c5fd",
        color: "#1e3a8a",
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {initial}
    </div>
  );
}

function FocalAvatar({ canton, color }: { canton?: string; color?: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0 text-white font-bold"
      style={{
        width: 40,
        height: 40,
        backgroundColor: color || "#f472b6",
        fontSize: 13,
      }}
    >
      {canton ? canton.toUpperCase().slice(0, 2) : "?"}
    </div>
  );
}

function ArgumentHeader({
  title,
  type,
  approved,
}: {
  title: string;
  type?: "PRO" | "CONTRA";
  approved?: boolean;
}) {
  const isPro = type === "PRO";
  return (
    <div className="px-4 pt-1.5 pb-0 flex items-center gap-2">
      {approved && (
        <span className="text-sm leading-none shrink-0">&#9989;</span>
      )}
      <span className="text-xs font-semibold flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
        {title}
      </span>
      {type && <ProContraBadge type={isPro ? "pro" : "contra"} />}
    </div>
  );
}

function ThreadSkippedRow() {
  const t = useTranslations("feed");
  return (
    <div className="px-4 py-0 flex gap-3">
      <div className="w-10 shrink-0 flex flex-col items-center">
        <div
          className="flex-1 ml-px"
          style={{ borderLeft: "2px dashed #d1d5db" }}
        />
      </div>
      <div className="text-xs text-muted-foreground self-center pt-3 pb-3">
        &middot;&middot;&middot;{" "}
        <span className="text-blue-600 hover:underline">
          {t("viewFullThread")}
        </span>
      </div>
    </div>
  );
}

function ThreadContextRow({
  displayName,
  text,
  likeCount,
  replyCount,
}: {
  displayName?: string;
  text: string;
  likeCount?: number;
  replyCount?: number;
}) {
  const tc = useTranslations("common");
  return (
    <div className="px-4 py-0 flex gap-3">
      <div className="w-10 shrink-0 relative flex flex-col items-center">
        <div
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
          style={{ width: 2, backgroundColor: "#d1d5db" }}
        />
        <ContextAvatar displayName={displayName} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-muted-foreground mb-0.5">
          {displayName || tc("anonymous")}
        </div>
        <div className="text-sm text-muted-foreground leading-normal break-words pb-1.5">
          {text}
        </div>
        <div className="flex items-center gap-5 pb-3">
          <span className="text-xs text-muted-foreground">
            {"\ud83d\udcac"} {replyCount ?? 0}
          </span>
          <span className="text-xs text-muted-foreground">
            {"\u2661"} {likeCount ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}

function FocalRow({
  actor,
  text,
  timestamp,
  replyTo,
  unseen,
}: {
  actor: ActivityItem["actor"];
  text: string;
  timestamp: string;
  replyTo?: string;
  unseen?: boolean;
}) {
  const t = useTranslations("feed");
  const tc = useTranslations("common");
  return (
    <div className="px-4 py-0 flex gap-3">
      <FocalAvatar canton={actor.canton} color={actor.color} />
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-2 flex-wrap"
          style={{ marginBottom: replyTo ? 4 : 6 }}
        >
          <span className="font-bold text-sm">
            {actor.displayName || tc("anonymous")}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(timestamp)}
          </span>
          {unseen && (
            <span
              className="inline-block rounded-full shrink-0 bg-blue-500"
              style={{ width: 7, height: 7 }}
            />
          )}
        </div>
        {replyTo && (
          <div className="text-xs text-blue-600 mb-1.5 font-medium">
            {t("replyingTo", { name: replyTo })}
          </div>
        )}
        <div className="text-sm leading-normal break-words pb-1.5">{text}</div>
      </div>
    </div>
  );
}

function ActionBar({
  likeCount,
  commentCount,
  argumentLike,
}: {
  likeCount?: number;
  commentCount?: number;
  argumentLike?: string;
}) {
  const tc = useTranslations("common");
  return (
    <div
      className="mb-3 flex items-center gap-5"
      style={{ paddingLeft: 68, paddingRight: 16 }}
    >
      <span className="text-xs text-muted-foreground">
        {"\ud83d\udcac"} {commentCount ?? 0}
      </span>
      <span
        className="text-xs"
        style={{ color: argumentLike ? "#dc2626" : "#6b7280" }}
      >
        {argumentLike ? "\u2764" : "\u2661"} {likeCount ?? 0}
      </span>
      {argumentLike && (
        <span className="text-xs text-green-800 font-semibold">
          {"\u2713"} {tc("voted")}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity cards
// ---------------------------------------------------------------------------

function CommentActivityCard({ item, onNavigate }: ActivityCardProps) {
  const unseen = !item.viewer?.seen;
  return (
    <div
      onClick={() => onNavigate(item)}
      className="cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <ArgumentHeader title={item.argument.title} type={item.argument.type} />
      <FocalRow
        actor={item.actor}
        text={item.comment?.text ?? ""}
        timestamp={item.activityAt}
        unseen={unseen}
      />
      <ActionBar
        likeCount={item.comment?.likeCount}
        commentCount={item.comment?.replyCount}
        argumentLike={item.viewer?.argumentLike}
      />
    </div>
  );
}

function ReplyActivityCard({ item, onNavigate }: ActivityCardProps) {
  const unseen = !item.viewer?.seen;
  return (
    <div
      onClick={() => onNavigate(item)}
      className="cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <ArgumentHeader title={item.argument.title} type={item.argument.type} />
      {item.parent?.hasParent && <ThreadSkippedRow />}
      {item.parent && (
        <ThreadContextRow
          displayName={item.parent.displayName}
          text={item.parent.text}
          likeCount={item.parent.likeCount}
          replyCount={item.parent.replyCount}
        />
      )}
      <FocalRow
        actor={item.actor}
        text={item.comment?.text ?? ""}
        timestamp={item.activityAt}
        replyTo={item.parent?.displayName}
        unseen={unseen}
      />
      <ActionBar
        likeCount={item.comment?.likeCount}
        commentCount={item.comment?.replyCount}
        argumentLike={item.viewer?.argumentLike}
      />
    </div>
  );
}

function NewArgumentActivityCard({ item, onNavigate }: ActivityCardProps) {
  const tc = useTranslations("common");
  const unseen = !item.viewer?.seen;
  const isPro = item.argument.type === "PRO";
  const preview = item.argument.body
    ? item.argument.body.slice(0, 200) +
      (item.argument.body.length > 200 ? "\u2026" : "")
    : "";

  return (
    <div
      onClick={() => onNavigate(item)}
      className="cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <div className="px-4 py-0 flex gap-3">
        <FocalAvatar canton={item.actor.canton} color={item.actor.color} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-bold text-sm">
              {item.actor.displayName || tc("anonymous")}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(item.activityAt)}
            </span>
            {unseen && (
              <span
                className="inline-block rounded-full shrink-0"
                style={{ width: 7, height: 7, backgroundColor: "#0277bd" }}
              />
            )}
          </div>
          <div
            className="flex items-start gap-2"
            style={{ marginBottom: preview ? 8 : 0 }}
          >
            <span className="font-bold text-sm flex-1 leading-snug">
              {item.argument.title}
            </span>
            {item.argument.type && (
              <ProContraBadge type={isPro ? "pro" : "contra"} />
            )}
          </div>
          {preview && (
            <div className="text-sm text-muted-foreground leading-normal">
              {preview}
            </div>
          )}
          <div className="pb-3" />
        </div>
      </div>
      <ActionBar
        likeCount={item.argument.likeCount}
        commentCount={item.argument.commentCount}
        argumentLike={item.viewer?.argumentLike}
      />
    </div>
  );
}

function MilestoneActivityCard({ item, onNavigate }: ActivityCardProps) {
  const t = useTranslations("feed");
  const unseen = !item.viewer?.seen;
  return (
    <div
      onClick={() => onNavigate(item)}
      className="cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <ArgumentHeader
        title={item.argument.title}
        type={item.argument.type}
        approved
      />
      <div className="px-4 py-0 flex items-center gap-3">
        <div className="w-10 shrink-0" />
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs font-semibold text-green-800">
            {"\ud83c\udf89"} {t("communityApproved")}
          </span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {formatRelativeTime(item.activityAt)}
        </span>
        {unseen && (
          <span
            className="inline-block rounded-full shrink-0"
            style={{ width: 7, height: 7, backgroundColor: "#e65100" }}
          />
        )}
      </div>
    </div>
  );
}

function ActivityFeed({
  activities,
  onNavigate,
}: {
  activities: ActivityItem[];
  onNavigate: (item: ActivityItem) => void;
}) {
  if (activities.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden divide-y divide-border">
      {activities.map((item) => {
        const props: ActivityCardProps = { item, onNavigate };
        switch (item.type) {
          case "comment":
            return <CommentActivityCard key={item.activityUri} {...props} />;
          case "reply":
            return <ReplyActivityCard key={item.activityUri} {...props} />;
          case "new_argument":
            return (
              <NewArgumentActivityCard key={item.activityUri} {...props} />
            );
          case "milestone":
            return <MilestoneActivityCard key={item.activityUri} {...props} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BallotFeed() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const t = useTranslations("feed");
  const tc = useTranslations("common");

  const [ballot, setBallot] = useState<BallotWithMetadata | null>(null);
  const [ballotLoading, setBallotLoading] = useState(true);
  const [ballotError, setBallotError] = useState("");

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filter, setFilter] = useState<"all" | "comments" | "arguments">("all");
  const [showAddModal, setShowAddModal] = useState(false);

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

  // The argument overlay is only the visible top when no comment sits above it.
  const argIsTop = !!argRkeyParam && commentChain.length === 0;

  const [sheetOpen, setSheetOpen] = useState(argIsTop);
  const [displayedArgRkey, setDisplayedArgRkey] = useState<string | null>(argRkeyParam);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [commentSheetOpen, setCommentSheetOpen] = useState(!!topCommentUri);
  const [displayedCommentUri, setDisplayedCommentUri] = useState<string | null>(
    topCommentUri,
  );
  const commentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Label for the visible overlay's back button: reflects the view revealed on
  // close — an argument, another post, or (nothing left) just "close".
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
        closeTimerRef.current = setTimeout(() => setDisplayedArgRkey(null), 350);
      }
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [argRkeyParam, argIsTop]);

  useEffect(() => {
    if (topCommentUri) {
      setDisplayedCommentUri(topCommentUri);
      setCommentSheetOpen(true);
    } else {
      setCommentSheetOpen(false);
      commentCloseTimerRef.current = setTimeout(
        () => setDisplayedCommentUri(null),
        350,
      );
    }
    return () => {
      if (commentCloseTimerRef.current)
        clearTimeout(commentCloseTimerRef.current);
    };
  }, [topCommentUri]);

  const openArgument = useCallback(
    (rkey: string) => {
      router.push(`?arg=${rkey}`, { scroll: false });
    },
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
    loadBallot();
  }, [isAuthenticated, authLoading, router, id]);

  const loadBallot = useCallback(async () => {
    if (!id) return;
    setBallotLoading(true);
    setBallotError("");
    try {
      const ballotData = await loadCached(`feed:ballot:${id}`, () =>
        getBallot(id),
      );
      setBallot(ballotData);
    } catch (err) {
      setBallotError(
        err instanceof Error ? err.message : "Failed to load ballot",
      );
    } finally {
      setBallotLoading(false);
    }
  }, [id]);

  const loadActivities = useCallback(
    async (selectedFilter: "all" | "comments" | "arguments", reset = true) => {
      if (!id) return;
      if (reset) {
        setActivityLoading(true);
        setActivityError("");
      } else {
        setLoadingMore(true);
      }

      try {
        const currentCursor = reset ? undefined : cursor;
        const result = reset
          ? await loadCached(
              `feed:activity:${id}:${selectedFilter}`,
              () => listActivity(id, selectedFilter, undefined),
            )
          : await listActivity(id, selectedFilter, currentCursor);
        if (reset) {
          setActivities(result.activities);
        } else {
          setActivities((prev) => [...prev, ...result.activities]);
        }
        setCursor(result.cursor ?? undefined);
        setHasMore(!!result.cursor);
      } catch (err) {
        setActivityError(
          err instanceof Error ? err.message : "Failed to load activity",
        );
      } finally {
        setActivityLoading(false);
        setLoadingMore(false);
      }
    },
    [id, cursor],
  );

  useEffect(() => {
    if (!isAuthenticated || authLoading || !id) return;
    setCursor(undefined);
    loadActivities(filter, true);
  }, [filter, isAuthenticated, authLoading, id]);

  const handleCardClick = useCallback(
    (item: ActivityItem) => {
      markActivitySeen([item.activityUri]).catch(console.error);
      setActivities((acts) =>
        acts.map((a) =>
          a.activityUri === item.activityUri
            ? { ...a, viewer: { ...a.viewer, seen: true } }
            : a,
        ),
      );
      // Comment/reply activities open the comment overlay directly; argument
      // and milestone activities open the argument overlay.
      if (
        (item.type === "comment" || item.type === "reply") &&
        item.comment?.uri
      ) {
        openComment(item.comment.uri);
      } else {
        openArgument(item.argument.rkey);
      }
    },
    [openArgument, openComment],
  );

  useScrollRestore(!ballotLoading && !activityLoading && !!ballot);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] gap-3">
        <Spinner />
        <span className="text-muted-foreground">{tc("restoringSession")}</span>
      </div>
    );
  }
  if (!isAuthenticated || !user) return null;

  const emptyMessage: Record<string, string> = {
    all: t("noActivity"),
    comments: t("noCommentActivity"),
    arguments: t("noArgumentActivity"),
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb + view toggle */}
      <nav className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-foreground font-medium truncate">
            {ballot?.record.title ?? "..."}
          </span>
        </div>
        <ViewToggle active="feed" ballotId={id} />
      </nav>

      {/* Ballot loading / error */}
      {ballotLoading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 gap-3">
            <Spinner />
            <span className="text-muted-foreground">{t("loadingBallot")}</span>
          </CardContent>
        </Card>
      )}

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
        <>
          {/* Ballot card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-4">
                <h1 className="m-0 text-2xl font-bold">
                  {ballot.record.title}
                </h1>
                {ballot.record.language && (
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge variant="secondary">{ballot.record.language}</Badge>
                  </div>
                )}
              </div>

              {ballot.record.topic && (
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>{t("topic")}</strong> {ballot.record.topic}
                </p>
              )}

              {ballot.record.text && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {ballot.record.text}
                </p>
              )}

              <Separator className="my-4" />

              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  <strong>{t("voteDate")}</strong>{" "}
                  {formatDate(ballot.record.voteDate)}
                </div>
                {ballot.record.officialRef && (
                  <span className="text-xs text-muted-foreground">
                    {t("ref")} {ballot.record.officialRef}
                  </span>
                )}
              </div>

              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                {(ballot.argumentCount ?? 0) > 0 && (
                  <span>
                    {t("arguments", { count: ballot.argumentCount ?? 0 })}
                  </span>
                )}
                {(ballot.commentCount ?? 0) > 0 && (
                  <span>
                    {t("comments", { count: ballot.commentCount ?? 0 })}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="border-b border-border my-5" />

          {/* Activity toolbar */}
          <div className="sticky top-24 z-10 bg-card rounded-lg px-4 py-2.5 shadow-sm flex items-center justify-between gap-3 border">
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as typeof filter)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allActivity")}</SelectItem>
                <SelectItem value="arguments">
                  {t("argumentsFilter")}
                </SelectItem>
                <SelectItem value="comments">{t("commentsFilter")}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setShowAddModal(true)}
            >
              {t("plusArgument")}
            </Button>
          </div>

          {/* Activity error */}
          {activityError && (
            <Alert variant="destructive">
              <AlertDescription>{activityError}</AlertDescription>
            </Alert>
          )}

          {/* Activity feed */}
          <div className="max-w-xl mx-auto">
            {activityLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-10 gap-3">
                  <Spinner />
                  <span className="text-muted-foreground">
                    {t("loadingActivity")}
                  </span>
                </CardContent>
              </Card>
            ) : activities.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  {emptyMessage[filter]}
                </CardContent>
              </Card>
            ) : (
              <>
                <ActivityFeed
                  activities={activities}
                  onNavigate={handleCardClick}
                />
                {hasMore && (
                  <div className="text-center py-2 pb-4">
                    <Button
                      variant="outline"
                      onClick={() => loadActivities(filter, false)}
                      disabled={loadingMore}
                    >
                      {loadingMore ? tc("loading") : t("loadMore")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Mobile FAB */}
      {!ballotLoading && ballot && (
        <Button
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full text-3xl shadow-lg z-20 sm:hidden"
          size="icon"
        >
          +
        </Button>
      )}

      {/* Add argument dialog */}
      {ballot && (
        <AddArgumentModal
          ballotUri={ballot.uri}
          open={showAddModal}
          onOpenChange={setShowAddModal}
          onCreated={() => loadActivities(filter, true)}
        />
      )}

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
