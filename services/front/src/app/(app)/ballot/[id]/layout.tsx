"use client";

import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { OverlayProvider } from "@/lib/overlay";
import { OverlayContentHost } from "@/lib/overlay-content";

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
  const t = useTranslations("vorlage");

  const activeSegment = tabs.find((tab) =>
    pathname.startsWith(`/ballot/${id}/${tab.segment}`),
  )?.segment;

  return (
    // OverlayProvider scoped to /ballot/[id]/* — overlays (argument, comment,
    // profile, peerreview) are only available within a ballot context where
    // useParams().id resolves to the current ballotRkey.
    <OverlayProvider>
      <div className="flex flex-col gap-0">
        {/* Sub-navigation bar */}
        <nav className="sticky top-[59px] z-40 bg-[var(--bg)]/88 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--bg)]/60">
          <div
            className="mx-auto flex items-center gap-1 overflow-x-auto"
            style={{
              maxWidth: "var(--page-max)",
              padding: "0 var(--page-px)",
              height: 44,
            }}
          >
            <Link
              href="/home"
              className="flex items-center gap-1 text-[0.8125rem] text-[var(--text-mid)] hover:text-[var(--text)] transition-colors no-underline shrink-0 mr-2 pr-2 border-r border-border"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("backToHome")}</span>
            </Link>

            {/* Tab-Gruppe als Mauerwerk: feine Quaderfugen zwischen den Tabs */}
            <div className="flex items-center">
              {tabs.map((tab, i) => {
                const href = `/ballot/${id}/${tab.segment}`;
                const isActive = activeSegment === tab.segment;
                return (
                  <div key={tab.segment} className="flex items-center">
                    {i > 0 && (
                      <span
                        aria-hidden
                        className="h-4 w-px bg-[var(--line-mid)] shrink-0"
                      />
                    )}
                    <Link
                      href={href}
                      className={cn(
                        "mx-1 px-3 py-1.5 text-[0.78125rem] font-medium rounded-[var(--r-sm)] border border-transparent no-underline transition-all duration-150 whitespace-nowrap",
                        isActive
                          ? "stone-tab-active"
                          : "text-[var(--text-mid)] hover:bg-accent hover:text-[var(--text)]",
                      )}
                    >
                      {t(tab.key)}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Page content */}
        <div>{children}</div>
      </div>
      <OverlayContentHost />
    </OverlayProvider>
  );
}
