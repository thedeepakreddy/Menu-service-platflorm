import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EmptyState, EmptyStateLink } from '../../../customer/empty-state';
import { OffersArt } from '../../../customer/illustrations';
import { tabHref } from '../../../customer/tabs';
import { getRequestLocale } from '../../../i18n/server';
import { getPublicTenant } from '../../../public/server';

type Props = { params: Promise<{ tenant: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await getRequestLocale();
  return { title: messages.nav.offers };
}

/** Offers tab. No content of this kind is published in Phase 3 (D-040 O-4, O-5). */
export default async function TenantOffersPage({ params }: Props) {
  const { tenant } = await params;
  const resolved = await getPublicTenant(tenant);
  if (resolved.kind !== 'found') notFound();
  const { messages } = await getRequestLocale();
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-6 md:pt-14">
      <EmptyState
        art={<OffersArt />}
        title={messages.empty.offersTitle}
        body={messages.empty.offersBody}
        action={
          <EmptyStateLink href={tabHref(resolved.tenant.slug, 'home')}>
            {messages.empty.backHome}
          </EmptyStateLink>
        }
      />
    </main>
  );
}
