"use client";

import { cn } from "@/lib/utils";
import { ProContraBadge, ReviewStatusBadge } from "@/components/pro-contra-badge";

/**
 * Argument shown as a left-accent block: title + PRO/CONTRA badge, optional
 * body, and a like/comment-count + review-status footer. Used both as the
 * prominent header on the argument overlay and as the clickable context
 * breadcrumb above a comment thread (pass `onClick` for the latter).
 */
export function ArgumentSummary({
  title,
  body,
  type,
  likeCount,
  commentCount,
  reviewStatus,
  onClick,
  clampBody = false,
  titleClassName = "text-base",
}: {
  title: string;
  body?: string;
  type?: "PRO" | "CONTRA";
  likeCount?: number;
  commentCount?: number;
  reviewStatus?: string;
  onClick?: () => void;
  clampBody?: boolean;
  titleClassName?: string;
}) {
  const accentColor =
    type === "PRO"
      ? "var(--green)"
      : type === "CONTRA"
        ? "var(--red)"
        : "var(--border)";

  return (
    <div
      onClick={onClick}
      className={cn(
        "pl-4 pr-2 py-2 rounded-r",
        onClick && "cursor-pointer hover:bg-muted/40 transition-colors",
      )}
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      <div className="flex items-start gap-2 mb-1">
        <h3 className={cn("font-bold flex-1 leading-snug m-0", titleClassName)}>
          {title}
        </h3>
        {type && <ProContraBadge type={type.toLowerCase()} />}
        {onClick && (
          <span className="text-muted-foreground text-base leading-none mt-0.5">
            {"›"}
          </span>
        )}
      </div>
      {body && (
        <p
          className={cn(
            "text-sm text-muted-foreground leading-relaxed m-0 mb-2",
            clampBody && "line-clamp-2",
          )}
        >
          {body}
        </p>
      )}
      <div className="flex gap-4 text-xs text-muted-foreground items-center flex-wrap">
        {(likeCount ?? 0) > 0 && (
          <span>
            {"♡"} {likeCount}
          </span>
        )}
        {(commentCount ?? 0) > 0 && (
          <span>
            {"💬"} {commentCount}
          </span>
        )}
        <ReviewStatusBadge status={reviewStatus} />
      </div>
    </div>
  );
}
