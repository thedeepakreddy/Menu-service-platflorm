'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useMessages } from '../i18n/client';
import { TabIcon } from './icons';
import { TABS, activeTab, tabHref } from './tabs';

/**
 * The customer navigation (Phase 3; D-040 O-4; Doc 03 §16). One `<nav>` landmark that is a fixed
 * bottom tab bar on phones and an inline tab row in the header from 768 px up. The current tab is
 * marked with `aria-current="page"` and, visually, by shape and weight as well as colour (no
 * colour-only meaning). Prefetching is off: every tab page is dynamic and asks the API, so
 * speculative requests would only spend the visitor's rate-limit budget.
 */
export function TabNav({ slug }: { slug: string }) {
  const messages = useMessages();
  const current = activeTab(slug, usePathname());
  return (
    <nav
      aria-label={messages.nav.label}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-bar md:static md:border-0 md:bg-transparent md:pb-0 md:shadow-none"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 md:flex md:max-w-none md:gap-1">
        {TABS.map((tab) => {
          const isCurrent = tab === current;
          return (
            <li key={tab}>
              <Link
                href={tabHref(slug, tab)}
                prefetch={false}
                aria-current={isCurrent ? 'page' : undefined}
                className={[
                  'group flex min-h-16 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[0.8125rem] leading-tight',
                  // Inset ring: the fixed bar sits on the screen edge and would clip an outer one.
                  'focus-visible:-outline-offset-3 md:focus-visible:outline-offset-3',
                  'md:min-h-11 md:flex-row md:gap-2 md:rounded-control md:px-3.5 md:py-2 md:text-[0.9375rem]',
                  isCurrent ? 'font-semibold text-accent-ink' : 'text-ink-muted hover:text-ink',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ease-standard md:h-auto md:w-auto md:rounded-none',
                    isCurrent
                      ? 'bg-accent-soft md:bg-transparent'
                      : 'group-hover:bg-surface-sunken md:group-hover:bg-transparent',
                  ].join(' ')}
                >
                  <TabIcon tab={tab} />
                </span>
                <span
                  className={[
                    'md:border-b-2 md:pb-0.5',
                    isCurrent ? 'md:border-accent' : 'md:border-transparent',
                  ].join(' ')}
                >
                  {messages.nav[tab]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
