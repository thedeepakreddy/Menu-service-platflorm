'use client';

import { useLinkStatus } from 'next/link';

/**
 * Loading feedback for a navigation in progress (Doc 03 §20 "Loading"; P3-03). Tenant pages are
 * resolved completely before their first byte (a streamed loading boundary would answer a missing
 * tenant with 200), so waiting happens only on client navigation: the link the visitor chose shows
 * this bar until the next page arrives. Visual only; when the page changes, Next.js announces its
 * title to screen readers. Reduced motion turns the pulse into a static bar (globals.css).
 * Must be rendered inside a `next/link` `<Link>`.
 */
export function PendingIndicator() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? 'true' : 'false'}
      className={[
        'pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent transition-opacity duration-200 ease-standard',
        pending ? 'animate-pulse opacity-100' : 'opacity-0',
      ].join(' ')}
    />
  );
}
