"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { getBallot, getTaxonomy } from "@/lib/agent";
import { useOverlay } from "@/lib/overlay";
import type { Ballot, TaxonomyTree } from "@/types/ballots";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { ViewToggle } from "@/components/view-toggle";
import { PageBackdrop } from "@/components/page-backdrop";
import { PositionBand } from "@/components/position-band";
import { TaxonomySunburst } from "@/components/taxonomy-sunburst";
import { AddArgumentModal } from "@/components/add-argument-modal";
import { ArgumentariumHeader } from "@/components/argumentarium-header";
import {
  ProContraArguments,
  ThemeCard,
  type T,
} from "@/components/taxonomy-view";

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
  const [addOpen, setAddOpen] = useState(false);

  const openArgument = useCallback(
    (rkey: string) => navigate({ type: "argument", rkey }),
    [navigate],
  );
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

  useEffect(() => {
    void load();
  }, [load]);

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
            <span>
              <strong>{tc("error")}:</strong> {error}
            </span>
            <Button variant="destructive" size="sm" onClick={load}>
              {tc("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && !error && !root && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      )}

      {!loading && root && (
        <div className="flex flex-col gap-5">
          {root.children.map((ch) => (
            <ThemeCard
              key={ch.id}
              node={ch}
              onOpen={openArgument}
              onShowMore={ch.key ? () => openTopicDetail(ch.key!) : undefined}
              onAddArgument={() => setAddOpen(true)}
              t={t}
            />
          ))}
          {root.arguments.length > 0 && (
            <Card className="border-black/5">
              <CardContent className="pt-6">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  {t("other")}
                </p>
                <ProContraArguments
                  args={root.arguments}
                  onOpen={openArgument}
                />
              </CardContent>
            </Card>
          )}

          {/* Abschnittswechsel: von der Argument-Einsicht zur Analyse der eigenen
              Bewertungen. Bewusst ohne Karte — markiert nur den Themenwechsel. */}
          <header className="mt-6 mb-1 px-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("analysisTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("analysisSubtitle")}</p>
          </header>

          {/* Sunburst — ganze Themen-Hierarchie, gefärbt nach eigener Haltung */}
          {fullTree?.tree && (
            <TaxonomySunburst
              root={fullTree.tree}
              t={t}
              onSelect={openTopicDetail}
            />
          )}

          {/* Positionsband — Themen-Übersicht zwischen den Polen */}
          <PositionBand nodes={root.children} t={t} />
        </div>
      )}

      {ballot && (
        <AddArgumentModal
          ballotRkey={ballot.rkey}
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={load}
        />
      )}
    </div>
  );
}
