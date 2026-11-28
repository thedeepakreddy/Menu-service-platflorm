import type { Metadata } from 'next';
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, dir } = await getRequestLocale();
  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
