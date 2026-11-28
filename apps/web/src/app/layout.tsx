import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { LocaleProvider } from '../i18n/client';
import { getRequestLocale } from '../i18n/server';
import './globals.css';

/**
 * Root layout. The document language and direction follow the request's resolved locale
 * (Doc 03 §15; D-040 O-2, O-10). Every page stays out of search indexes in Phase 3 (D-009, O-7).
 */
export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await getRequestLocale();
  return { title: messages.platform.name, robots: { index: false, follow: false } };
}

/** Lets the tab bar sit above the home indicator on phones with rounded screens. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, dir, messages } = await getRequestLocale();
  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-screen bg-surface text-ink antialiased">
        {/* First focusable element on every page (WCAG 2.4.1). Every page's <main> has id="main". */}
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-surface-raised px-4 py-3 font-semibold text-accent-ink shadow-card focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {messages.skipToContent}
        </a>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
