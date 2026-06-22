"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getPeerreviewStatus } from "@/lib/agent";
import type { PeerreviewStatus } from "@/types/ballots";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/spinner";

// Peer-review (Gutachten) detail overlay.
//
// TODO: This is a STUB. It shows the lifecycle state + vote counts for the
// argument's peer review. The full detail view (criteria breakdown, individual
// reviews, check-in / submit flow — see the /review dashboard) will be wired up
// in a follow-up. The overlay stack / back / scroll already work; only this
// body grows.
//
// `argumentUri` is the overlay entry id (full AT-URI; overlay ids may contain
// `:` and `/`). We fetch status by it so the overlay survives refresh / sharing
// without depending on the list page's in-memory data.
export function PeerReviewDetail({
  argumentUri,
  onClose,
  backLabel,
  registerScrollContainer,
}: {
  argumentUri: string;
  onClose: () => void;
  backLabel: string;
  registerScrollContainer: (el: HTMLElement | null) => void;
}) {
  const t = useTranslations("gutachten");
  const tc = useTranslations("common");

  const [status, setStatus] = useState<PeerreviewStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getPeerreviewStatus(argumentUri)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [argumentUri]);

  return (
    <div
      ref={registerScrollContainer}
      className="h-full overflow-y-auto flex flex-col bg-[#fff8ef] rounded-2xl shadow-[0_30px_70px_-20px_rgba(45,35,22,0.45)]"
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#fff8ef]/95 backdrop-blur-sm border-b flex items-center px-5 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="text-base leading-none">←</span>
          {backLabel}
        </button>
      </div>

      {/* Scrolling content */}
      <div className="px-5 py-5 space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              <strong>{tc("error")}:</strong> {error}
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && status && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("statusOpen")}</dt>
              <dd className="font-semibold">{status.peerreviewStatus}</dd>
              <dt className="text-muted-foreground">{t("votes")}</dt>
              <dd className="font-semibold">
                {status.approvals}↑ · {status.rejections}↓ ·{" "}
                {status.totalReviews}/{status.quorum}
              </dd>
            </dl>

            <p className="text-sm text-muted-foreground italic">
              {t("detailTodo")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PeerReviewDetail;
