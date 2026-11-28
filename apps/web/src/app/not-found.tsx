import { EmptyState } from '../customer/empty-state';
import { NotFoundArt } from '../customer/illustrations';
import { getRequestLocale } from '../i18n/server';

/**
 * The one tenant-safe "not found" page (Doc 03 §3, §20; D-027; D-040 O-1). Unknown, suspended,
 * retired, reserved and non-canonical tenant addresses all end here and are indistinguishable: the
 * page names no tenant, reveals nothing about why, and offers no link to a tenant.
 */
export default async function NotFound() {
  const { messages } = await getRequestLocale();
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 pt-10 pb-12 sm:px-6 md:pt-20">
      <EmptyState
        art={<NotFoundArt />}
        title={messages.notFound.title}
        body={messages.notFound.body}
      />
    </main>
  );
}
