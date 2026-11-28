// Localization base (Phase 3; Doc 03 §15; D-040 O-2, O-10).
import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, LOCALE_DIRECTION, MESSAGES, SUPPORTED_LOCALES } from './messages';
import { negotiateLocale, resolveLocale } from './resolve';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string'
      ? [[`${prefix}${k}`, v] as [string, string]]
      : leaves(v, `${prefix}${k}.`),
  );
}

describe('catalogue', () => {
  it('launch locales are en and hu, with en the default (O-2)', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'hu']);
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALE_DIRECTION).toEqual({ en: 'ltr', hu: 'ltr' });
  });

  it('every locale has exactly the same keys, all non-empty', () => {
    const en = leaves(MESSAGES.en);
    for (const locale of SUPPORTED_LOCALES) {
      const entries = leaves(MESSAGES[locale]);
      expect(entries.map(([k]) => k)).toEqual(en.map(([k]) => k));
      for (const [key, value] of entries) expect(value.trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('Hungarian is actually translated, not copied from English', () => {
    // Language names are written in their own language and are the same in every catalogue.
    const shared = new Set(['locale.names.en', 'locale.names.hu']);
    const en = new Map(leaves(MESSAGES.en));
    const copied = leaves(MESSAGES.hu).filter(
      ([key, value]) => !shared.has(key) && en.get(key) === value,
    );
    expect(copied).toEqual([]);
  });

  it('no string interpolates a tenant name (Hungarian suffixes would break it)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [, value] of leaves(MESSAGES[locale])) {
        expect(value).not.toMatch(/[{}]/);
      }
    }
  });
});

describe('locale resolution (O-10)', () => {
  it.each([
    ['hu', null, 'hu'],
    ['en', 'hu', 'en'],
    [undefined, 'hu-HU,hu;q=0.9,en;q=0.8', 'hu'],
    [undefined, 'de-DE,de;q=0.9', 'en'],
    [undefined, 'de;q=0.9,hu;q=0.5', 'hu'],
    [undefined, 'en;q=0.4,hu;q=0.6', 'hu'],
    [undefined, 'hu;q=0,en;q=0.1', 'en'],
    [undefined, null, 'en'],
    ['xx', 'hu', 'hu'],
    ['<script>', null, 'en'],
    [undefined, 'HU', 'hu'],
    [undefined, '*', 'en'],
  ])('cookie %s + Accept-Language %s → %s', (cookie, acceptLanguage, expected) => {
    expect(resolveLocale(cookie, acceptLanguage)).toBe(expected);
  });

  it('ignores oversized or nonsensical Accept-Language values', () => {
    expect(negotiateLocale(`hu,${'x;q=0.1,'.repeat(300)}`)).toBeUndefined();
    expect(negotiateLocale('hu;q=abc')).toBeUndefined();
    expect(negotiateLocale('hu;q=2')).toBeUndefined();
  });
});
