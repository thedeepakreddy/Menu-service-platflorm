import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { LOCALE_DIRECTION, MESSAGES } from './messages';
import type { Locale, Messages } from './messages';
import { LOCALE_COOKIE, resolveLocale } from './resolve';

export type RequestLocale = { locale: Locale; dir: 'ltr' | 'rtl'; messages: Messages };

/** The locale of the current request, resolved once per request (React request memoization). */
export const getRequestLocale = cache(async (): Promise<RequestLocale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language'),
  );
  return { locale, dir: LOCALE_DIRECTION[locale], messages: MESSAGES[locale] };
});
