import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { TabNav } from '../../customer/tab-nav';
import { LocaleFooter } from '../../i18n/locale-footer';
import { tabHref } from '../../customer/tabs';
import { getPublicTenant } from '../../public/server';

/**
 * Public tenant entry and customer shell (Phase 3; Doc 05 §13, Doc 03 §3, §16; D-027, D-040). The
 * tenant comes ONLY from the validated route segment, resolved server-side by the API on every
 * request: never from a header, cookie, host name or client state. Anything but an active tenant
 * with a canonical slug is the shared not-found page.
 */
export const dynamic = 'force-dynamic';

type Props = { children: ReactNode; params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { tenant } = await params;
  const resolved = await getPublicTenant(tenant);
  const robots = { index: false, follow: false };
  if (resolved.kind !== 'found') return { robots };
  const name = resolved.tenant.displayName;
  return { title: { default: name, template: `%s – ${name}` }, robots };
}

export default async function TenantLayout({ children, params }: Props) {
  const { tenant } = await params;
  const resolved = await getPublicTenant(tenant);
  if (resolved.kind !== 'found') notFound();
  const { slug, displayName } = resolved.tenant;
  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-6 px-4 sm:px-6 md:min-h-16">
          <Link
            href={tabHref(slug, 'home')}
            prefetch={false}
            className="min-w-0 truncate py-2 text-[1.0625rem] font-semibold tracking-tight"
          >
            {displayName}
          </Link>
          <TabNav slug={slug} />
        </div>
      </header>
      {children}
      <LocaleFooter />
    </div>
  );
}
