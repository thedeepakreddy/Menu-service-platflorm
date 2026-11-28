import { notFound } from 'next/navigation';

import { getRequestLocale } from '../../../i18n/server';
import { getPublicTenant } from '../../../public/server';

export default async function TenantMenuPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if ((await getPublicTenant(tenant)).kind !== 'found') notFound();
  const { messages } = await getRequestLocale();
  return (
    <main id="main">
      <h1>{messages.empty.menuTitle}</h1>
      <p>{messages.empty.menuBody}</p>
    </main>
  );
}
