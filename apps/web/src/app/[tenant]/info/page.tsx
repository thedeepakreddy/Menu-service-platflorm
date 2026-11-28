import { notFound } from 'next/navigation';

import { getRequestLocale } from '../../../i18n/server';
import { getPublicTenant } from '../../../public/server';

export default async function TenantInfoPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if ((await getPublicTenant(tenant)).kind !== 'found') notFound();
  const { messages } = await getRequestLocale();
  return (
    <main id="main">
      <h1>{messages.empty.infoTitle}</h1>
      <p>{messages.empty.infoBody}</p>
    </main>
  );
}
