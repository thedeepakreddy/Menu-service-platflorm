// Browser login end to end (D-034; audit browser gap, C-05, C-06): a real Chromium, the built web
// app (BFF), the built API, real PostgreSQL and a strict local OIDC provider over TLS. Proves that
// the browser stores and sends the session cookie, that JavaScript cannot read it, that the
// session is server-side (the API honours it and revokes it on logout), and that cross-site
// logout is refused.
import { expect, test } from './fixtures.js';

const API = 'http://127.0.0.1:4100';
const WEB = 'http://localhost:3100';
// Synthetic, test-only (matches playwright.config.ts).
const BFF_CREDENTIAL = 'synthetic-e2e-bff-credential-not-a-secret-0001';

// The BROWSER visits the test provider's login page, which uses a throwaway self-signed
// certificate. Only the test browser skips that check; the web and API servers verify the
// provider's certificate (NODE_EXTRA_CA_CERTS) on every server-side call.
test.use({ ignoreHTTPSErrors: true });

test('owner login, server-side session, and logout in a real browser', async ({
  page,
  context,
}) => {
  // 1. Login: web → provider (TLS) → callback → API session → back home.
  const response = await page.goto('/auth/owner/login');
  expect(response?.status()).toBe(200);
  expect(page.url()).toBe(`${WEB}/`);

  // 2. The browser holds one opaque, HttpOnly, Secure, SameSite=Lax, host-only cookie.
  const cookies = await context.cookies(WEB);
  const session = cookies.find((c) => c.name === '__Host-platform-session');
  expect(session).toBeDefined();
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
  expect(session?.value).toMatch(/^owner\.[A-Za-z0-9_-]{43}$/);
  expect(cookies.some((c) => c.name === '__Host-platform-login')).toBe(false); // cleared
  expect(await page.evaluate(() => document.cookie)).toBe(''); // JavaScript sees nothing

  // 3. The BFF reports the session; the API honours it server-side.
  const status = await page.evaluate(
    async () => (await fetch('/auth/session')).json() as Promise<unknown>,
  );
  expect(status).toMatchObject({ authenticated: true, kind: 'owner' });
  const token = session?.value.split('.')[1] ?? '';
  const apiHeaders = {
    'x-platform-bff-credential': BFF_CREDENTIAL,
    authorization: `Session ${token}`,
  };
  const owned = await page.request.get(`${API}/owner/tenants/e2e-cafe`, { headers: apiHeaders });
  expect(owned.status()).toBe(200);

  // 4. A cross-site logout is refused and the session survives.
  const cross = await page.request.post(`${WEB}/auth/logout`, {
    headers: { origin: 'https://evil.example' },
    maxRedirects: 0,
  });
  expect(cross.status()).toBe(403);
  expect(
    (await page.request.get(`${API}/owner/tenants/e2e-cafe`, { headers: apiHeaders })).status(),
  ).toBe(200);

  // 5. A same-origin form POST logs out: provider end-session (no ID token in the URL), home.
  const endSession: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/end_session')) endSession.push(r.url());
  });
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/logout';
    document.body.appendChild(form);
    form.submit();
  });
  await page.waitForURL(`${WEB}/`);
  await expect.poll(() => endSession.length).toBeGreaterThan(0);
  expect(endSession[0]).toContain('client_id=owner-web');
  expect(endSession[0]).not.toContain('id_token_hint');
  expect((await context.cookies(WEB)).some((c) => c.name === '__Host-platform-session')).toBe(
    false,
  );

  // 6. The old token is revoked server-side: replaying it fails at the API.
  expect(
    (await page.request.get(`${API}/owner/tenants/e2e-cafe`, { headers: apiHeaders })).status(),
  ).toBe(401);
  const after = await page.evaluate(
    async () => (await fetch('/auth/session')).json() as Promise<unknown>,
  );
  expect(after).toEqual({ authenticated: false });
});
