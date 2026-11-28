'use client';

import { usePathname } from 'next/navigation';

import { useLocale, useMessages } from './client';
import { SUPPORTED_LOCALES } from './messages';
import { LOCALE_SWITCH_PATH } from './switch';

/**
 * Language choice (Phase 3; D-040 O-2, O-10). A real form, so it works before (and without)
 * JavaScript; the server answers with a redirect back to the same page. Each language is named in
 * its own language and marked with its `lang`, so screen readers pronounce it correctly.
 */
export function LocaleSwitcher() {
  const messages = useMessages();
  const current = useLocale();
  const pathname = usePathname();
  return (
    <form
      method="post"
      action={LOCALE_SWITCH_PATH}
      aria-label={messages.locale.change}
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <input type="hidden" name="return" value={pathname} />
      <span className="text-sm text-ink-muted">{messages.locale.label}</span>
      <span className="flex gap-1">
        {SUPPORTED_LOCALES.map((locale) => {
          const isCurrent = locale === current;
          return (
            <button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              lang={locale}
              aria-pressed={isCurrent}
              className={[
                'min-h-11 rounded-control px-3 text-sm',
                isCurrent
                  ? 'bg-accent-soft font-semibold text-accent-ink'
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
              ].join(' ')}
            >
              {messages.locale.names[locale]}
            </button>
          );
        })}
      </span>
    </form>
  );
}
