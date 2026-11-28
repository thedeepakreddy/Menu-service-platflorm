// Public tenant resolution (Phase 3; D-027, D-040 O-1, O-5, O-6): hostile input never reaches the
// API, only the public contract reaches pages, and every API failure is an explicit error state.
import { describe, expect, it } from 'vitest';

import { rawFirstSegment } from './raw-segment';
import {
  createTenantResolver,
  isCanonicalSlug,
  PublicApiUnavailableError,
} from './tenant-resolver';

type Call = { url: string; init: RequestInit | undefined };

function fakeApi(response: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const input = (slug: string, rawSegment: string | undefined = slug) => ({
  slug,
  rawSegment,
  clientAddress: '198.51.100.7',
});

describe('canonical slugs only (O-1)', () => {
  it.each([
    ['upper case', 'Cafe-Roma', 'Cafe-Roma'],
    ['percent-encoded hyphen', 'cafe-roma', 'cafe%2Droma'],
    ['percent-encoded letter', 'cafe', '%63afe'],
    ['reserved word', 'admin', 'admin'],
    ['too short', 'ab', 'ab'],
    ['too long', 'a'.repeat(64), 'a'.repeat(64)],
    ['leading hyphen', '-cafe', '-cafe'],
    ['dot segment', '..', '..'],
    ['unicode look-alike', 'cаfe', 'c%D0%B0fe'],
    ['missing raw segment', 'cafe', undefined],
    ['whitespace', 'cafe roma', 'cafe%20roma'],
  ])('refuses %s without calling the API', async (_name, slug, raw) => {
    const api = fakeApi(() => ok({ slug, displayName: 'X' }));
    const resolve = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: undefined,
      fetch: api.fetchFn,
    });
    expect(await resolve({ slug, rawSegment: raw, clientAddress: '198.51.100.7' })).toEqual({
      kind: 'not-found',
    });
    expect(api.calls).toHaveLength(0);
    expect(isCanonicalSlug(slug, raw)).toBe(false);
  });

  it('accepts an exact canonical slug', () => {
    expect(isCanonicalSlug('cafe-roma', 'cafe-roma')).toBe(true);
  });
});

describe('API interaction', () => {
  it('returns only the public contract fields for an active tenant', async () => {
    const api = fakeApi(() => ok({ slug: 'cafe-roma', displayName: 'Café Roma' }));
    const resolve = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: undefined,
      fetch: api.fetchFn,
    });
    expect(await resolve(input('cafe-roma'))).toEqual({
      kind: 'found',
      tenant: { slug: 'cafe-roma', displayName: 'Café Roma' },
    });
    expect(api.calls[0]?.url).toBe('http://api.test/public/tenants/cafe-roma');
    expect(api.calls[0]?.init?.cache).toBe('no-store');
    expect(api.calls[0]?.init?.redirect).toBe('error');
  });

  it('treats the API 404 (unknown, suspended, retired alike) as not found', async () => {
    const api = fakeApi(() => new Response('{}', { status: 404 }));
    const resolve = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: undefined,
      fetch: api.fetchFn,
    });
    expect(await resolve(input('cafe-roma'))).toEqual({ kind: 'not-found' });
  });

  it.each([
    ['an internal id or extra field', { slug: 'cafe-roma', displayName: 'X', id: 'uuid' }],
    ['another tenant’s slug', { slug: 'other-cafe', displayName: 'X' }],
    ['a malformed body', { displayName: 'X' }],
  ])('refuses a reply with %s (contract seam, O-5)', async (_name, body) => {
    const api = fakeApi(() => ok(body));
    const resolve = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: undefined,
      fetch: api.fetchFn,
    });
    await expect(resolve(input('cafe-roma'))).rejects.toBeInstanceOf(PublicApiUnavailableError);
  });

  it.each([429, 500, 503, 301])(
    'maps an API %s to the error state, never to "found"',
    async (status) => {
      const api = fakeApi(() => new Response('', { status }));
      const resolve = createTenantResolver({
        apiOrigin: 'http://api.test',
        bffCredential: undefined,
        fetch: api.fetchFn,
      });
      await expect(resolve(input('cafe-roma'))).rejects.toBeInstanceOf(PublicApiUnavailableError);
    },
  );

  it('maps an unreachable API and a missing API origin to the error state', async () => {
    const down = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: undefined,
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(down(input('cafe-roma'))).rejects.toBeInstanceOf(PublicApiUnavailableError);
    const unset = createTenantResolver({ apiOrigin: undefined, bffCredential: undefined });
    await expect(unset(input('cafe-roma'))).rejects.toBeInstanceOf(PublicApiUnavailableError);
  });
});

describe('per-visitor rate limiting through the BFF (D-037)', () => {
  it('forwards the visitor address with the BFF credential', async () => {
    const api = fakeApi(() => ok({ slug: 'cafe-roma', displayName: 'X' }));
    const resolve = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: 'c'.repeat(43),
      fetch: api.fetchFn,
    });
    await resolve(input('cafe-roma'));
    expect(api.calls[0]?.init?.headers).toMatchObject({
      'x-platform-bff-credential': 'c'.repeat(43),
      'x-platform-client-address': '198.51.100.7',
    });
  });

  it('sends neither header when the visitor address is unknown or no credential is configured', async () => {
    const api = fakeApi(() => ok({ slug: 'cafe-roma', displayName: 'X' }));
    const withCred = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: 'c'.repeat(43),
      fetch: api.fetchFn,
    });
    await withCred({ ...input('cafe-roma'), clientAddress: 'unknown' });
    const noCred = createTenantResolver({
      apiOrigin: 'http://api.test',
      bffCredential: undefined,
      fetch: api.fetchFn,
    });
    await noCred(input('cafe-roma'));
    for (const call of api.calls) {
      expect(Object.keys(call.init?.headers ?? {})).toEqual(['accept']);
    }
  });
});

describe('rawFirstSegment', () => {
  it.each([
    ['/cafe-roma', 'cafe-roma'],
    ['/cafe%2Droma/menu', 'cafe%2Droma'],
    ['/', undefined],
    ['', undefined],
    ['/cafe?x=1', 'cafe'],
  ])('%s → %s', (path, expected) => {
    expect(rawFirstSegment(path)).toBe(expected);
  });
});
