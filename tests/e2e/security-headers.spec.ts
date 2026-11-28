// Web security headers (Phase 3 M3.5; G-31; D-040 O-6): a strict nonce CSP on every page with
// zero violations in real use, and no shared caching of anything customer-facing.
import { expect, test } from './fixtures.js';

const PAGES = ['/', '/e2e-cafe', '/e2e-cafe/menu', '/e2e-cafe/offers', '/e2e-cafe/info'];

function directive(csp: string, name: string): string[] {
  const found = csp.split('; ').find((d) => d.startsWith(`${name} `) || d === name);
  return found === undefined ? [] : found.split(' ').slice(1);
}

test.describe('Content-Security-Policy (G-31)', () => {
  test('every page has a strict nonce policy, and the nonce is fresh per request', async ({
    request,
  }) => {
    const nonces = new Set<string>();
    for (const path of [...PAGES, '/no-such-venue']) {
      for (let i = 0; i < 2; i += 1) {
        const res = await request.get(path);
        const csp = res.headers()['content-security-policy'] ?? '';
        const script = directive(csp, 'script-src');
        const nonce = script.find((s) => s.startsWith("'nonce-"));
        expect(nonce, path).toBeDefined();
        nonces.add(nonce ?? '');
        expect(script, path).toContain("'strict-dynamic'");
        expect(script, path).not.toContain("'unsafe-inline'");
        expect(script, path).not.toContain("'unsafe-eval'");
        expect(directive(csp, 'object-src'), path).toEqual(["'none'"]);
        expect(directive(csp, 'base-uri'), path).toEqual(["'none'"]);
        expect(directive(csp, 'frame-ancestors'), path).toEqual(["'none'"]);
        // Every script the server sends carries exactly this request's nonce.
        const html = await res.text();
        const value = (nonce ?? '').slice("'nonce-".length, -1);
        const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
        expect(scripts.length, path).toBeGreaterThan(0);
        for (const tag of scripts) expect(tag, path).toContain(`nonce="${value}"`);
      }
    }
    expect(nonces.size).toBe((PAGES.length + 1) * 2);
  });

  test('real browsing triggers no CSP violation, and the app still hydrates', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cspViolations: string[] };
      w.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    await page.goto('/e2e-cafe');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const label of ['Menu', 'Offers', 'Info', 'Home']) {
      await nav.getByRole('link', { name: label }).click();
      // aria-current moves on client navigation only if React hydrated (scripts ran).
      await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    }
    await page.goto('/no-such-venue');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // client-rendered 404
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    );
    expect(violations).toEqual([]);
  });
});

test.describe('no shared caching of customer pages (O-6)', () => {
  test('pages, the not-found page and the locale switch are private and never stored', async ({
    request,
    baseURL,
  }) => {
    const responses = await Promise.all([
      ...[...PAGES, '/no-such-venue', '/e2e-closed'].map((p) => request.get(p)),
      request.post('/platform/locale', {
        headers: { origin: baseURL ?? '' },
        form: { locale: 'hu', return: '/e2e-cafe' },
        maxRedirects: 0,
      }),
    ]);
    for (const res of responses) {
      const cacheControl = res.headers()['cache-control'] ?? '';
      expect(cacheControl, res.url()).toContain('no-store');
      expect(cacheControl, res.url()).not.toMatch(/public|s-maxage|stale-while-revalidate/);
    }
  });
});

test.describe('anonymous customer context (P3-08, P3-13)', () => {
  test('browsing customer pages sets no cookie and reveals no login state', async ({ request }) => {
    for (const path of [...PAGES, '/no-such-venue']) {
      const res = await request.get(path);
      expect(res.headers()['set-cookie'], path).toBeUndefined();
      const html = await res.text();
      expect(html, path).not.toMatch(/\/auth\/(owner|operator)|__Host-platform-session/);
    }
  });
});

test.describe('search indexing stays off (D-040 O-7; P3-15)', () => {
  test('every customer page, including not-found, is noindex and nofollow', async ({ page }) => {
    for (const path of [...PAGES, '/no-such-venue', '/e2e-closed']) {
      await page.goto(path);
      // Next.js adds its own robots tag to 404 responses; every tag present must say noindex.
      const contents = await page
        .locator('meta[name="robots"]')
        .evaluateAll((metas) => metas.map((m) => m.getAttribute('content') ?? ''));
      expect(contents.length, path).toBeGreaterThan(0);
      for (const content of contents) expect(content, path).toContain('noindex');
      if (!path.startsWith('/no-such') && path !== '/e2e-closed') {
        expect(contents, path).toEqual(['noindex, nofollow']);
      }
    }
  });
});
