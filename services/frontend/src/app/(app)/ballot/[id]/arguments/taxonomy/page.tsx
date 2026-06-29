"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { getBallot } from "@/lib/agent";
import { useTaxonomyBase, useTaxonomyFull } from "@/lib/queries/taxonomy";
import { useRatingGate } from "@/lib/queries/rating-gate";
import { usePeerReviewNotifications } from "@/lib/queries/peer-review-notifications";
import { useOverlay } from "@/lib/overlay";
import { ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { ViewToggle } from "@/components/view-toggle";
// import { PageBackdrop } from "@/components/page-backdrop";
import { TaxonomyArrows } from "@/components/taxonomy-arrows";
import { TaxonomySunburst } from "@/components/taxonomy-sunburst";
import { LockedSection, GatePlaceholder } from "@/components/locked-section";
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
  const tpr = useTranslations("peerReview.banner");
  const { navigate } = useOverlay();

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

  // Ballot + Taxonomie aus dem zentralen Query-Cache. Eine Bewertung im Overlay
  // patcht die `["taxonomy", id, …]`-Einträge (siehe useArgumentRatingCache),
  // sodass die Karten hier ohne Refetch live aktualisieren.
  const enabled = !!id;
  const {
    data: ballot = null,
    isPending: ballotPending,
    error: ballotError,
    refetch: refetchBallot,
  } = useQuery({
    queryKey: ["ballot", id, locale],
    queryFn: () => getBallot(id, locale),
    enabled,
  });
  const {
    data: tax = null,
    isPending: taxPending,
    error: taxError,
    refetch: refetchBase,
  } = useTaxonomyBase(id, locale, enabled);
  const { data: fullTree = null, refetch: refetchFull } = useTaxonomyFull(
    id,
    locale,
    enabled,
  );

  // Bewertungs-Gate: die Analyse-Sektion (Sunburst + Positionsband) wird erst
  // freigeschaltet, wenn der Nutzer in jedem Top-Thema genügend bewertet hat.
  // Leitet sich live aus demselben Taxonomie-Cache ab (kein Refetch nötig).
  const gate = useRatingGate(id, locale, enabled);

  // Peer-Review-Gate: nach dem Bewertungs-Gate wird die Analyse zusätzlich
  // gesperrt, solange noch Gutachten offen sind — so muss jede·r (nicht nur die
  // Hyperaktiven) die zugeteilten Begutachtungen erledigen, bevor die eigene
  // Auswertung sichtbar wird. Demokratische Legitimation > Bequemlichkeit.
  const { invitations: openReviews, loading: reviewsLoading } =
    usePeerReviewNotifications(id);
  const firstReview = openReviews[0];
  // Bis das Ergebnis da ist, bleibt gesperrt — nie kurz die Analyse zeigen und
  // dann wieder verbergen.
  const reviewsCleared = !reviewsLoading && openReviews.length === 0;

  const loading = ballotPending || taxPending;
  const queryError = ballotError ?? taxError;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : null;
  const reload = () => {
    refetchBallot();
    refetchBase();
    refetchFull();
  };

  const root = tax?.tree;

  return (
    <div className="space-y-5 pb-[35vh]">
      {/* <PageBackdrop src="/images/kleinemythe.svg" /> */}
      {ballot && (
        <ArgumentariumHeader
          ballot={ballot}
          topicCount={root?.children?.length}
          actions={<ViewToggle active="taxonomy" ballotId={id} />}
        />
      )}

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
            <Button variant="destructive" size="sm" onClick={reload}>
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
          {root.children.map((ch, i) => (
            <ThemeCard
              key={ch.id}
              node={ch}
              index={i}
              total={root.children.length}
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

          {/* Abschnittswechsel: von der Argument-Einsicht zur Analyse der
              eigenen Bewertungen. Zwei gestaffelte Gates:
                1. Bewertungs-Gate — in jedem Top-Thema genügend bewertet.
                2. Peer-Review-Gate — keine zugeteilten Gutachten mehr offen.
              Reihenfolge: erst bewerten, dann begutachten, dann Analyse. */}
          <LockedSection
            unlocked={gate.unlocked}
            placeholder={
              <GatePlaceholder
                title={t("analysisLockedTitle")}
                description={t("analysisLockedDesc")}
                progress={{
                  value: gate.topicsMet,
                  total: gate.topicsTotal,
                  label: t("analysisLockedProgress", {
                    met: gate.topicsMet,
                    total: gate.topicsTotal,
                  }),
                }}
              />
            }
          >
            <LockedSection
              unlocked={reviewsCleared}
              placeholder={
                <GatePlaceholder
                  dashed={false}
                  icon={<ClipboardCheck className="h-5 w-5" />}
                  title={t("analysisReviewLockedTitle")}
                  description={t("analysisReviewLockedDesc")}
                  action={
                    firstReview && (
                      <Button
                        onClick={() =>
                          navigate({ type: "peerreview", id: firstReview.argumentUri })
                        }
                      >
                        {tpr("cta")}
                      </Button>
                    )
                  }
                />
              }
            >
              {/* Bewusst ohne Karte — markiert nur den Themenwechsel. */}
              <header className="mt-6 mb-1 px-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {t("analysisTitle")}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("analysisSubtitle")}
                </p>
              </header>

              {/* Meinungsrad (radial). Desktop: voll (alle Ringe beschriftet).
                  Mobile: compact (nur Ring 1 beschriftet, Ring 2 & 3 als Bänder). */}
              {fullTree?.tree && (
                <>
                  <div className="hidden md:block">
                    <TaxonomySunburst root={fullTree.tree} t={t} onSelect={openTopicDetail} />
                  </div>
                  <div className="-mx-2 md:hidden">
                    <TaxonomySunburst root={fullTree.tree} t={t} onSelect={openTopicDetail} compact />
                  </div>
                </>
              )}

              {/* Kräfte-Pfeile — zwei gegenläufige Pfeile je Thema, Schwerpunkt als Tick */}
              <TaxonomyArrows nodes={root.children} t={t} onSelect={openTopicDetail} />
            </LockedSection>
          </LockedSection>
        </div>
      )}

      {ballot && (
        <AddArgumentModal
          ballotRkey={ballot.rkey}
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={reload}
        />
      )}
    </div>
  );
}
