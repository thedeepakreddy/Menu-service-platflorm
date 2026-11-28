// Locale choice (Phase 3 M3.4; D-040 O-2, O-10; P3-07, P3-08): a CSRF-checked form POST that
// works with and without JavaScript, a session-only cookie, and no open redirect.
import { expect, test, visitorHeaders } from './fixtures.js';

const PAGE = '/e2e-cafe/menu';
const COOKIE = '__Host-platform-locale';

test.describe('language choice', () => {
  test('switching to Hungarian and back keeps the visitor on the same page', async ({
    page,
    context,
  }) => {
    await page.goto(PAGE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: 'Magyar' }).click();
    await expect(page).toHaveURL(PAGE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Az étlap hamarosan érkezik');
    await expect(page.getByRole('button', { name: 'Magyar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const cookie = (await context.cookies()).find((c) => c.name === COOKIE);
    expect(cookie).toMatchObject({
      value: 'hu',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      expires: -1, // session cookie: gone when the browser closes (P3-08)
    });

    // The choice follows the visitor to other pages of the tenant.
    await page
      .getByRole('navigation', { name: 'Fő navigáció' })
      .getByRole('link', { name: 'Infó' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A hely adatai hamarosan elérhetők',
    );

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('an explicit choice wins over the browser language', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'hu-HU',
      extraHTTPHeaders: visitorHeaders('hu'),
    });
    const page = await context.newPage();
    await page.goto(PAGE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
    await page.getByRole('button', { name: 'English' }).click();
    await page.goto('/e2e-cafe');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });

  test('works without JavaScript (plain form POST)', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      extraHTTPHeaders: visitorHeaders('no-js'),
    });
    const page = await context.newPage();
    await page.goto(PAGE);
    await page.getByRole('button', { name: 'Magyar' }).click();
    await expect(page).toHaveURL(PAGE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
    await context.close();
  });
});

test.describe('locale switch endpoint security', () => {
  test('a cross-site POST is refused and sets nothing (CSRF)', async ({ request }) => {
    const res = await request.post('/platform/locale', {
      headers: { origin: 'https://evil.example' },
      form: { locale: 'hu', return: PAGE },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
    expect(res.headers()['set-cookie']).toBeUndefined();
  });

  test('a foreign return target never leaves the site (no open redirect)', async ({
    request,
    baseURL,
  }) => {
    for (const target of ['//evil.example/', 'https://evil.example/', '/\\evil.example']) {
      const res = await request.post('/platform/locale', {
        headers: { origin: baseURL ?? '' },
        form: { locale: 'hu', return: target },
        maxRedirects: 0,
      });
      expect(res.status(), target).toBe(303);
      expect(res.headers().location, target).toBe(`${baseURL ?? ''}/`);
    }
  });

  test('GET is not a way to switch', async ({ request }) => {
    const res = await request.get('/platform/locale?locale=hu', { maxRedirects: 0 });
    expect(res.status()).toBe(405);
    expect(res.headers()['set-cookie']).toBeUndefined();
  });
});
