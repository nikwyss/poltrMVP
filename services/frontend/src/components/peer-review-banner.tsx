"use client";

// ─── Peer-Review-Banner ─────────────────────────────────────────────────────
// Unten fixierter Banner mit wellenförmigem Deckel, der erscheint, sobald dem
// Nutzer für die aktuelle Vorlage ein Peer-Review zugewiesen wurde. Peer-Review
// ist eine Pflicht → nicht schliessbar. Dringlichkeit eskaliert in drei Stufen
// über die Zeit seit Erscheinen (session-basiert, Reload setzt zurück):
//
//   minimal  „lebendige Welle"   — hohe, schwingende Welle, freundlicher Ton
//   medium   „ruhigere Welle"    — flachere Welle, dringlicherer Ton + Meta
//   maximum  „fast flach"        — fast gerade Kante, dunkler Vollton, entschlossen
//
// Die Welle ist EIN SVG-Pfad, der via preserveAspectRatio="none" auf die je
// Stufe gewählte Höhe gestaucht wird (klein = flach). Fill = Bannerfarbe, sitzt
// mit -1px Überlappung dicht auf dem Body.
//
// Mount-Punkt: ballot/[id]/layout.tsx innerhalb des OverlayProvider, damit
// useOverlay() auflöst und ein Klick das bestehende Peer-Review-Overlay öffnet.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardCheck, Clock, User, Users } from "lucide-react";
import { useOverlay } from "@/lib/overlay";
import { usePeerReviewNotifications } from "@/lib/queries/peer-review-notifications";
import { cn } from "@/lib/utils";

type UrgencyStage = "minimal" | "medium" | "maximum";

// Schwellen (ms) seit Erscheinen des Banners. Bewusst als Konstanten, leicht
// justierbar. minimal: 0–2 min · medium: 2–10 min · maximum: > 10 min.
const MEDIUM_AFTER_MS = 2 * 60_000;
const MAXIMUM_AFTER_MS = 10 * 60_000;
const TICK_MS = 15_000;

/**
 * Liefert die Dringlichkeitsstufe abhängig von der verstrichenen Zeit, seit der
 * Banner aktiv wurde. Nicht persistiert — bei Reload startet `active` neu und
 * damit auch der Timer (gewünschtes Verhalten).
 */
function useUrgencyStage(active: boolean): UrgencyStage {
  const startedAt = useRef<number | null>(null);
  const [stage, setStage] = useState<UrgencyStage>("minimal");

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setStage("minimal");
      return;
    }
    // performance.now() statt Date.now(): monoton, unabhängig von Uhrzeit.
    if (startedAt.current === null) startedAt.current = performance.now();

    const recompute = () => {
      const elapsed = performance.now() - (startedAt.current ?? performance.now());
      setStage(
        elapsed >= MAXIMUM_AFTER_MS
          ? "maximum"
          : elapsed >= MEDIUM_AFTER_MS
            ? "medium"
            : "minimal",
      );
    };
    recompute();
    const id = window.setInterval(recompute, TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return stage;
}

// Stufen-Stil. `wave` = SVG-Höhe in px (kleiner ⇒ flacher). `solid` schaltet auf
// den dunklen Vollton-Layout-Zweig (maximum) um.
const STAGE_STYLE: Record<
  UrgencyStage,
  { bg: string; fg: string; wave: number; solid: boolean; pulse: boolean }
> = {
  minimal: { bg: "var(--pro-dim)", fg: "var(--pro)", wave: 26, solid: false, pulse: false },
  medium: { bg: "var(--pro-dim)", fg: "var(--pro)", wave: 14, solid: false, pulse: true },
  maximum: { bg: "var(--pro)", fg: "#ffffff", wave: 5, solid: true, pulse: true },
};

// Ein einziger Wellenpfad; die Höhe staucht ihn (preserveAspectRatio="none").
const WAVE_PATH =
  "M0,26 L0,14 C140,1 250,1 340,10 C430,19 540,19 680,8 L680,26 Z";

function Wave({ height, fill }: { height: number; fill: string }) {
  // Layout per inline-Style (NICHT styled-jsx): die scoped Klassen des Eltern-
  // Components erreichen dieses SVG nicht, weil es in einem eigenen Component
  // lebt. preserveAspectRatio="none" streckt den Pfad auf volle Breite × height.
  return (
    <svg
      viewBox="0 0 680 26"
      preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height, marginBottom: -1 }}
      aria-hidden
    >
      <path d={WAVE_PATH} style={{ fill }} />
    </svg>
  );
}

export function PeerReviewBanner({ ballotId }: { ballotId: string }) {
  const t = useTranslations("peerReview.banner");
  const { navigate } = useOverlay();
  const { invitations } = usePeerReviewNotifications(ballotId);

  const active = invitations.length > 0;
  const stage = useUrgencyStage(active);

  if (!active) return null;

  const first = invitations[0];
  const total = invitations.length;
  const style = STAGE_STYLE[stage];
  const open = () => navigate({ type: "peerreview", id: first.argumentUri });

  return (
    <div className="fixed inset-x-0 bottom-0 z-40" role="alert">
      <style jsx>{`
        .rb-body {
          width: 100%;
        }
        .rb-inner {
          margin-left: auto;
          margin-right: auto;
          max-width: var(--page-max);
          padding-left: var(--page-px);
          padding-right: var(--page-px);
        }
      `}</style>

      <Wave height={style.wave} fill={style.bg} />

      <div
        className="rb-body"
        style={{ backgroundColor: style.bg, color: style.fg }}
      >
        <div className="rb-inner">
          {style.solid ? (
            // ── maximum: dunkler Vollton, vertikal, entschlossen ──────────────
            <div className="py-5">
              <div className="flex items-center gap-2.5">
                <ClipboardCheck className={cn("h-5 w-5 shrink-0", style.pulse && "animate-pulse")} />
                <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] opacity-90">
                  {t("maximum.eyebrow")}
                </span>
              </div>
              <h3 className="mt-1.5 text-lg font-bold leading-snug sm:text-xl">
                {t("maximum.title")}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed opacity-95">
                {t("maximum.body")}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <button
                  type="button"
                  onClick={open}
                  className="rounded-md px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#ffffff", color: "var(--pro)" }}
                >
                  {t("cta")}
                </button>
                <span className="flex items-center gap-1.5 text-[0.8125rem] opacity-90">
                  <User className="h-4 w-4 shrink-0" />
                  {t("maximum.soloNote")}
                </span>
              </div>
            </div>
          ) : (
            // ── minimal / medium: helle Welle, horizontal ─────────────────────
            <button
              type="button"
              onClick={open}
              className={cn(
                "flex w-full items-center gap-3 text-left transition-colors",
                stage === "medium" ? "py-3.5" : "py-2.5",
              )}
              style={{ color: style.fg }}
            >
              <ClipboardCheck
                className={cn("h-5 w-5 shrink-0", style.pulse && "animate-pulse")}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t(`${stage}.title`)}</div>
                <div className="text-[0.8125rem] leading-snug opacity-90">
                  {t(`${stage}.body`)}
                </div>
                {stage === "medium" && (
                  <div className="mt-1.5 flex items-center gap-4 text-[0.75rem] opacity-90">
                    {total > 1 && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        {t("queue", { current: 1, total })}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {t("estimate")}
                    </span>
                  </div>
                )}
              </div>
              <span
                className="shrink-0 rounded-md px-4 py-2 text-[0.8125rem] font-semibold whitespace-nowrap"
                style={{ backgroundColor: style.fg, color: style.bg }}
              >
                {stage === "medium" ? t("ctaSubmit") : t("cta")}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
