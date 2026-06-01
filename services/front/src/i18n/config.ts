/**
 * i18n configuration — mirrors POLTR_LANGUAGES env var across services.
 *
 * `NEXT_PUBLIC_POLTR_LANGUAGES` is read at build time and embedded into the
 * client bundle (required because the locale list is used by client
 * components too). Default keeps the legacy DE/EN set for local dev.
 */

const RAW = process.env.NEXT_PUBLIC_POLTR_LANGUAGES || 'de,fr,it,rm,en';

export const locales = RAW.split(',')
  .map((c) => c.trim())
  .filter(Boolean) as readonly string[];

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale =
  (process.env.NEXT_PUBLIC_POLTR_DEFAULT_LANGUAGE as Locale | undefined) || 'de';

export const localeLabels: Record<string, string> = {
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  rm: 'Rumantsch',
  en: 'English',
};
