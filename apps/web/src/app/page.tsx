import { LocaleFooter } from '../i18n/locale-footer';
import { getRequestLocale } from '../i18n/server';

/** The platform root. It names no tenant and lists none (no tenant directory, D-027). */
export default async function PlatformHome() {
  const { messages } = await getRequestLocale();
  return (
    <>
      <main id="main" className="mx-auto max-w-5xl px-4 pt-16 pb-12 sm:px-6 md:pt-24">
        <h1 className="max-w-[22ch] text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
          {messages.platform.name}
        </h1>
        <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-ink-muted">
          {messages.platform.intro}
        </p>
      </main>
      <LocaleFooter />
    </>
  );
}
