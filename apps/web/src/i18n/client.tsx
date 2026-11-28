'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { MESSAGES } from './messages';
import type { Locale, Messages } from './messages';

/**
 * Makes the request's locale available to client components (error boundaries, the locale
 * switcher). Only the locale code crosses the server/client boundary; the catalogue itself is part
 * of the client bundle, so no string is ever looked up from untrusted input.
 */
const LocaleContext = createContext<Locale>('en');

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useMessages(): Messages {
  return MESSAGES[useContext(LocaleContext)];
}
