// Web login BFF (M2.6 + audit remediation; D-030, D-034, D-038) against a strict local OIDC
// provider over real TLS, with an in-memory stand-in for the API's session endpoints. The API's
// own token verification and session store are tested against real PostgreSQL in apps/api.
import { randomBytes } from 'node:crypto';

import { decodeJwt } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startTestProvider } from '../../test/oidc-provider';
import type { TestProvider } from '../../test/oidc-provider';
import { ApiUnavailableError } from './api-client';
import type { ApiClient } from './api-client';
import type { AuthConfig, LoginKind } from './config';
import { createAuthHandlers } from './handlers';
import type { AuthHandlerOptions, AuthHandlers } from './handlers';
import { LOGIN_COOKIE, readCookie, SESSION_COOKIE } from './session';

const ORIGIN = 'https://app.platform.test';
const KEY = new Uint8Array(32).fill(9);
let owners: TestProvider;
let operators: TestProvider;
let clock = Date.now();

/** In-memory stand-in for the API session endpoints; records every call. */
function fakeApi() {
  const sessions = new Map<string, { kind: LoginKind; revoked: boolean; expiresAt: number }>();
  const calls: {
    op: string;
    kind?: LoginKind;
    tokens?: { idToken: string; accessToken: string };
    replaces?: string;
  }[] = [];
  let mode: 'ok' | 'refuse' | 'down' = 'ok';
  const api: ApiClient = {
    createSession(kind, tokens, replaces) {
      calls.push({ op: 'create', kind, tokens, ...(replaces === undefined ? {} : { replaces }) });
      if (mode === 'down') return Promise.reject(new ApiUnavailableError('down'));
      if (mode === 'refuse') return Promise.resolve(undefined);
      if (replaces !== undefined) {
        const old = sessions.get(replaces);
        if (old !== undefined) old.revoked = true;
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = Math.floor(clock / 1000) + 1800;
      sessions.set(token, { kind, revoked: false, expiresAt });
      return Promise.resolve({ token, expiresAt });
    },
    currentSession(kind, token) {
      calls.push({ op: 'current', kind });
      if (mode === 'down') return Promise.reject(new ApiUnavailableError('down'));
      const s = sessions.get(token);
      return Promise.resolve(
        s === undefined || s.revoked || s.kind !== kind ? undefined : { expiresAt: s.expiresAt },
      );
    },
    revokeSession(token) {
      calls.push({ op: 'revoke' });
      const s = sessions.get(token);
      if (s !== undefined) s.revoked = true;
      return Promise.resolve();
    },
  };
  return {
    api,
    calls,
    sessions,
    setMode: (m: typeof mode) => {
      mode = m;
    },
  };
}

function config(over: Partial<AuthConfig> = {}): AuthConfig {
  const base = { clientSecret: 'synthetic-client-secret', maxAuthAgeSeconds: 3600 };
  return {
    appEnv: 'test',
    publicOrigin: ORIGIN,
    sessionKey: KEY,
    apiOrigin: 'http://127.0.0.1:1',
    bffCredential: 'synthetic-bff-credential-for-tests-only-00000',
    trustedProxyHops: 1,
    tokenRequestsPerMinute: 600,
    providers: {
      owner: {
        ...base,
        issuer: owners.issuer,
        clientId: 'owner-web',
        scope: 'openid',
        requireMfa: false,
      },
      operator: {
        ...base,
        issuer: operators.issuer,
        clientId: 'operator-web',
        scope: 'openid extra:audience',
        requireMfa: true,
      },
    },
    ...over,
  };
}

/** Each provider has its own certificate; route provider requests to the matching TLS fetch. */
const testFetch = (url: string, options?: Parameters<TestProvider['fetch']>[1]) =>
  (url.startsWith(owners.issuer) ? owners : operators).fetch(url, options);

let fake: ReturnType<typeof fakeApi>;
let auth: AuthHandlers;
const handlersFor = (c: AuthConfig, extra: AuthHandlerOptions = {}) =>
  createAuthHandlers(c, {
    now: () => clock,
    customFetch: (url, options) => testFetch(url, options),
    api: fake.api,
    ...extra,
  });

beforeAll(async () => {
  owners = await startTestProvider({
    clientId: 'owner-web',
    clientSecret: 'synthetic-client-secret',
    redirectUri: `${ORIGIN}/auth/owner/callback`,
    postLogoutRedirectUri: `${ORIGIN}/`,
  });
  operators = await startTestProvider({
    clientId: 'operator-web',
    clientSecret: 'synthetic-client-secret',
    redirectUri: `${ORIGIN}/auth/operator/callback`,
    postLogoutRedirectUri: `${ORIGIN}/`,
  });
  fake = fakeApi();
  auth = handlersFor(config());
});

afterAll(async () => {
  await Promise.all([owners.close(), operators.close()]);
});

afterEach(() => {
  clock = Date.now();
  fake.setMode('ok');
  for (const p of [owners, operators])
    Object.assign(p.behaviour, {
      amr: ['pwd'],
      authTimeOffsetSeconds: -5,
      expiresIn: 300,
      nonceOverride: undefined,
    });
});

const setCookies = (res: Response) => res.headers.getSetCookie();
const cookieValue = (res: Response, name: string) =>
  readCookie(
    setCookies(res)
      .map((c) => c.split(';')[0])
      .join('; '),
    name,
  );
let clientCounter = 0;
const freshClient = () => `198.51.100.${String((clientCounter += 1) % 250)}`;

/** Login → provider → callback, like a browser. */
async function signIn(
  kind: LoginKind,
  options: {
    tamper?: (callback: URL) => void;
    handlers?: AuthHandlers;
    cookie?: string;
    client?: string;
  } = {},
) {
  const handlers = options.handlers ?? auth;
  const client = options.client ?? freshClient();
  const headers = { 'x-forwarded-for': client };
  const login = await handlers.login(
    new Request(`${ORIGIN}/auth/${kind}/login`, { headers }),
    kind,
  );
  expect(login.status).toBe(302);
  const loginCookie = cookieValue(login, LOGIN_COOKIE) ?? '';
  const atProvider = await testFetch(login.headers.get('location') ?? '');
  const callback = new URL(atProvider.headers.get('location') ?? '');
  options.tamper?.(callback);
  const cookies = [
    `${LOGIN_COOKIE}=${loginCookie}`,
    ...(options.cookie === undefined ? [] : [options.cookie]),
  ];
  const callbackRequest = () =>
    new Request(callback.href, { headers: { cookie: cookies.join('; '), ...headers } });
  const res = await handlers.callback(callbackRequest(), kind);
  return { res, login, loginCookie, callbackRequest };
}

const sessionCookieOf = (res: Response) =>
  `${SESSION_COOKIE}=${cookieValue(res, SESSION_COOKIE) ?? ''}`;

describe('owner login: an opaque server-side session (D-034)', () => {
  it('runs the code flow with PKCE, state and nonce; the cookie holds only an opaque token', async () => {
    const { res, login } = await signIn('owner');
    const authorize = new URL(login.headers.get('location') ?? '');
    expect(authorize.origin).toBe(owners.issuer);
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/owner/callback`);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('state')).toBeTruthy();
    expect(authorize.searchParams.get('nonce')).toBeTruthy();
    expect(owners.tokenRequests.at(-1)).toMatchObject({ pkceVerified: true });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
    const sessionCookie = setCookies(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(sessionCookie).toMatch(
      /^__Host-platform-session=owner\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(sessionCookie).not.toMatch(/eyJ/); // no token, no ciphertext of a token
    expect(setCookies(res).some((c) => c.startsWith(`${LOGIN_COOKIE}=;`))).toBe(true);

    // The BFF handed BOTH tokens to the API once; it keeps neither.
    const create = fake.calls.filter((c) => c.op === 'create').at(-1);
    expect(decodeJwt(create?.tokens?.idToken ?? '')).toHaveProperty('at_hash');
    expect(decodeJwt(create?.tokens?.accessToken ?? '')).toHaveProperty('client_id', 'owner-web');

    const request = new Request(`${ORIGIN}/auth/session`, {
      headers: { cookie: sessionCookieOf(res) },
    });
    const body = (await (await auth.session(request)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ authenticated: true, kind: 'owner' });
  });

  it('builds every URL from the configured origin, never from the request host', async () => {
    const login = await auth.login(
      new Request('https://evil.example/auth/owner/login', { headers: { host: 'evil.example' } }),
      'owner',
    );
    expect(new URL(login.headers.get('location') ?? '').searchParams.get('redirect_uri')).toBe(
      `${ORIGIN}/auth/owner/callback`,
    );
    const { res } = await signIn('owner', {
      tamper: (cb) => {
        cb.host = 'evil.example';
      },
    });
    expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
  });

  it("rotation: logging in again replaces (and revokes) the browser's previous session", async () => {
    const first = await signIn('owner');
    const second = await signIn('owner', { cookie: sessionCookieOf(first.res) });
    expect(second.res.status).toBe(302);
    const create = fake.calls.filter((c) => c.op === 'create').at(-1);
    const oldToken = (cookieValue(first.res, SESSION_COOKIE) ?? '').split('.')[1];
    expect(create?.replaces).toBe(oldToken);
    const old = new Request(`${ORIGIN}/auth/session`, {
      headers: { cookie: sessionCookieOf(first.res) },
    });
    expect(await (await auth.session(old)).json()).toEqual({ authenticated: false });
  });
});

describe('login attacks and failures are refused', () => {
  it.each([
    [
      'a tampered state',
      (cb: URL) => {
        cb.searchParams.set('state', 'attacker');
      },
    ],
    [
      'a missing state',
      (cb: URL) => {
        cb.searchParams.delete('state');
      },
    ],
    [
      'a duplicated state',
      (cb: URL) => {
        cb.searchParams.append('state', cb.searchParams.get('state') ?? '');
      },
    ],
    [
      'a malformed code',
      (cb: URL) => {
        cb.searchParams.set('code', 'x');
      },
    ],
    [
      'a duplicated code',
      (cb: URL) => {
        cb.searchParams.append('code', 'another-code-123');
      },
    ],
    [
      'a provider error',
      (cb: URL) => {
        cb.searchParams.set('error', 'access_denied');
      },
    ],
  ])('refuses %s WITHOUT contacting the provider', async (_name, tamper) => {
    const before = owners.tokenRequests.length;
    const { res } = await signIn('owner', { tamper });
    expect(res.status).toBe(400);
    expect(owners.tokenRequests.length).toBe(before);
  });

  it('refuses a forged (well-formed) code at the provider, with one token request', async () => {
    const before = owners.tokenRequests.length;
    const { res } = await signIn('owner', {
      tamper: (cb) => {
        cb.searchParams.set('code', 'forged-code-0001');
      },
    });
    expect(res.status).toBe(400);
    expect(owners.tokenRequests.length).toBe(before + 1);
  });

  it('refuses a callback without, or with an expired or cross-kind, login cookie', async () => {
    const noCookie = await auth.callback(
      new Request(`${ORIGIN}/auth/owner/callback?code=abcdefgh&state=x`),
      'owner',
    );
    expect(noCookie.status).toBe(400);
    const { loginCookie } = await signIn('owner');
    const cross = await auth.callback(
      new Request(`${ORIGIN}/auth/operator/callback?code=abcdefgh&state=x`, {
        headers: { cookie: `${LOGIN_COOKIE}=${loginCookie}` },
      }),
      'operator',
    );
    expect(cross.status).toBe(400);
    clock += 11 * 60_000;
    const late = await signIn('owner', {
      tamper: () => {
        clock += 11 * 60_000;
      },
    });
    expect(late.res.status).toBe(400);
  });

  it('refuses an operator login without MFA, and an MFA too old for the maximum age', async () => {
    operators.behaviour.amr = ['pwd'];
    expect((await signIn('operator')).res.status).toBe(400);
    operators.behaviour.amr = ['pwd', 'otp', 'mfa'];
    operators.behaviour.authTimeOffsetSeconds = -3700;
    expect((await signIn('operator')).res.status).toBe(400);
    operators.behaviour.authTimeOffsetSeconds = -5;
    const ok = await signIn('operator');
    expect(ok.res.status).toBe(302);
    const authorize = new URL(ok.login.headers.get('location') ?? '');
    expect(authorize.searchParams.get('max_age')).toBe('3600');
  });

  it('the API refusing the login means no session; the API down means 503', async () => {
    fake.setMode('refuse');
    expect((await signIn('owner')).res.status).toBe(400);
    fake.setMode('down');
    expect((await signIn('owner')).res.status).toBe(503);
  });
});

describe('C-03: forged callbacks cannot amplify into provider token requests', () => {
  it('REPRODUCTION: one login cookie replayed 500 times reaches the provider at most once', async () => {
    const before = owners.tokenRequests.length;
    const { callbackRequest, res } = await signIn('owner', {
      tamper: (cb) => {
        cb.searchParams.set('code', 'forged-code-0002');
      },
    });
    expect(res.status).toBe(400);
    const statuses = await Promise.all(
      Array.from({ length: 500 }, () =>
        auth.callback(callbackRequest(), 'owner').then((r) => r.status),
      ),
    );
    expect(statuses.every((s) => s === 400 || s === 429)).toBe(true);
    // Before the fix: 500 token requests (one per forged callback). Now: only the first.
    expect(owners.tokenRequests.length - before).toBe(1);
  });

  it('per-client limits answer 429 on login and callback floods', async () => {
    const limited = handlersFor(config(), {
      limits: { perClientPerMinute: 5, globalPerMinute: 10_000 },
    });
    const statuses = [];
    for (let i = 0; i < 7; i += 1) {
      statuses.push(
        (
          await limited.login(
            new Request(`${ORIGIN}/auth/owner/login`, {
              headers: { 'x-forwarded-for': '203.0.113.5' },
            }),
            'owner',
          )
        ).status,
      );
    }
    expect(statuses).toEqual([302, 302, 302, 302, 302, 429, 429]);
    // Another client is unaffected.
    expect(
      (
        await limited.login(
          new Request(`${ORIGIN}/auth/owner/login`, {
            headers: { 'x-forwarded-for': '203.0.113.6' },
          }),
          'owner',
        )
      ).status,
    ).toBe(302);
  });

  it('a global limit holds even when the client rotates addresses', async () => {
    const limited = handlersFor(config(), {
      limits: { perClientPerMinute: 1000, globalPerMinute: 3 },
    });
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push(
        (
          await limited.login(
            new Request(`${ORIGIN}/auth/owner/login`, {
              headers: { 'x-forwarded-for': `192.0.2.${String(i)}` },
            }),
            'owner',
          )
        ).status,
      );
    }
    expect(statuses).toEqual([302, 302, 302, 429, 429]);
  });

  it('the global token-request cap protects the provider budget (503 beyond it)', async () => {
    const capped = handlersFor(config({ tokenRequestsPerMinute: 2 }));
    const results = [];
    for (let i = 0; i < 4; i += 1)
      results.push((await signIn('owner', { handlers: capped })).res.status);
    expect(results).toEqual([302, 302, 503, 503]);
    clock += 61_000;
    expect((await signIn('owner', { handlers: capped })).res.status).toBe(302);
  });

  it('without trusted proxies, client addresses are not trusted (all share one budget)', async () => {
    const direct = handlersFor(config({ trustedProxyHops: 0 }), {
      limits: { perClientPerMinute: 2, globalPerMinute: 1000 },
    });
    const statuses = [];
    for (let i = 0; i < 3; i += 1) {
      statuses.push(
        (
          await direct.login(
            new Request(`${ORIGIN}/auth/owner/login`, {
              headers: { 'x-forwarded-for': `192.0.2.${String(i)}` },
            }),
            'owner',
          )
        ).status,
      );
    }
    expect(statuses).toEqual([302, 302, 429]);
  });

  it('a provider outage is not retried on every request (discovery backoff)', async () => {
    const broken = handlersFor(
      config({
        providers: {
          owner: {
            issuer: 'https://127.0.0.1:1',
            clientId: 'owner-web',
            clientSecret: 'synthetic-client-secret',
            scope: 'openid',
            requireMfa: false,
            maxAuthAgeSeconds: 3600,
          },
        },
      }),
    );
    expect((await broken.login(new Request(`${ORIGIN}/auth/owner/login`), 'owner')).status).toBe(
      503,
    );
    const started = Date.now();
    expect((await broken.login(new Request(`${ORIGIN}/auth/owner/login`), 'owner')).status).toBe(
      503,
    );
    expect(Date.now() - started).toBeLessThan(50); // answered from the backoff, no network
  });
});

describe('logout (D-030, D-034; audit C-05, C-06)', () => {
  it('revokes the server-side session and ends the provider session without an ID token in the URL', async () => {
    operators.behaviour.amr = ['pwd', 'mfa'];
    const session = (await signIn('operator')).res;
    expect(session.status).toBe(302);
    const out = await auth.logout(
      new Request(`${ORIGIN}/auth/logout`, {
        method: 'POST',
        headers: { origin: ORIGIN, cookie: sessionCookieOf(session) },
      }),
    );
    expect(out.status).toBe(303);
    const end = new URL(out.headers.get('location') ?? '');
    expect(end.origin).toBe(operators.issuer);
    expect(end.searchParams.get('client_id')).toBe('operator-web');
    expect(end.searchParams.has('id_token_hint')).toBe(false);
    expect(end.href).not.toMatch(/eyJ/);
    expect(setCookies(out).some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true);
    // The old cookie, replayed, is dead (it was revoked at the API, not merely deleted).
    const replay = new Request(`${ORIGIN}/auth/session`, {
      headers: { cookie: sessionCookieOf(session) },
    });
    expect(await (await auth.session(replay)).json()).toEqual({ authenticated: false });
    expect(fake.calls.at(-2)?.op).toBe('revoke');
  });

  it('is POST-only and same-origin-only (CSRF)', async () => {
    expect((await auth.logout(new Request(`${ORIGIN}/auth/logout`))).status).toBe(405);
    const cross = await auth.logout(
      new Request(`${ORIGIN}/auth/logout`, {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(cross.status).toBe(403);
  });

  it('without a session just clears the cookie', async () => {
    const out = await auth.logout(
      new Request(`${ORIGIN}/auth/logout`, { method: 'POST', headers: { origin: ORIGIN } }),
    );
    expect(out.status).toBe(303);
    expect(out.headers.get('location')).toBe(`${ORIGIN}/`);
  });
});

describe('session cookie handling', () => {
  it.each([
    ['a malformed value', `${SESSION_COOKIE}=owner.short`],
    ['an unknown kind', `${SESSION_COOKIE}=admin.${'A'.repeat(43)}`],
    [
      'a duplicated cookie',
      `${SESSION_COOKIE}=owner.${'A'.repeat(43)}; ${SESSION_COOKIE}=owner.${'B'.repeat(43)}`,
    ],
  ])('treats %s as no session (and never asks the API)', async (_name, cookieHeader) => {
    const before = fake.calls.length;
    const res = await auth.session(
      new Request(`${ORIGIN}/auth/session`, { headers: { cookie: cookieHeader } }),
    );
    expect(await res.json()).toEqual({ authenticated: false });
    expect(fake.calls.length).toBe(before);
  });

  it('answers 503 (not "signed out") when the API is unreachable', async () => {
    const { res } = await signIn('owner');
    fake.setMode('down');
    const r = await auth.session(
      new Request(`${ORIGIN}/auth/session`, { headers: { cookie: sessionCookieOf(res) } }),
    );
    expect(r.status).toBe(503);
  });

  it('login and session cookies cannot stand in for each other', async () => {
    const { loginCookie } = await signIn('owner');
    const r = await auth.session(
      new Request(`${ORIGIN}/auth/session`, {
        headers: { cookie: `${SESSION_COOKIE}=${loginCookie}` },
      }),
    );
    expect(await r.json()).toEqual({ authenticated: false });
  });
});
