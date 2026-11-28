// Locale switch (Phase 3 M3.4; P3-07, P3-08): CSRF-checked POST, no open redirect, minimal
// session cookie.
import { describe, expect, it } from 'vitest';

import { createLocaleSwitchHandler, safeReturnPath } from './switch';

const ORIGIN = 'https://app.example';
const handler = createLocaleSwitchHandler({ publicOrigin: ORIGIN });

function post(
  body: string,
  headers: Record<string, string> = {},
  init: { method?: string } = {},
): Request {
  return new Request(`${ORIGIN}/platform/locale`, {
    method: init.method ?? 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: init.method === 'GET' ? undefined : body,
  });
}

describe('safeReturnPath (no open redirect)', () => {
  it.each([
    ['/cafe-roma/menu', '/cafe-roma/menu'],
    ['/', '/'],
    ['/cafe-roma/menu?x=1#y', '/cafe-roma/menu'],
    ['/a/../cafe-roma', '/cafe-roma'],
    ['//evil.example/x', '/'],
    ['/\\evil.example', '/'],
    ['\\\\evil.example', '/'],
    ['https://evil.example/', '/'],
    ['javascript:alert(1)', '/'],
    ['/%2F%2Fevil.example', '/%2F%2Fevil.example'],
    ['/cafe\nroma', '/'],
    ['/cafe\troma', '/'],
    ['', '/'],
    ['cafe-roma', '/'],
    [`/${'a'.repeat(600)}`, '/'],
  ])('%j → %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it('refuses non-strings', () => {
    expect(safeReturnPath(null)).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
  });
});

describe('locale switch handler', () => {
  it('sets a session-only locale cookie and returns to the same page', async () => {
    const res = await handler(post('locale=hu&return=%2Fcafe-roma%2Fmenu'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/cafe-roma/menu`);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toBe('__Host-platform-locale=hu; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect(cookie).not.toMatch(/Max-Age|Expires|Domain/i);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('redirects an unsafe return target to the site root, never elsewhere', async () => {
    const res = await handler(post('locale=en&return=%2F%2Fevil.example%2F'));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
  });

  it.each([
    ['a foreign origin', { origin: 'https://evil.example' }],
    ['no origin', { origin: '' }],
    ['the "null" origin', { origin: 'null' }],
  ])('refuses %s (CSRF)', async (_name, headers) => {
    const res = await handler(post('locale=hu', headers));
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses everything when no public origin is configured (fail closed)', async () => {
    const closed = createLocaleSwitchHandler({ publicOrigin: undefined });
    expect((await closed(post('locale=hu'))).status).toBe(403);
  });

  it.each([
    ['an unsupported locale', 'locale=de', 400],
    ['markup as locale', 'locale=%3Cscript%3E', 400],
    ['no locale', 'return=%2F', 400],
    ['a cookie-injection attempt', 'locale=hu%3B%20Domain%3Devil.example', 400],
  ])('refuses %s', async (_name, body, status) => {
    const res = await handler(post(body));
    expect(res.status).toBe(status);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses other content types and oversized bodies', async () => {
    expect(
      (await handler(post('{"locale":"hu"}', { 'content-type': 'application/json' }))).status,
    ).toBe(415);
    expect((await handler(post(`locale=hu&return=/${'a'.repeat(2000)}`))).status).toBe(413);
  });

  it('accepts POST only', async () => {
    const res = await handler(post('', {}, { method: 'GET' }));
    expect(res.status).toBe(405);
  });
});
