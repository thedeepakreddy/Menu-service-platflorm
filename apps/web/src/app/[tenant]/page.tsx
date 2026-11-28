import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TabIcon } from '../../customer/icons';
import { PendingIndicator } from '../../customer/pending-indicator';
import { NAME_SIZE_CLASS, nameSize } from '../../customer/name-size';
import { tabHref } from '../../customer/tabs';
import { getRequestLocale } from '../../i18n/server';
import { getPublicTenant } from '../../public/server';

const SECTIONS = [
  { tab: 'menu', hint: 'menuHint' },
  { tab: 'offers', hint: 'offersHint' },
  { tab: 'info', hint: 'infoHint' },
] as const;

/**
 * Tenant home (Phase 3; D-040 O-4, O-5). The venue's name is the one bold element, set like the
 * sign over the door. Only the provisioned public identity is shown: no owner or unpublished
 * content exists in this phase, and the intro says so plainly.
 */
export default async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const resolved = await getPublicTenant(tenant);
  if (resolved.kind !== 'found') notFound();
  const { messages } = await getRequestLocale();
  const { slug, displayName } = resolved.tenant;
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 pt-10 pb-12 sm:px-6 md:pt-16">
      <h1
        className={`max-w-[18ch] font-semibold text-balance wrap-break-word ${NAME_SIZE_CLASS[nameSize(displayName)]}`}
      >
        {displayName}
      </h1>
      <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-ink-muted">
        {messages.home.intro}
      </p>

      <section aria-labelledby="explore-heading" className="mt-10 max-w-2xl md:mt-14">
        <h2 id="explore-heading" className="text-lg font-semibold">
          {messages.home.exploreHeading}
        </h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card bg-surface-raised shadow-card">
          {SECTIONS.map(({ tab, hint }) => (
            <li key={tab}>
              <Link
                href={tabHref(slug, tab)}
                prefetch={false}
                className="group relative flex min-h-18 items-center gap-4 px-5 py-4 hover:bg-surface-sunken"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                  <TabIcon tab={tab} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{messages.nav[tab]}</span>
                  <span className="block text-[0.9375rem] text-ink-muted">
                    {messages.home[hint]}
                  </span>
                </span>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-ink-subtle transition-transform duration-200 ease-standard group-hover:translate-x-0.5"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
                <PendingIndicator />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
