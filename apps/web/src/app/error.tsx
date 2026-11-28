'use client';

import { EmptyState } from '../customer/empty-state';
import { ErrorArt } from '../customer/illustrations';
import { useMessages } from '../i18n/client';

/**
 * Generic failure state (Doc 03 §20 "network failure": explain and offer retry). It never shows
 * error details: they stay in server logs.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const messages = useMessages();
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 pt-10 pb-12 sm:px-6 md:pt-20">
      <EmptyState
        art={<ErrorArt />}
        title={messages.error.title}
        body={messages.error.body}
        action={
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-control bg-accent px-5 font-semibold text-on-accent hover:bg-accent-strong"
            onClick={reset}
          >
            {messages.error.retry}
          </button>
        }
      />
    </main>
  );
}
