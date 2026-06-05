"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ChevronRight, ChevronDown } from "lucide-react";
import { getBallot, getTaxonomy } from "@/lib/agent";
import { useOverlay } from "@/lib/overlay";
import type { Ballot, TaxonomyTree, TaxonomyNode } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { ViewToggle } from "@/components/view-toggle";
import { PageBackdrop } from "@/components/page-backdrop";
import { PositionBand } from "@/components/position-band";
import { BallotHeader } from "@/components/ballot-header";
import {
  getInsight,
  InsightPanel,
  ProContraArguments,
  type T,
} from "@/components/taxonomy-view";

// ---------------------------------------------------------------------------
// Haupt-Themenblock als Card (farbcodiert, zugeklappt by default). In der flachen
// Main-View hat ein Top-Topic keine Unterknoten — alle Argumente seines Teilbaums
// hängen direkt hier. „Mehr anzeigen" öffnet das Detail-Overlay des Topics.
// ---------------------------------------------------------------------------
function ThemeCard({
  node,
  onOpen,
  onShowMore,
  t,
}: {
  node: TaxonomyNode;
  onOpen: (rkey: string) => void;
  onShowMore?: () => void;
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const ins = getInsight(node, t);
  const rated = node.ratedCount ?? 0;
  return (
    <Card
      className="overflow-hidden border-black/5"
      style={{ borderLeft: `4px solid ${ins.bar}`, backgroundColor: ins.bg }}
    >
      {/* Kopf = breiter Klick-Trigger zum Aufklappen (nur Name + Badge). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-black/[0.03]"
      >
        <div className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
          <span className="truncate text-lg font-semibold">{node.name}</span>
        </div>
        <span className="shrink-0 rounded-full border border-black/10 bg-white/70 px-2.5 py-0.5 text-xs text-muted-foreground">
          {rated} / {node.argumentCount} {t("rated")}
        </span>
      </button>

      {/* Aufgeklappt: Beschreibung, „Für dich"-Panel, Argumente. */}
      {open && (
        <CardContent className="pt-0">
          {node.description && (
            <p className="mb-3 text-sm text-muted-foreground">{node.description}</p>
          )}
          <InsightPanel node={node} t={t} />
          {node.arguments.length > 0 && (
            <div className="mt-3 mb-2">
              <ProContraArguments args={node.arguments} onOpen={onOpen} onShowMore={onShowMore} />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Seite
// ---------------------------------------------------------------------------
export default function TaxonomyPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = useLocale();
  const t = useTranslations("taxonomy") as T;
  const tc = useTranslations("common");
  const { navigate } = useOverlay();

  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [tax, setTax] = useState<TaxonomyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const openArgument = useCallback((rkey: string) => navigate({ type: "argument", rkey }), [navigate]);
  // „Mehr anzeigen" eines Top-Topics → Detail-Overlay (Subtopics + alle Argumente).
  const openTopicDetail = useCallback(
    (topic: string) => navigate({ type: "taxonomy", ballotRkey: id, topic }),
    [navigate, id],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, tx] = await Promise.all([getBallot(id, locale), getTaxonomy(id, locale)]);
      setBallot(b);
      setTax(tx);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, locale]);

  useEffect(() => { void load(); }, [load]);

  const root = tax?.tree;

  return (
    <div className="space-y-5 pb-[35vh]">
      <PageBackdrop src="/images/kleinemythe.svg" />
      <nav className="flex items-center justify-end text-sm text-muted-foreground">
        <ViewToggle active="taxonomy" ballotId={id} />
      </nav>

      {ballot && <BallotHeader ballot={ballot} />}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-10">
            <Spinner />
            <span className="text-muted-foreground">{t("loading")}</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span><strong>{tc("error")}:</strong> {error}</span>
            <Button variant="destructive" size="sm" onClick={load}>{tc("retry")}</Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !error && !root && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      )}

      {!loading && root && (
        <div className="flex flex-col gap-3">
          {root.children.map((ch) => (
            <ThemeCard
              key={ch.id}
              node={ch}
              onOpen={openArgument}
              onShowMore={ch.key ? () => openTopicDetail(ch.key!) : undefined}
              t={t}
            />
          ))}
          {root.arguments.length > 0 && (
            <Card className="border-black/5">
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium text-muted-foreground">{t("other")}</p>
                <ProContraArguments args={root.arguments} onOpen={openArgument} />
              </CardContent>
            </Card>
          )}

          {/* Positionsband — Themen-Übersicht zwischen den Polen */}
          <PositionBand nodes={root.children} t={t} />
        </div>
      )}
    </div>
  );
}
