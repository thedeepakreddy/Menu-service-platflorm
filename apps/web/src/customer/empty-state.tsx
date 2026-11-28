import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * An honest "not published yet" state (Phase 3; D-040 O-4; Doc 03 §20): what is missing, what the
 * visitor can do instead, and a way back. It never pretends content exists and never shows a
 * placeholder that looks like real data.
 */
export function EmptyState({
  art,
  title,
  body,
  action,
}: {
  art: ReactNode;
  title: string;
  body: string;
  /** The way forward (back home, try again); omitted when there is nowhere meaningful to go. */
  action?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="empty-title"
      className="flex flex-col items-start gap-6 rounded-card bg-surface-raised px-6 py-8 shadow-card sm:flex-row sm:items-center sm:gap-8 sm:px-8"
    >
      <div className="flex w-full justify-center rounded-card bg-surface-sunken py-6 sm:w-auto sm:px-6">
        {art}
      </div>
      <div className="max-w-[38ch]">
        <h1
          id="empty-title"
          className="text-2xl leading-tight font-semibold tracking-tight text-balance"
        >
          {title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">{body}</p>
        {action === undefined ? null : <div className="mt-6">{action}</div>}
      </div>
    </section>
  );
}

/** Secondary action: a quiet outlined link. */
export function EmptyStateLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex min-h-11 items-center rounded-control border border-line-strong px-4 font-medium text-accent-ink hover:bg-surface-sunken"
    >
      {children}
    </Link>
  );
}
