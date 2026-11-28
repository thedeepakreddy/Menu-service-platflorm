import { notFound } from 'next/navigation';

import { getRequestLocale } from '../../../i18n/server';
import { getPublicTenant } from '../../../public/server';

export default async function TenantOffersPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  if ((await getPublicTenant(tenant)).kind !== 'found') notFound();
  const { messages } = await getRequestLocale();
  return (
    <main id="main">
      <h1>{messages.empty.offersTitle}</h1>
      <p>{messages.empty.offersBody}</p>
    </main>
  );
}
