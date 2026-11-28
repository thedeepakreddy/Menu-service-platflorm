// Shared e2e fixtures (Phase 3 M3.4). The e2e web server runs as it would behind ONE trusted
// reverse proxy (WEB_TRUSTED_PROXY_HOPS=1, as staging/production must state explicitly): each test
// acts as its own visitor by sending the X-Forwarded-For entry that proxy would append. The web app
// forwards that address to the API with the BFF credential (D-037), so the API's per-visitor limits
// apply per test instead of the whole suite sharing one budget. No limit is raised for tests.
import { createHash } from 'node:crypto';

import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** A stable, distinct documentation-range address (TEST-NET-2/3, RFC 5737) for one test. */
export function visitorAddress(key: string): string {
  const digest = createHash('sha256').update(key).digest();
  const net = (digest[0] ?? 0) % 2 === 0 ? '198.51.100' : '203.0.113';
  return `${net}.${String(1 + ((digest[1] ?? 0) % 254))}`;
}

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    await use({
      ...extraHTTPHeaders,
      'x-forwarded-for': visitorAddress(`${testInfo.project.name}:${testInfo.testId}`),
    });
  },
});

/** Headers for a context a test creates itself (`browser.newContext`), as a further visitor. */
export function visitorHeaders(label: string): { 'x-forwarded-for': string } {
  const info = test.info();
  return { 'x-forwarded-for': visitorAddress(`${info.project.name}:${info.testId}:${label}`) };
}
