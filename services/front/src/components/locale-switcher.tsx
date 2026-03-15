"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const switchLocale = (newLocale: string) => {
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={() => switchLocale(locale === "en" ? "de" : "en")}
      className="flex items-center justify-center size-[28px] rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] text-[10px] font-bold text-[var(--text-mid)] hover:bg-accent hover:border-[var(--line-mid)] transition-colors cursor-pointer"
      title={locale === "en" ? "Auf Deutsch wechseln" : "Switch to English"}
    >
      {locale === "en" ? "DE" : "EN"}
    </button>
  );
}
