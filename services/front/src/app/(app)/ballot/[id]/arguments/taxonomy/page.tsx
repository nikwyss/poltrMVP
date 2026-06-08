"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
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
import { TaxonomySunburst } from "@/components/taxonomy-sunburst";
import { ArgumentariumHeader } from "@/components/argumentarium-header";
import {
  getInsight,
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
  const ins = getInsight(node, t);
  const rated = node.ratedCount ?? 0;
  return (
    <Card
      className="gap-0 overflow-hidden border-border/60 py-0 shadow-none"
      style={{ borderLeft: `3px solid ${ins.bar}` }}
    >
      {/* Kopf — Name + dezenter Bewertungs-Zähler (statisch, immer offen). */}
      <div className="flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-2.5">
        <h3 className="truncate text-base font-semibold tracking-tight">{node.name}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {rated}/{node.argumentCount} {t("rated")}
        </span>
      </div>

      {(node.introduction || node.arguments.length > 0) && (
        <div className="px-5 pb-4">
          {node.introduction && (
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{node.introduction}</p>
          )}
          {node.arguments.length > 0 && (
            <ProContraArguments args={node.arguments} onOpen={onOpen} onShowMore={onShowMore} limit={3} />
          )}
        </div>
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
  // Voller verschachtelter Baum (alle Ebenen) — nur fürs Sunburst.
  const [fullTree, setFullTree] = useState<TaxonomyTree | null>(null);
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
      const [b, tx, full] = await Promise.all([
        getBallot(id, locale),
        getTaxonomy(id, locale),
        getTaxonomy(id, locale, undefined, "full"),
      ]);
      setBallot(b);
      setTax(tx);
      setFullTree(full);
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

      {ballot && <ArgumentariumHeader ballot={ballot} />}

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

          {/* Sunburst — ganze Themen-Hierarchie, gefärbt nach eigener Haltung */}
          {fullTree?.tree && (
            <TaxonomySunburst root={fullTree.tree} t={t} onSelect={openTopicDetail} />
          )}
        </div>
      )}
    </div>
  );
}
