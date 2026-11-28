import type { ReactNode } from 'react';

/**
 * Empty-state illustrations (Phase 3; D-040 O-4). Line drawings in token colours only (fill and
 * stroke utilities), no text inside the art, decorative to assistive technology: the heading and
 * body next to them carry the meaning.
 */
function Art({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 140"
      className="h-auto w-44 sm:w-52"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The table surface every scene stands on. */}
      <path d="M16 122h168" className="stroke-line-strong" strokeWidth="2" />
      {children}
    </svg>
  );
}

/** A table-tent menu card standing on the table, its lines still blank. */
export function MenuArt() {
  return (
    <Art>
      <path
        d="M62 122 82 30h56l20 92"
        className="fill-accent-soft stroke-accent-ink"
        strokeWidth="2.5"
      />
      <path d="M82 30h56" className="stroke-accent-ink" strokeWidth="2.5" />
      <path d="M96 50h28" className="stroke-accent-ink" strokeWidth="2.5" />
      <path
        d="M90 68h40M88 82h44M86 96h48"
        className="stroke-line-strong"
        strokeWidth="2"
        strokeDasharray="2 7"
      />
      {/* A small plate and cup beside the card. */}
      <ellipse
        cx="38"
        cy="118"
        rx="16"
        ry="4"
        className="fill-surface-raised stroke-ink-subtle"
        strokeWidth="2"
      />
      <path
        d="M168 104h12v10a6 6 0 0 1-6 6 6 6 0 0 1-6-6z"
        className="fill-surface-raised stroke-ink-subtle"
        strokeWidth="2"
      />
      <path
        d="M171 96c0-3 3-3 3-6M177 96c0-3 3-3 3-6"
        className="stroke-line-strong"
        strokeWidth="2"
      />
    </Art>
  );
}

/** A price tag on a string, with nothing written on it yet. */
export function OffersArt() {
  return (
    <Art>
      <path d="M100 14c-10 0-14 10-8 18" className="stroke-ink-subtle" strokeWidth="2" />
      <path
        d="M72 46 98 26a4 4 0 0 1 4.8 0L128 46v62a6 6 0 0 1-6 6H78a6 6 0 0 1-6-6z"
        className="fill-accent-soft stroke-accent-ink"
        strokeWidth="2.5"
      />
      <circle cx="100" cy="44" r="5" className="fill-surface stroke-accent-ink" strokeWidth="2.5" />
      <path
        d="M84 70h32M84 84h32M84 98h20"
        className="stroke-line-strong"
        strokeWidth="2"
        strokeDasharray="2 7"
      />
      <path
        d="M40 104l6-6M40 98l6 6M156 70l5-5M156 65l5 5"
        className="stroke-line-strong"
        strokeWidth="2"
      />
    </Art>
  );
}

/** A shopfront with an awning and a door, the venue's details yet to be posted. */
export function InfoArt() {
  return (
    <Art>
      <path
        d="M50 58h100v64H50z"
        className="fill-surface-raised stroke-ink-subtle"
        strokeWidth="2"
      />
      <path
        d="M44 40h112l-6 20c-4 6-12 6-16 0-4 6-12 6-16 0-4 6-12 6-16 0-4 6-12 6-16 0-4 6-12 6-16 0-4 6-12 6-16 0z"
        className="fill-accent-soft stroke-accent-ink"
        strokeWidth="2.5"
      />
      <path
        d="M86 122V82h28v40"
        className="fill-surface-sunken stroke-accent-ink"
        strokeWidth="2.5"
      />
      <path d="M108 102v2" className="stroke-accent-ink" strokeWidth="3" />
      <path d="M60 76h16v20H60zM124 76h16v20h-16z" className="stroke-line-strong" strokeWidth="2" />
      <circle cx="100" cy="24" r="9" className="fill-surface stroke-ink-subtle" strokeWidth="2" />
      <path d="M100 19v5l3 2" className="stroke-ink-subtle" strokeWidth="2" />
    </Art>
  );
}

/**
 * A table card with a QR code: the way visitors arrive. Deliberately neutral, so the not-found
 * page never hints whether a venue closed, moved or never existed (D-027).
 */
export function NotFoundArt() {
  return (
    <Art>
      <path
        d="M70 122V36a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v86"
        className="fill-surface-raised stroke-ink-subtle"
        strokeWidth="2"
      />
      <path d="M82 46h36v36H82z" className="fill-accent-soft stroke-accent-ink" strokeWidth="2.5" />
      <path
        d="M88 52h8v8h-8zM104 52h8v8h-8zM88 68h8v8h-8zM106 70h4v4h-4zM102 66h2M110 66h2"
        className="fill-accent-ink"
      />
      <path
        d="M86 96h28M90 106h20"
        className="stroke-line-strong"
        strokeWidth="2"
        strokeDasharray="2 7"
      />
      <path
        d="M146 58c8 6 8 18 0 24M156 50c12 10 12 30 0 40"
        className="stroke-line-strong"
        strokeWidth="2"
      />
    </Art>
  );
}

/** A cup tipped on its side: something spilled, nothing broken for good. */
export function ErrorArt() {
  return (
    <Art>
      <path
        d="M66 104c0-16 12-30 30-30h22v34H96c-18 0-30-4-30-4z"
        className="fill-surface-raised stroke-ink-subtle"
        strokeWidth="2"
      />
      <path d="M118 80h8a8 8 0 0 1 0 16h-8" className="stroke-ink-subtle" strokeWidth="2" />
      <path
        d="M66 104c-10 2-20 8-14 14 8 6 40 6 60 2"
        className="fill-accent-soft stroke-accent-ink"
        strokeWidth="2.5"
      />
      <path d="M140 112h20M150 104v4" className="stroke-line-strong" strokeWidth="2" />
    </Art>
  );
}
