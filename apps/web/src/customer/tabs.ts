/**
 * The four customer tabs (Phase 3; D-040 O-4). Every tab always exists and always leads to a real
 * page: content that is not published yet is an honest empty state, never a broken link.
 */
export const TABS = ['home', 'menu', 'offers', 'info'] as const;
export type Tab = (typeof TABS)[number];

/** Path of a tab for a canonical tenant slug (the only kind that ever reaches a rendered page). */
export function tabHref(slug: string, tab: Tab): string {
  return tab === 'home' ? `/${slug}` : `/${slug}/${tab}`;
}

/** The tab a pathname belongs to, or undefined when it is not one of this tenant's tab pages. */
export function activeTab(slug: string, pathname: string): Tab | undefined {
  return TABS.find((tab) => pathname === tabHref(slug, tab));
}
