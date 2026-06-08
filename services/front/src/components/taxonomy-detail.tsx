"use client";

/**
 * Taxonomy-Detail-Overlay — Detailseite eines einzelnen Top-Topics.
 *
 * Geöffnet aus der Taxonomy-Main-View über „Mehr anzeigen". Lädt die `topic`-
 * Variante von taxonomy.get (Top-Topic + seine Subtopics, jeweils mit allen
 * Argumenten des Teilbaums) und zeigt: Kopf des Top-Topics (Name, Beschreibung)
 * + dessen direkte Argumente + jedes Subtopic aufgeklappt.
 * Argumente sind je Sektion auf 4/Spalte begrenzt; „Mehr anzeigen" zeigt alle.
 */
import { useTranslations, useLocale } from "next-intl";
import { useTaxonomyTopic } from "@/lib/queries/taxonomy";
import { Spinner } from "@/components/spinner";
import {
  ProContraArguments,
  ThemeCard,
  type T,
} from "@/components/taxonomy-view";

export function TaxonomyDetail({
  ballotRkey,
  topic,
  onClose,
  backLabel,
  onNavigateToArgument,
  onNavigateToTaxonomy,
  registerScrollContainer,
}: {
  ballotRkey: string;
  topic: string;
  onClose: () => void;
  backLabel: string;
  onNavigateToArgument: (rkey: string) => void;
  // „Mehr anzeigen" eines Subtopics → öffnet diese Stufe in einem neuen Overlay.
  onNavigateToTaxonomy: (ballotRkey: string, topic: string) => void;
  registerScrollContainer: (el: HTMLElement | null) => void;
}) {
  const t = useTranslations("taxonomy") as T;
  const ta = useTranslations("argumentarium");
  const locale = useLocale();

  // Topic-Variante aus dem zentralen Query-Cache. Bewertungen im Argument-Overlay
  // patchen denselben `["taxonomy", id, …]`-Eintrag → Karten aktualisieren live.
  const { data, isPending, error: queryError } = useTaxonomyTopic(
    ballotRkey,
    locale,
    topic,
  );
  const node = data?.tree ?? null;
  const crumbs = data?.breadcrumb ?? [];
  const loading = isPending;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : null;

  return (
    <div
      ref={registerScrollContainer}
      className="flex h-full flex-col overflow-y-auto rounded-xl border border-border bg-background shadow-[0_30px_70px_-20px_rgba(45,35,22,0.45)]"
    >
      {/* Sticky Back-Header */}
      <div className="sticky top-0 z-10 flex items-center border-b bg-background/95 px-5 py-3 backdrop-blur-sm">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="text-base leading-none">←</span>
          {backLabel}
        </button>
      </div>

      <div className="space-y-6 px-5 py-6 pb-[20vh]">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16">
            <Spinner />
            <span className="text-muted-foreground">{t("loading")}</span>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && !node && (
          <p className="py-16 text-center text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {!loading && node && (
          <>
            {/* Kopf des Top-Topics */}
            <header className="space-y-3">
              {/* Breadcrumb = Vorfahren-Pfad; klickbar → navigiert die Hierarchie hoch. */}
              {crumbs.length > 0 && (
                <nav className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                  {crumbs.map((c, ci) => (
                    <span key={ci} className="flex items-center gap-x-1">
                      {ci > 0 && <span className="opacity-40">›</span>}
                      {c.key ? (
                        <button
                          type="button"
                          title={c.description ?? undefined}
                          onClick={() =>
                            onNavigateToTaxonomy(ballotRkey, c.key!)
                          }
                          className="hover:text-foreground hover:underline"
                        >
                          {c.name}
                        </button>
                      ) : (
                        <span
                          title={c.description ?? undefined}
                          className="cursor-default"
                        >
                          {c.name}
                        </span>
                      )}
                    </span>
                  ))}
                </nav>
              )}

              <h2
                className="text-2xl md:text-[1.75rem] font-bold tracking-tight leading-tight"
                style={{
                  fontFamily:
                    'var(--font-serif), Georgia, "Times New Roman", serif',
                }}
              >
                {ta(
                  node.children.length > 0 ? "subtopicsTitle" : "topicTitle",
                  { name: node.name },
                )}
              </h2>
              {node.introduction && (
                <p className="text-sm text-muted-foreground">
                  {node.introduction}
                </p>
              )}
            </header>

            {/* Direkt am Top-Topic hängende Argumente (in keinem Subtopic).
                Default-Limit + inline „Mehr anzeigen (+N)" (klappt in-place auf). */}
            {node.arguments.length > 0 && (
              <ProContraArguments
                args={node.arguments}
                onOpen={onNavigateToArgument}
              />
            )}

            {/* Unterbereiche — je in einer Card (wie die Main-View „Taxonomy");
                „Mehr anzeigen" öffnet diese Stufe im Overlay. */}
            {node.children.length > 0 && (
              <div className="flex flex-col gap-3">
                {node.children.map((ch) => {
                  // Hat das Unterthema selbst Unterthemen? Dann Drilldown-Link
                  // („Mehr zum Unterthema") in dessen Overlay (immer, auch wenn
                  // nicht gekürzt). Sonst ist die Karte ein Blatt → Default-Limit
                  // + inline „Mehr anzeigen (+N)".
                  // In der Topic-Sicht ist `children` abgeflacht ([]); das Flag
                  // `hasChildren` vom AppView trägt die echte Struktur-Info.
                  const hasSub = ch.hasChildren ?? ch.children.length > 0;
                  return (
                    <ThemeCard
                      key={ch.id}
                      node={ch}
                      onOpen={onNavigateToArgument}
                      onShowMore={
                        hasSub && ch.key
                          ? () => onNavigateToTaxonomy(ballotRkey, ch.key!)
                          : undefined
                      }
                      subtopic
                      t={t}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TaxonomyDetail;
