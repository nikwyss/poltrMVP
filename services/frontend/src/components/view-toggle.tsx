"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { List, BookOpen, Network, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type ArgumentsView = "feed" | "booklet" | "taxonomy" | "gutachten";

export const ARGUMENTS_VIEWS: readonly ArgumentsView[] = [
  "feed",
  "booklet",
  "taxonomy",
  "gutachten",
] as const;

export const DEFAULT_ARGUMENTS_VIEW: ArgumentsView = "taxonomy";
export const ARGUMENTS_VIEW_STORAGE_KEY = "poltr.argumentsView";

export function readStoredArgumentsView(): ArgumentsView {
  if (typeof window === "undefined") return DEFAULT_ARGUMENTS_VIEW;
  const raw = window.localStorage.getItem(ARGUMENTS_VIEW_STORAGE_KEY);
  return (ARGUMENTS_VIEWS as readonly string[]).includes(raw ?? "")
    ? (raw as ArgumentsView)
    : DEFAULT_ARGUMENTS_VIEW;
}

function persistArgumentsView(view: ArgumentsView) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ARGUMENTS_VIEW_STORAGE_KEY, view);
}

const viewDefs: {
  key: ArgumentsView;
  icon: typeof List;
  labelKey: string;
  segment: string;
}[] = [
  { key: "taxonomy", icon: Network, labelKey: "taxonomy", segment: "taxonomy" },
  { key: "booklet", icon: BookOpen, labelKey: "booklet", segment: "booklet" },
  { key: "feed", icon: List, labelKey: "feed", segment: "feed" },
  {
    key: "gutachten",
    icon: ClipboardCheck,
    labelKey: "gutachten",
    segment: "gutachten",
  },
];

export function ViewToggle({
  active,
  ballotId,
}: {
  active: ArgumentsView;
  ballotId: string;
}) {
  const router = useRouter();
  const t = useTranslations("viewToggle");

  useEffect(() => {
    persistArgumentsView(active);
  }, [active]);

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {viewDefs.map(({ key, icon: Icon, labelKey, segment }) => (
        <button
          key={key}
          type="button"
          title={t(labelKey)}
          onClick={() => {
            if (key === active) return;
            persistArgumentsView(key);
            router.push(`/ballot/${ballotId}/arguments/${segment}`);
          }}
          className={cn(
            "flex items-center justify-center size-[30px] rounded-[var(--r-sm)] border transition-all duration-150 cursor-pointer",
            key === active
              ? "border-[var(--line-mid)] bg-accent text-[var(--text)]"
              : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-mid)] hover:bg-accent hover:border-[var(--line-mid)]",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
