// Public tenant entry (Phase 3; Doc 05 §13 exit, Doc 03 §3, §20, §22–§23; D-027, D-040 O-1, O-6):
// real browser, built web app, built API, real PostgreSQL. Seeded by provision-cli (e2e fixtures).
import { expect, test, visitorHeaders } from './fixtures.js';
import pg from 'pg';

const ACTIVE = 'e2e-cafe';
const OTHER = 'e2e-bistro';

/** Absolute URL on the web app (Playwright's request API keeps encoded paths as given). */
const web = (baseURL: string | undefined, path: string) => `${baseURL ?? ''}${path}`;

test.describe('public tenant entry', () => {
  test('an active tenant renders its public identity, and only that', async ({ page }) => {
    const res = await page.goto(`/${ACTIVE}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E Cafe');
    const html = await page.content();
    expect(html).not.toContain('E2E Bistro'); // no other tenant
    // No internal identifiers anywhere in the document (Doc 03 §18).
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  test('two tenants never mix, even when requested in parallel', async ({ browser }) => {
    const [first, second] = await Promise.all([
      browser.newPage({ extraHTTPHeaders: visitorHeaders('first') }),
      browser.newPage({ extraHTTPHeaders: visitorHeaders('second') }),
    ]);
    for (let round = 0; round < 5; round += 1) {
      const [a, b] = await Promise.all([
        first.goto(`/${ACTIVE}`).then(() => first.content()),
        second.goto(`/${OTHER}`).then(() => second.content()),
      ]);
      expect(a).toContain('E2E Cafe');
      expect(a).not.toContain('E2E Bistro');
      expect(b).toContain('E2E Bistro');
      expect(b).not.toContain('E2E Cafe');
    }
    await Promise.all([first.close(), second.close()]);
  });

  test('hostile display-name markup is shown as text, never executed', async ({ page }) => {
    await page.goto('/e2e-markup');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('<script>');
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
    ).toBeUndefined();
    expect(await page.locator('b', { hasText: 'Bold' }).count()).toBe(0);
  });
});

test.describe('tenant-safe not found (O-1, D-027)', () => {
  const notFound = [
    ['unknown', '/no-such-venue'],
    ['suspended', '/e2e-closed'],
    ['retired', '/e2e-gone'],
    ['reserved word', '/admin'],
    ['upper case', '/E2E-CAFE'],
    ['percent-encoded hyphen', '/e2e%2Dcafe'],
    ['percent-encoded letter', '/%652e-cafe'],
    ['too short', '/ab'],
    ['unicode look-alike', '/e2e-c%D0%B0fe'],
    ['nested path under unknown', '/no-such-venue/menu'],
    ['suspended sub-page', '/e2e-closed/info'],
  ] as const;

  for (const [name, path] of notFound) {
    test(`${name} → 404 with the shared page`, async ({ request, baseURL }) => {
      const res = await request.get(web(baseURL, path), { maxRedirects: 0 });
      expect(res.status()).toBe(404);
      const body = await res.text();
      expect(body).not.toMatch(/E2E (Cafe|Bistro|Closed Venue|Retired Venue)/);
    });
  }

  test('unknown, suspended and retired tenants are indistinguishable', async ({ page }) => {
    // Next.js answers a notFound() on a dynamic route with its error shell (status 404, empty
    // server HTML) and renders the not-found page from the RSC payload in the browser, so the
    // comparison is made on what the visitor actually sees (recorded in docs, Phase 3 M3.1).
    const seen = async (path: string) => {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      const main = page.locator('main');
      await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
      return { title: await page.title(), html: await main.innerHTML() };
    };
    const unknown = await seen('/no-such-venue');
    expect(await seen('/e2e-closed')).toEqual(unknown);
    expect(await seen('/e2e-gone')).toEqual(unknown);
  });
});

test.describe('lifecycle is invisible in the raw server response (review finding 9)', () => {
  test('unknown, suspended and retired get byte-identical responses once the path and nonce are normalized', async ({
    request,
    baseURL,
  }) => {
    const VOLATILE = new Set(['date', 'x-request-id', 'content-length', 'content-security-policy']);
    const raw = async (path: string) => {
      const res = await request.get(web(baseURL, path), { maxRedirects: 0 });
      const headers = res.headers();
      const nonce = /'nonce-([^']+)'/.exec(headers['content-security-policy'] ?? '')?.[1] ?? '';
      const body = (await res.text()).replaceAll(nonce, 'NONCE').replaceAll(path.slice(1), 'PATH');
      // The nonce also appears in Next.js's Link preload header.
      const kept = Object.entries(headers)
        .filter(([name]) => !VOLATILE.has(name))
        .map(([name, value]) => [name, value.replaceAll(nonce, 'NONCE')])
        .sort(([a = ''], [b = '']) => a.localeCompare(b));
      const csp = (headers['content-security-policy'] ?? '').replaceAll(nonce, 'NONCE');
      return { status: res.status(), headers: kept, csp, body };
    };
    const unknown = await raw('/no-such-venue');
    expect(unknown.status).toBe(404);
    expect(await raw('/e2e-closed')).toEqual(unknown);
    expect(await raw('/e2e-gone')).toEqual(unknown);
  });
});

test.describe('no trust in client-supplied routing hints', () => {
  test('Host, X-Forwarded-Host and the raw-segment header cannot change the tenant', async ({
    request,
    baseURL,
  }) => {
    const spoofed = await request.get(web(baseURL, `/${ACTIVE}`), {
      headers: {
        'x-forwarded-host': 'e2e-bistro.example',
        'x-platform-raw-segment': OTHER,
        'x-forwarded-for': '203.0.113.9',
      },
    });
    expect(spoofed.status()).toBe(200);
    const html = await spoofed.text();
    expect(html).toContain('E2E Cafe');
    expect(html).not.toContain('E2E Bistro');
    // A forged raw-segment header cannot launder a non-canonical path into a tenant either.
    const laundered = await request.get(web(baseURL, '/e2e%2Dcafe'), {
      headers: { 'x-platform-raw-segment': ACTIVE },
    });
    expect(laundered.status()).toBe(404);
  });
});

test.describe('no shared caching (O-6)', () => {
  test('tenant pages are private and not stored', async ({ request, baseURL }) => {
    for (const path of [`/${ACTIVE}`, `/${ACTIVE}/menu`, '/no-such-venue']) {
      const res = await request.get(web(baseURL, path));
      const cacheControl = res.headers()['cache-control'] ?? '';
      expect(cacheControl, path).toContain('no-store');
      expect(cacheControl, path).toContain('private');
    }
  });

  test('a suspension is visible on the very next request (no stale tenant)', async ({
    request,
    baseURL,
  }, testInfo) => {
    const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
    if (adminUrl === undefined || adminUrl === '') {
      throw new Error('TEST_DATABASE_ADMIN_URL is required for the lifecycle e2e test');
    }
    // One tenant per Playwright project, so parallel projects never race on it.
    const slug = `e2e-toggle-${testInfo.project.name.replace('chromium-', '')}`;
    const admin = new pg.Client({
      connectionString: adminUrl.replace(/\/[^/]*$/, '/platform_e2e'),
    });
    await admin.connect();
    try {
      await admin.query("UPDATE app.tenants SET status = 'active' WHERE slug = $1", [slug]);
      expect((await request.get(web(baseURL, `/${slug}`))).status()).toBe(200);
      await admin.query("UPDATE app.tenants SET status = 'suspended' WHERE slug = $1", [slug]);
      expect((await request.get(web(baseURL, `/${slug}`))).status()).toBe(404);
      await admin.query("UPDATE app.tenants SET status = 'active' WHERE slug = $1", [slug]);
      expect((await request.get(web(baseURL, `/${slug}`))).status()).toBe(200);
    } finally {
      await admin.query("UPDATE app.tenants SET status = 'active' WHERE slug = $1", [slug]);
      await admin.end();
    }
  });
});

test.describe('per-visitor limits through the web tier (D-037)', () => {
  test('one visitor exhausting the public budget does not deny service to another', async ({
    request,
    baseURL,
  }) => {
    const greedy = visitorHeaders('greedy');
    const statuses: number[] = [];
    // The API allows 120 public requests per visitor and minute (D-031/D-037).
    for (let i = 0; i < 125; i += 1) {
      statuses.push((await request.get(web(baseURL, `/${OTHER}`), { headers: greedy })).status());
    }
    expect(statuses.slice(0, 100).every((s) => s === 200)).toBe(true);
    // Refused at the API: the visitor gets the generic error state, never a tenant page.
    expect(statuses.at(-1)).toBe(500);
    const refused = await request.get(web(baseURL, `/${OTHER}`), { headers: greedy });
    expect(await refused.text()).not.toContain('E2E Bistro');
    // Another visitor is unaffected.
    const other = await request.get(web(baseURL, `/${OTHER}`), {
      headers: visitorHeaders('patient'),
    });
    expect(other.status()).toBe(200);
  });
});
