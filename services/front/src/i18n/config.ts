/**
 * i18n configuration — mirrors POLTR_LANGUAGES env var across services.
 *
 * `NEXT_PUBLIC_POLTR_LANGUAGES` is read at build time and embedded into the
 * client bundle (required because the locale list is used by client
 * components too). Default keeps the legacy DE/EN set for local dev.
 */

// Default = the currently active set (matches POLTR_LANGUAGES in the backend
// secrets). NEXT_PUBLIC_* is build-time; in the Docker build no build-arg is
// wired, so this default is what ships unless overridden. Full supported set:
// de-CH,fr-CH,it-CH,rm,en-GB (labels for all of them are kept below).
const RAW = process.env.NEXT_PUBLIC_POLTR_LANGUAGES || "de-CH,en-GB";

export const locales = RAW.split(",")
  .map((c) => c.trim())
  .filter(Boolean) as readonly string[];

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale =
  (process.env.NEXT_PUBLIC_POLTR_DEFAULT_LANGUAGE as Locale | undefined) ||
  "de-CH";

export const localeLabels: Record<string, string> = {
  "de-CH": "Deutsch",
  "fr-CH": "Français",
  "it-CH": "Italiano",
  rm: "Rumantsch",
  "en-GB": "English",
};

/**
 * Base language subtag → our canonical region-flavoured locale, derived from
 * `locales`. Browser/Accept-Language tags are matched on their base subtag and
 * remapped here (de-DE, de-AT, de → de-CH; en-US → en-GB). Unflavoured locales
 * (rm) map to themselves. Auto-adapts when POLTR_LANGUAGES changes.
 */
export const baseToCanonical: Record<string, string> = locales.reduce(
  (acc, loc) => {
    const base = loc.split("-")[0];
    if (!(base in acc)) acc[base] = loc;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * UI message bundle for a locale. Strings are shared across regions (de-CH and
 * de-DE use the same German bundle) → load by base subtag: de-CH → de.json.
 */
export const messageBaseFor = (locale: string): string => locale.split("-")[0];
