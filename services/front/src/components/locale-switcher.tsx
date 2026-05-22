"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { LanguageIcon } from "@/components/icons/language-icon";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const switchLocale = (newLocale: Locale) => {
    if (newLocale === locale) return;
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 h-[28px] pl-2 pr-2.5 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-up)] text-[0.78125rem] text-[var(--text-mid)] hover:bg-accent hover:border-[var(--line-mid)] transition-colors cursor-pointer"
        >
          <LanguageIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{localeLabels[locale as Locale]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => switchLocale(loc)}
            className={locale === loc ? "font-semibold bg-accent" : ""}
          >
            {localeLabels[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
