// Locale-aware formatting (Phase 3 M3.4; P3-07): Hungarian and English conventions, explicit
// time zone and currency.
import { describe, expect, it } from 'vitest';

import { formatDate, formatList, formatNumber, formatPrice, formatTime } from './format';

// Intl uses narrow/no-break spaces in some outputs; compare with ordinary spaces.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const NOON_UTC = new Date('2026-03-15T12:05:00Z');

describe('formatting', () => {
  it('numbers follow each locale’s separators', () => {
    expect(plain(formatNumber('en', 1234567.5))).toBe('1,234,567.5');
    expect(plain(formatNumber('hu', 1234567.5))).toBe('1 234 567,5');
  });

  it('prices always carry their currency', () => {
    // CLDR: forint prices have no decimals, and Hungarian groups only from five digits.
    expect(plain(formatPrice('hu', 2490, 'HUF'))).toBe('2490 Ft');
    expect(plain(formatPrice('hu', 12490, 'HUF'))).toBe('12 490 Ft');
    expect(plain(formatPrice('en', 12.5, 'EUR'))).toBe('€12.50');
    expect(() => formatPrice('en', 1, 'eur')).toThrow(RangeError);
    expect(() => formatPrice('en', 1, '')).toThrow(RangeError);
  });

  it('dates and times use the given time zone, never the server’s', () => {
    expect(formatDate('hu', NOON_UTC, 'Europe/Budapest')).toBe('2026. március 15.');
    expect(formatDate('en', NOON_UTC, 'Europe/Budapest')).toBe('March 15, 2026');
    expect(formatTime('hu', NOON_UTC, 'Europe/Budapest')).toBe('13:05');
    expect(plain(formatTime('en', NOON_UTC, 'America/New_York'))).toBe('8:05 AM');
  });

  it('lists use the locale’s conjunction', () => {
    expect(formatList('en', ['Soup', 'Bread', 'Wine'])).toBe('Soup, Bread, and Wine');
    expect(formatList('hu', ['Leves', 'Kenyér', 'Bor'])).toBe('Leves, Kenyér és Bor');
  });
});
