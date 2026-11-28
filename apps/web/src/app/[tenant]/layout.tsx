import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getPublicTenant } from '../../public/server';

/**
 * Public tenant entry (Phase 3; Doc 05 §13, Doc 03 §3, D-027, D-040). The tenant comes ONLY from
 * the validated route segment, resolved server-side by the API on every request: never from a
 * header, cookie, host name or client state. Anything but an active tenant with a canonical slug
 * is the shared not-found page.
 */
export const dynamic = 'force-dynamic';

type Props = { children: ReactNode; params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { tenant } = await params;
  const resolved = await getPublicTenant(tenant);
  if (resolved.kind !== 'found') return { robots: { index: false, follow: false } };
  return { title: resolved.tenant.displayName, robots: { index: false, follow: false } };
}

export default async function TenantLayout({ children, params }: Props) {
  const { tenant } = await params;
  const resolved = await getPublicTenant(tenant);
  if (resolved.kind !== 'found') notFound();
  return (
    <div>
      <header>
        <p>{resolved.tenant.displayName}</p>
      </header>
      {children}
    </div>
  );
}
