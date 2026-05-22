"use client";

import { useTranslations } from "next-intl";
import { cn, formatRelativeTime } from "@/lib/utils";
import { authorName } from "@/lib/commentThread";
import { Badge } from "@/components/ui/badge";
import { CantonAvatar, BskyAvatar } from "@/components/canton-avatar";
import type { CommentWithMetadata } from "@/types/ballots";

/** Avatar for a comment — Bluesky butterfly for external, canton tile otherwise. */
export function CommentAvatar({
  comment,
  size = 28,
}: {
  comment: CommentWithMetadata;
  size?: number;
}) {
  return comment.origin === "extern" ? (
    <BskyAvatar size={size} />
  ) : (
    <CantonAvatar
      canton={comment.author.canton}
      color={comment.author.color}
      size={size}
    />
  );
}

/**
 * The body of a single comment: author header (name + Bluesky badge +
 * timestamp), text, and the like / reply action row. Layout-agnostic — the
 * caller supplies the avatar and surrounding thread structure (indent or rail).
 */
export function CommentContent({
  comment,
  focal = false,
  clamp = false,
  onLikeToggle,
  onReply,
}: {
  comment: CommentWithMetadata;
  focal?: boolean;
  clamp?: boolean;
  onLikeToggle?: (c: CommentWithMetadata) => void;
  onReply?: (uri: string) => void;
}) {
  const tc = useTranslations("common");
  const isExtern = comment.origin === "extern";
  const liked = !!comment.viewer?.like;

  return (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
        <span className="font-semibold text-foreground">
          {authorName(comment, tc)}
        </span>
        {isExtern && (
          <Badge variant="secondary" className="text-[0.6875rem] px-1.5 py-0">
            {tc("bluesky")}
          </Badge>
        )}
        <span>
          {comment.record.createdAt
            ? formatRelativeTime(comment.record.createdAt)
            : ""}
        </span>
      </div>

      <div
        className={cn(
          "leading-normal mt-0.5",
          focal ? "text-base" : "text-sm",
          clamp && "line-clamp-4",
        )}
      >
        {comment.record.body}
      </div>

      <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLikeToggle?.(comment);
          }}
          className="bg-transparent border-none p-0 cursor-pointer text-xs"
          style={{ color: liked ? "var(--brand)" : "#8e8e8e" }}
        >
          {liked ? "❤" : "♡"}{" "}
          {(comment.likeCount ?? 0) > 0 ? comment.likeCount : ""}
        </button>
        {!isExtern && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReply?.(comment.uri);
            }}
            className={cn(
              "bg-transparent border-none p-0 cursor-pointer text-xs",
              focal ? "text-primary font-semibold" : "text-muted-foreground",
            )}
          >
            {"💬"} {tc("reply")}
          </button>
        )}
      </div>
    </>
  );
}
