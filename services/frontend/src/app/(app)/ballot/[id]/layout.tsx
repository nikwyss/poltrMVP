"use client";

import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { cn, formatDate } from "@/lib/utils";
import { getBallot } from "@/lib/agent";
import { ArrowLeft } from "lucide-react";
import { OverlayProvider } from "@/lib/overlay";
import { OverlayContentHost } from "@/lib/overlay-content";
import { PeerReviewBanner } from "@/components/peer-review-banner";

const tabs = [
  { key: "info" as const, segment: "info" },
  { key: "chat" as const, segment: "chat" },
  { key: "arguments" as const, segment: "arguments" },
] as const;

export default function VorlageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const id = params.id as string;
  const locale = useLocale();
  const t = useTranslations("vorlage");
  const tbt = useTranslations("ballotType");

  // Geteilter Cache mit den Content-Seiten (info/booklet/taxonomy nutzen denselben
  // queryKey), daher kein zusätzlicher Request im Normalfall.
  const { data: ballot } = useQuery({
    queryKey: ["ballot", id, locale],
    queryFn: () => getBallot(id, locale),
  });

  const activeSegment = tabs.find((tab) =>
    pathname.startsWith(`/ballot/${id}/${tab.segment}`),
  )?.segment;

  return (
    // OverlayProvider scoped to /ballot/[id]/* — overlays (argument, comment,
    // profile, peerreview) are only available within a ballot context where
    // useParams().id resolves to the current ballotRkey.
    <OverlayProvider>
      <div className="flex flex-1 flex-col">
        {/* Vorlagen-Titelband — scrollt mit weg; nur die Tab-Leiste klebt oben.
            Back-Link + Datum·Typ in einer Zeile, darunter der grosse Titel. */}
        <div
          className="mx-auto w-full"
          style={{ maxWidth: "var(--page-max)", padding: "0 var(--page-px)" }}
        >
          <div className="flex items-center justify-between gap-4 pt-5">
            <Link
              href="/home"
              className="flex items-center gap-1 text-[0.8125rem] text-[var(--text-mid)] hover:text-[var(--text)] transition-colors no-underline shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t("backToHome")}</span>
            </Link>

            {ballot && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="label truncate">
                  {formatDate(ballot.voteDate)}
                </span>
                {ballot.ballotType && (
                  <>
                    <span className="label">·</span>
                    <span className="text-[0.8125rem] font-semibold text-[var(--brand)] truncate">
                      {tbt(ballot.ballotType)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {ballot?.title && (
            <h1
              className="mt-7 mb-4 text-3xl md:text-[2.25rem] font-normal tracking-tight leading-[0.95]"
              style={{
                fontFamily:
                  'var(--font-serif), Georgia, "Times New Roman", serif',
              }}
            >
              {ballot.title}
            </h1>
          )}
        </div>

        {/* Sub-navigation bar (Tabs) — klebt unter dem Hauptheader. Solides
            Beige + full-width Hairline darunter schliesst die Header-Zone ab
            (trennt „Kontext oben" von „Inhalt unten" ohne weisse Fläche). */}
        <nav className="sticky top-[59px] z-40 border-b border-[#E0DCD1] bg-[var(--bg)]">
          <div
            className="mx-auto flex h-11 items-stretch gap-6 overflow-x-auto"
            style={{
              maxWidth: "var(--page-max)",
              padding: "0 var(--page-px)",
            }}
          >
            {/* Underline-Tabs: aktiver Tab fett + dunkler Unterstrich am unteren
                Rand (sitzt auf der Hairline); inaktive muted, kein Hintergrund.
                Kein -mb-px → kein 1px-Überlauf, der eine Scrollbar auslöst. */}
            {tabs.map((tab) => {
              const href = `/ballot/${id}/${tab.segment}`;
              const isActive = activeSegment === tab.segment;
              return (
                <Link
                  key={tab.segment}
                  href={href}
                  className={cn(
                    "inline-flex items-center border-b-2 text-[0.8125rem] no-underline transition-colors whitespace-nowrap",
                    isActive
                      ? "border-[var(--text)] font-semibold text-[var(--text)]"
                      : "border-transparent font-medium text-[var(--text-mid)] hover:text-[var(--text)]",
                  )}
                >
                  {t(tab.key)}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Page content — eigener max-width-Inner mit Seitenpadding, da das
            App-Shell-`main` für Ballot-Seiten vollbreit (ohne Hülle) rendert. */}
        <div
          className="mx-auto w-full max-w-[var(--page-max)] flex-1"
          style={{ padding: "0 var(--page-px) 6rem" }}
        >
          {children}
        </div>
      </div>
      <PeerReviewBanner ballotId={id} />
      <OverlayContentHost />
    </OverlayProvider>
  );
}
