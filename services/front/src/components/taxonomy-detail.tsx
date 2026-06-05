"use client";

/**
 * Taxonomy-Detail-Overlay — Detailseite eines einzelnen Top-Topics.
 *
 * Geöffnet aus der Taxonomy-Main-View über „Mehr anzeigen". Lädt die `topic`-
 * Variante von taxonomy.get (Top-Topic + seine Subtopics, jeweils mit allen
 * Argumenten des Teilbaums) und zeigt: Kopf des Top-Topics (Name, Beschreibung,
 * „Für dich"-Insight) + dessen direkte Argumente + jedes Subtopic aufgeklappt.
 * Argumente sind je Sektion auf 4/Spalte begrenzt; „Mehr anzeigen" zeigt alle.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getTaxonomy } from "@/lib/agent";
import type { TaxonomyNode, TaxonomyCrumb } from "@/types/ballots";
import { Spinner } from "@/components/spinner";
import { InsightPanel, ProContraArguments, type T } from "@/components/taxonomy-view";

function SubtopicSection({
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
  if (!node.arguments.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{node.name}</h3>
        {node.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{node.description}</p>
        )}
      </div>
      <InsightPanel node={node} t={t} />
      <ProContraArguments args={node.arguments} onOpen={onOpen} onShowMore={onShowMore} />
    </section>
  );
}

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
  const locale = useLocale();

  const [node, setNode] = useState<TaxonomyNode | null>(null);
  const [crumbs, setCrumbs] = useState<TaxonomyCrumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tx = await getTaxonomy(ballotRkey, locale, topic);
      setNode(tx?.tree ?? null);
      setCrumbs(tx?.breadcrumb ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ballotRkey, locale, topic]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div
      ref={registerScrollContainer}
      className="flex h-full flex-col overflow-y-auto rounded-xl border border-border bg-card shadow-[0_30px_70px_-20px_rgba(45,35,22,0.45)]"
    >
      {/* Sticky Back-Header */}
      <div className="sticky top-0 z-10 flex items-center border-b bg-card/95 px-5 py-3 backdrop-blur-sm">
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

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && !node && (
          <p className="py-16 text-center text-muted-foreground">{t("empty")}</p>
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
                          onClick={() => onNavigateToTaxonomy(ballotRkey, c.key!)}
                          className="hover:text-foreground hover:underline"
                        >
                          {c.name}
                        </button>
                      ) : (
                        <span title={c.description ?? undefined} className="cursor-default">
                          {c.name}
                        </span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
              <h2
                className="text-2xl font-bold leading-tight"
                style={{ fontFamily: 'var(--font-serif), Georgia, "Times New Roman", serif' }}
              >
                {node.name}
              </h2>
              {node.description && (
                <p className="text-sm text-muted-foreground">{node.description}</p>
              )}
              <InsightPanel node={node} t={t} />
            </header>

            {/* Direkt am Top-Topic hängende Argumente (in keinem Subtopic) */}
            {node.arguments.length > 0 && (
              <ProContraArguments args={node.arguments} onOpen={onNavigateToArgument} />
            )}

            {/* Subtopics — aufgeklappt; „Mehr anzeigen" öffnet diese Stufe im Overlay. */}
            {node.children.map((ch) => (
              <SubtopicSection
                key={ch.id}
                node={ch}
                onOpen={onNavigateToArgument}
                onShowMore={ch.key ? () => onNavigateToTaxonomy(ballotRkey, ch.key!) : undefined}
                t={t}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default TaxonomyDetail;
