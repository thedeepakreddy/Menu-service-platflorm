import type { ReactNode } from 'react';

import type { Tab } from './tabs';

/**
 * Tab icons: inline SVG drawn with `currentColor`, so they follow the surrounding text colour and
 * need no icon library or network request. Always decorative: every icon sits next to its label.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const PATHS: Record<Tab, ReactNode> = {
  // A doorway under a roof: the venue's front door.
  home: (
    <>
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9v10.5h13V9" />
      <path d="M10 19.5v-5.5h4v5.5" />
    </>
  ),
  // An open menu card with lines of dishes.
  menu: (
    <>
      <path d="M4 5.5c2.7-.9 5.3-.9 8 .5 2.7-1.4 5.3-1.4 8-.5v13c-2.7-.9-5.3-.9-8 .5-2.7-1.4-5.3-1.4-8-.5z" />
      <path d="M12 6v13" />
      <path d="M6.5 9.5h3M6.5 12.5h3M14.5 9.5h3M14.5 12.5h3" />
    </>
  ),
  // A price tag.
  offers: (
    <>
      <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l7.9 7.9a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z" />
      <circle cx="8.25" cy="8.25" r="1.5" />
    </>
  ),
  // A clock face: opening hours and venue details.
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
};

export function TabIcon({ tab }: { tab: Tab }) {
  return <Icon>{PATHS[tab]}</Icon>;
}
