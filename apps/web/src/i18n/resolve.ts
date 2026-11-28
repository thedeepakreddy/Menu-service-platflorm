import { DEFAULT_LOCALE, isLocale, SUPPORTED_LOCALES } from './messages';
import type { Locale } from './messages';

/**
 * Locale resolution (Doc 03 §15; D-040 O-2, O-10). Order:
 *   1. the visitor's explicit choice (session cookie), if it names a supported locale;
 *   2. the best supported match in `Accept-Language` (by q-value, primary subtag);
 *   3. the platform default (`en`).
 * No locale is ever taken from the URL, and unsupported values are ignored, never echoed.
 */
export const LOCALE_COOKIE = '__Host-platform-locale';

const MAX_ACCEPT_LANGUAGE = 1024;
const MAX_ENTRIES = 32;

/** The supported locale `Accept-Language` prefers, or undefined. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | undefined {
  if (typeof acceptLanguage !== 'string' || acceptLanguage.length > MAX_ACCEPT_LANGUAGE) {
    return undefined;
  }
  const ranked = acceptLanguage
    .split(',')
    .slice(0, MAX_ENTRIES)
    .map((entry, index) => {
      const [tag = '', ...params] = entry.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { primary: tag.trim().toLowerCase().split('-')[0] ?? '', weight, index };
    })
    .filter((e) => Number.isFinite(e.weight) && e.weight > 0 && e.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const entry of ranked) {
    if (isLocale(entry.primary)) return entry.primary;
  }
  return undefined;
}

export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return negotiateLocale(acceptLanguage) ?? DEFAULT_LOCALE;
}

export { SUPPORTED_LOCALES };
