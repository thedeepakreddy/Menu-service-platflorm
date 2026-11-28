// Shared e2e fixtures (Phase 3 M3.4). The e2e web server runs as it would behind ONE trusted
// reverse proxy (WEB_TRUSTED_PROXY_HOPS=1, as staging/production must state explicitly): each test
// acts as its own visitor by sending the X-Forwarded-For entry that proxy would append. The web app
// forwards that address to the API with the BFF credential (D-037), so the API's per-visitor limits
// apply per test instead of the whole suite sharing one budget. No limit is raised for tests.
import { createHash } from 'node:crypto';

import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * A stable, distinct address for one test run, from the RFC 2544 benchmarking range
 * 198.18.0.0/15 (131,072 addresses). A small pool let unrelated runs collide with the visitor that
 * deliberately exhausts its budget, so they were throttled at random (found in M3.6).
 */
export function visitorAddress(key: string): string {
  const digest = createHash('sha256').update(key).digest();
  const second = 18 + ((digest[0] ?? 0) & 1);
  return `198.${String(second)}.${String(digest[1] ?? 0)}.${String(1 + ((digest[2] ?? 0) % 254))}`;
}

/** One visitor per test run: a repeated or retried run must not inherit an exhausted budget. */
function runKey(info: {
  project: { name: string };
  testId: string;
  repeatEachIndex: number;
  retry: number;
}) {
  return `${info.project.name}:${info.testId}:${String(info.repeatEachIndex)}:${String(info.retry)}`;
}

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    await use({
      ...extraHTTPHeaders,
      'x-forwarded-for': visitorAddress(runKey(testInfo)),
    });
  },
});

/** Headers for a context a test creates itself (`browser.newContext`), as a further visitor. */
export function visitorHeaders(label: string): { 'x-forwarded-for': string } {
  const info = test.info();
  return { 'x-forwarded-for': visitorAddress(`${runKey(info)}:${label}`) };
}
