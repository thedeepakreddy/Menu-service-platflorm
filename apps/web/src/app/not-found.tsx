import { getRequestLocale } from '../i18n/server';

/**
 * The one tenant-safe "not found" page (Doc 03 §3, §20; D-027; D-040 O-1). Unknown, suspended,
 * retired, reserved and non-canonical tenant addresses all end here and are indistinguishable: the
 * page names no tenant and reveals nothing about why.
 */
export default async function NotFound() {
  const { messages } = await getRequestLocale();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{messages.notFound.title}</h1>
      <p className="mt-4 text-ink-muted">{messages.notFound.body}</p>
    </main>
  );
}
