import { notFound } from 'next/navigation';

import { getRequestLocale } from '../../i18n/server';
import { getPublicTenant } from '../../public/server';

export default async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const resolved = await getPublicTenant(tenant);
  if (resolved.kind !== 'found') notFound();
  const { messages } = await getRequestLocale();
  return (
    <main id="main">
      <p>{messages.home.eyebrow}</p>
      <h1>{resolved.tenant.displayName}</h1>
      <p>{messages.home.intro}</p>
    </main>
  );
}
