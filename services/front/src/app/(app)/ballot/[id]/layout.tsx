"use client";

import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const tabs = [
  { key: "info" as const, segment: "info" },
  { key: "chat" as const, segment: "chat" },
  { key: "arguments" as const, segment: "arguments" },
  { key: "review" as const, segment: "review" },
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
    <div className="flex flex-col gap-0">
      {/* Sub-navigation bar */}
      <nav className="sticky top-[53px] z-40 bg-[var(--bg)]/88 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--bg)]/60 border-b">
        <div
          className="mx-auto flex items-center gap-1 overflow-x-auto"
          style={{
            maxWidth: "var(--page-max)",
            padding: "0 var(--page-px)",
            height: 40,
          }}
        >
          <Link
            href="/home"
            className="flex items-center gap-1 text-[12px] text-[var(--text-mid)] hover:text-[var(--text)] transition-colors no-underline shrink-0 mr-2 pr-2 border-r border-border"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("backToHome")}</span>
          </Link>

          {tabs.map((tab) => {
            const href = `/ballot/${id}/${tab.segment}`;
            const isActive = activeSegment === tab.segment;
            return (
              <Link
                key={tab.segment}
                href={href}
                className={cn(
                  "px-3 py-1.5 text-[12.5px] font-medium rounded-[var(--r-sm)] no-underline transition-all duration-150 whitespace-nowrap",
                  isActive
                    ? "bg-[var(--text)] text-[var(--bg)]"
                    : "text-[var(--text-mid)] hover:bg-accent hover:text-[var(--text)]",
                )}
              >
                {t(tab.key)}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Page content */}
      <div>{children}</div>
    </div>
  );
}
