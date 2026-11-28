'use client';

import { useMessages } from '../i18n/client';

/**
 * Generic failure state (Doc 03 §20 "network failure": explain and offer retry). It never shows
 * error details: they stay in server logs.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const messages = useMessages();
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{messages.error.title}</h1>
      <p className="mt-4 text-neutral-700">{messages.error.body}</p>
      <button type="button" className="mt-6 underline" onClick={reset}>
        {messages.error.retry}
      </button>
    </main>
  );
}
