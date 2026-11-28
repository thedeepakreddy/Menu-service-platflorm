import { REQUEST_ID_HEADER, errorEnvelopeSchema, healthResponseSchema } from '@platform/contracts';
import { expect, test } from './fixtures.js';

const API = 'http://127.0.0.1:4100';

test('web placeholder page renders', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['x-powered-by']).toBeUndefined();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Hospitality Experience Platform',
  );
  // No horizontal overflow at this viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test('API health endpoint matches the contract', async ({ request }) => {
  const res = await request.get(`${API}/health`);
  expect(res.status()).toBe(200);
  expect(healthResponseSchema.parse(await res.json())).toEqual({ status: 'ok', service: 'api' });
  expect(res.headers()[REQUEST_ID_HEADER]).toBeTruthy();
});

test('API unknown route returns the error envelope', async ({ request }) => {
  const res = await request.get(`${API}/no-such-route`);
  expect(res.status()).toBe(404);
  const body = errorEnvelopeSchema.parse(await res.json());
  expect(body.error.code).toBe('NOT_FOUND');
});

test('API sends the security baseline headers and allows no cross-origin access by default', async ({
  request,
}) => {
  const res = await request.get(`${API}/health`, { headers: { Origin: 'https://other.example' } });
  const headers = res.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['access-control-allow-origin']).toBeUndefined();
});

test('web sends the security baseline headers', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
});
