import { getRequestLocale } from '../i18n/server';

/** The platform root. It names no tenant and lists none (no tenant directory, D-027). */
export default async function PlatformHome() {
  const { messages } = await getRequestLocale();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{messages.platform.name}</h1>
      <p className="mt-4 text-neutral-700">{messages.platform.intro}</p>
    </main>
  );
}
