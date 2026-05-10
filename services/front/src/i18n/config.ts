export const locales = ['en', 'de'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'de';

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
};
