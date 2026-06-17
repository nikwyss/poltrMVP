import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { locales, defaultLocale, baseToCanonical, messageBaseFor } from './config';

function resolveLocaleFromHeader(acceptLanguage: string | null): string {
  if (!acceptLanguage) return defaultLocale;

  const preferred = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    // Exact canonical match (e.g. "de-ch" → "de-CH").
    const exact = locales.find((l) => l.toLowerCase() === lang);
    if (exact) return exact;
    // Match by base subtag → our region-flavoured locale (de-DE/de → de-CH).
    const base = baseToCanonical[lang.split('-')[0]];
    if (base) return base;
  }

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('locale')?.value;

  let locale: string;
  if (cookieLocale && (locales as readonly string[]).includes(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headerStore = await headers();
    locale = resolveLocaleFromHeader(headerStore.get('accept-language'));
  }

  return {
    locale,
    // Shared bundle per base language: de-CH → messages/de.json.
    messages: (await import(`../../messages/${messageBaseFor(locale)}.json`))
      .default,
  };
});
