import type { Locale } from './messages';

/**
 * Locale-aware formatting (Phase 3; Doc 03 §15; D-040 O-2; P3-07). Every number, price, date and
 * time on the customer side goes through these helpers, never through string concatenation or the
 * server's default locale.
 *
 * Time zone: there is deliberately NO default. A venue's time zone is not provisioned in Phase 3,
 * and silently using the server's zone would show wrong opening hours. Callers must pass one.
 * Currency: always explicit (ISO 4217); a price is never formatted without its currency.
 */
const INTL_LOCALE: Record<Locale, string> = { en: 'en', hu: 'hu' };

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

export function formatPrice(locale: Locale, amount: number, currency: string): string {
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError('currency must be an ISO 4217 code');
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency }).format(amount);
}

export function formatDate(locale: Locale, date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'long', timeZone }).format(date);
}

export function formatTime(locale: Locale, date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeStyle: 'short', timeZone }).format(
    date,
  );
}

export function formatList(locale: Locale, items: readonly string[]): string {
  return new Intl.ListFormat(INTL_LOCALE[locale], { style: 'long', type: 'conjunction' }).format(
    items,
  );
}
