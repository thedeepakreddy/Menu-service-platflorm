// Web login (Phase 2 M2.6; D-030, D-033) against a strict local OIDC provider over real HTTP.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startTestProvider } from '../../test/oidc-provider';
import type { TestProvider } from '../../test/oidc-provider';
import type { AuthConfig, LoginKind } from './config';
import { createAuthHandlers } from './handlers';
import type { AuthHandlers } from './handlers';
import { apiAuthHeaders, LOGIN_COOKIE, readCookie, SESSION_COOKIE } from './session';

const ORIGIN = 'https://app.platform.test';
const KEY = new Uint8Array(32).fill(9);
let owners: TestProvider;
let operators: TestProvider;
let clock = Date.now();

function config(kinds: LoginKind[] = ['owner', 'operator']): AuthConfig {
  const base = { clientSecret: 'synthetic-client-secret', maxAuthAgeSeconds: 3600 };
  return {
    appEnv: 'test',
    publicOrigin: ORIGIN,
    sessionKey: KEY,
    providers: {
      ...(kinds.includes('owner')
        ? {
            owner: {
              ...base,
              issuer: owners.issuer,
              clientId: 'owner-web',
              scope: 'openid',
              maxSessionSeconds: 8 * 3600,
              requireMfa: false,
            },
          }
        : {}),
      ...(kinds.includes('operator')
        ? {
            operator: {
              ...base,
              issuer: operators.issuer,
              clientId: 'operator-web',
              scope: 'openid extra:audience',
              maxSessionSeconds: 3600,
              requireMfa: true,
            },
          }
        : {}),
    },
  };
}

let auth: AuthHandlers;

/** Each provider has its own certificate; route provider requests to the matching TLS fetch. */
const testFetch = (url: string, options?: Parameters<TestProvider['fetch']>[1]) =>
  (url.startsWith(owners.issuer) ? owners : operators).fetch(url, options);
const handlersFor = (c: AuthConfig) =>
  createAuthHandlers(c, {
    now: () => clock,
    customFetch: (url, options) => testFetch(url, options),
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
  auth = handlersFor(config());
});

afterAll(async () => {
  await Promise.all([owners.close(), operators.close()]);
});

afterEach(() => {
  clock = Date.now();
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

/** Login → provider → callback, like a browser. Returns the callback response and the URL used. */
async function signIn(kind: LoginKind, tamper?: (callback: URL) => void, handlers = auth) {
  const login = await handlers.login(new Request(`${ORIGIN}/auth/${kind}/login`), kind);
  expect(login.status).toBe(302);
  const loginCookie = cookieValue(login, LOGIN_COOKIE) ?? '';
  const atProvider = await testFetch(login.headers.get('location') ?? '');
  const callback = new URL(atProvider.headers.get('location') ?? '');
  tamper?.(callback);
  const res = await handlers.callback(
    new Request(callback.href, { headers: { cookie: `${LOGIN_COOKIE}=${loginCookie}` } }),
    kind,
  );
  return { res, login, loginCookie };
}

describe('owner login (D-030)', () => {
  it('runs the code flow with PKCE, state and nonce and sets a sealed session cookie', async () => {
    const { res, login } = await signIn('owner');
    const authorize = new URL(login.headers.get('location') ?? '');
    expect(authorize.origin).toBe(owners.issuer);
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/owner/callback`);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('state')).toBeTruthy();
    expect(authorize.searchParams.get('nonce')).toBeTruthy();
    expect(owners.tokenRequests.at(-1)).toMatchObject({
      pkceVerified: true,
      redirectUri: `${ORIGIN}/auth/owner/callback`,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
    const sessionCookie = setCookies(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(sessionCookie).toMatch(/; HttpOnly; Secure; SameSite=Lax$/);
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).not.toMatch(/Domain=/i);
    // The cookie is ciphertext: no token or claim is readable in it.
    expect(sessionCookie).not.toMatch(/eyJ[A-Za-z0-9_-]+\.eyJ/);
    expect(setCookies(res).some((c) => c.startsWith(`${LOGIN_COOKIE}=;`))).toBe(true);

    const request = new Request(`${ORIGIN}/auth/session`, {
      headers: { cookie: `${SESSION_COOKIE}=${cookieValue(res, SESSION_COOKIE) ?? ''}` },
    });
    const body = (await (await auth.session(request)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ authenticated: true, kind: 'owner' });
    expect(JSON.stringify(body)).not.toContain('eyJ');
    const session = await auth.currentSession(request);
    expect(session?.subject).toBe('user-1');
    expect(Object.keys(session === undefined ? {} : apiAuthHeaders(session))).toEqual([
      'authorization',
    ]);
  });

  it('caps the session at the absolute maximum even if the token lives longer', async () => {
    owners.behaviour.expiresIn = 100_000;
    const { res } = await signIn('owner');
    const maxAge = Number(
      /Max-Age=(\d+)/.exec(setCookies(res).find((c) => c.startsWith(SESSION_COOKIE)) ?? '')?.[1],
    );
    expect(maxAge).toBeLessThanOrEqual(8 * 3600);
  });

  it('builds every URL from the configured origin, never from the request host', async () => {
    const login = await auth.login(
      new Request('https://evil.example/auth/owner/login', { headers: { host: 'evil.example' } }),
      'owner',
    );
    expect(new URL(login.headers.get('location') ?? '').searchParams.get('redirect_uri')).toBe(
      `${ORIGIN}/auth/owner/callback`,
    );
    const { res } = await signIn('owner', (cb) => {
      cb.host = 'evil.example';
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
  });
});

describe('login attacks and failures are refused (D-033)', () => {
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
      'a forged code',
      (cb: URL) => {
        cb.searchParams.set('code', 'forged');
      },
    ],
    [
      'a provider error response',
      (cb: URL) => {
        cb.search = '';
        cb.searchParams.set('error', 'access_denied');
      },
    ],
  ])('%s', async (_label, tamper) => {
    const { res } = await signIn('owner', tamper);
    expect(res.status).toBe(400);
    expect(cookieValue(res, SESSION_COOKIE)).toBeUndefined();
  });

  it('a nonce mismatch (ID token replay) is refused', async () => {
    owners.behaviour.nonceOverride = 'replayed-nonce';
    expect((await signIn('owner')).res.status).toBe(400);
  });

  it('a callback without the login cookie is refused (login CSRF)', async () => {
    const login = await auth.login(new Request(`${ORIGIN}/auth/owner/login`), 'owner');
    const atProvider = await testFetch(login.headers.get('location') ?? '');
    const res = await auth.callback(new Request(atProvider.headers.get('location') ?? ''), 'owner');
    expect(res.status).toBe(400);
  });

  it('an expired login transaction is refused', async () => {
    const login = await auth.login(new Request(`${ORIGIN}/auth/owner/login`), 'owner');
    const loginCookie = cookieValue(login, LOGIN_COOKIE) ?? '';
    const atProvider = await testFetch(login.headers.get('location') ?? '');
    clock += 11 * 60_000;
    const res = await auth.callback(
      new Request(atProvider.headers.get('location') ?? '', {
        headers: { cookie: `${LOGIN_COOKIE}=${loginCookie}` },
      }),
      'owner',
    );
    expect(res.status).toBe(400);
  });

  it('an operator login transaction cannot complete an owner callback', async () => {
    const opLogin = await auth.login(new Request(`${ORIGIN}/auth/operator/login`), 'operator');
    const ownerLogin = await auth.login(new Request(`${ORIGIN}/auth/owner/login`), 'owner');
    const atProvider = await testFetch(ownerLogin.headers.get('location') ?? '');
    const res = await auth.callback(
      new Request(atProvider.headers.get('location') ?? '', {
        headers: { cookie: `${LOGIN_COOKIE}=${cookieValue(opLogin, LOGIN_COOKIE) ?? ''}` },
      }),
      'owner',
    );
    expect(res.status).toBe(400);
  });

  it('a code cannot be redeemed twice', async () => {
    const login = await auth.login(new Request(`${ORIGIN}/auth/owner/login`), 'owner');
    const loginCookie = cookieValue(login, LOGIN_COOKIE) ?? '';
    const atProvider = await testFetch(login.headers.get('location') ?? '');
    const req = () =>
      new Request(atProvider.headers.get('location') ?? '', {
        headers: { cookie: `${LOGIN_COOKIE}=${loginCookie}` },
      });
    expect((await auth.callback(req(), 'owner')).status).toBe(302);
    expect((await auth.callback(req(), 'owner')).status).toBe(400);
  });

  it('a session cookie cannot be used as a login cookie, nor a tampered cookie as a session', async () => {
    const { res } = await signIn('owner');
    const session = cookieValue(res, SESSION_COOKIE) ?? '';
    const login = await auth.login(new Request(`${ORIGIN}/auth/owner/login`), 'owner');
    const atProvider = await testFetch(login.headers.get('location') ?? '');
    const asLogin = await auth.callback(
      new Request(atProvider.headers.get('location') ?? '', {
        headers: { cookie: `${LOGIN_COOKIE}=${session}` },
      }),
      'owner',
    );
    expect(asLogin.status).toBe(400);
    const tampered = `${session.slice(0, -4)}AAAA`;
    expect(
      await auth.currentSession(
        new Request(ORIGIN, { headers: { cookie: `${SESSION_COOKIE}=${tampered}` } }),
      ),
    ).toBeUndefined();
  });

  it('an expired session is no session', async () => {
    const { res } = await signIn('owner');
    clock += 301_000;
    const req = new Request(ORIGIN, {
      headers: { cookie: `${SESSION_COOKIE}=${cookieValue(res, SESSION_COOKIE) ?? ''}` },
    });
    expect(await auth.currentSession(req)).toBeUndefined();
  });

  it('unknown and unconfigured login kinds are 404', async () => {
    expect((await auth.login(new Request(`${ORIGIN}/auth/admin/login`), 'admin')).status).toBe(404);
    const ownersOnly = handlersFor(config(['owner']));
    expect(
      (await ownersOnly.login(new Request(`${ORIGIN}/auth/operator/login`), 'operator')).status,
    ).toBe(404);
  });

  const withIssuer = (issuer: string) => {
    const base = config(['owner']);
    const owner = base.providers.owner;
    if (owner === undefined) throw new Error('owner provider missing');
    return handlersFor({ ...base, providers: { owner: { ...owner, issuer } } });
  };

  it('a provider outage gives 503 and sets no cookie', async () => {
    const res = await withIssuer('https://127.0.0.1:9').login(
      new Request(`${ORIGIN}/auth/owner/login`),
      'owner',
    );
    expect(res.status).toBe(503);
    expect(cookieValue(res, LOGIN_COOKIE)).toBeUndefined();
  });

  it('a plain-http issuer is refused: there is no insecure path', async () => {
    const plainHttp = owners.issuer.replace('https://', 'http://');
    const res = await withIssuer(plainHttp).login(
      new Request(`${ORIGIN}/auth/owner/login`),
      'owner',
    );
    expect(res.status).toBe(503);
  });
});

describe('operator login requires MFA (D-033)', () => {
  it('refuses an operator who signed in without MFA', async () => {
    operators.behaviour.amr = ['pwd'];
    expect((await signIn('operator')).res.status).toBe(400);
  });

  it('refuses a stale operator authentication', async () => {
    operators.behaviour.amr = ['pwd', 'otp', 'mfa'];
    operators.behaviour.authTimeOffsetSeconds = -7200;
    expect((await signIn('operator')).res.status).toBe(400);
  });

  it('accepts MFA, requests max_age, and sends the ID token as the API proof', async () => {
    operators.behaviour.amr = ['pwd', 'otp', 'mfa'];
    const { res, login } = await signIn('operator');
    expect(new URL(login.headers.get('location') ?? '').searchParams.get('max_age')).toBe('3600');
    expect(new URL(login.headers.get('location') ?? '').searchParams.get('scope')).toBe(
      'openid extra:audience',
    );
    expect(res.status).toBe(302);
    const session = await auth.currentSession(
      new Request(ORIGIN, {
        headers: { cookie: `${SESSION_COOKIE}=${cookieValue(res, SESSION_COOKIE) ?? ''}` },
      }),
    );
    expect(session?.kind).toBe('operator');
    expect(Object.keys(session === undefined ? {} : apiAuthHeaders(session)).sort()).toEqual([
      'authorization',
      'x-authentication-proof',
    ]);
    expect(
      Number(
        /Max-Age=(\d+)/.exec(setCookies(res).find((c) => c.startsWith(SESSION_COOKIE)) ?? '')?.[1],
      ),
    ).toBeLessThanOrEqual(3600);
  });
});

describe('logout (D-033)', () => {
  it('refuses GET, a foreign origin and a missing origin', async () => {
    expect((await auth.logout(new Request(`${ORIGIN}/auth/logout`))).status).toBe(405);
    expect(
      (
        await auth.logout(
          new Request(`${ORIGIN}/auth/logout`, {
            method: 'POST',
            headers: { origin: 'https://evil.example' },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await auth.logout(new Request(`${ORIGIN}/auth/logout`, { method: 'POST' }))).status,
    ).toBe(403);
  });

  it('clears the session and ends the provider session with id_token_hint', async () => {
    const { res } = await signIn('owner');
    const out = await auth.logout(
      new Request(`${ORIGIN}/auth/logout`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          cookie: `${SESSION_COOKIE}=${cookieValue(res, SESSION_COOKIE) ?? ''}`,
        },
      }),
    );
    expect(out.status).toBe(303);
    const end = new URL(out.headers.get('location') ?? '');
    expect(`${end.origin}${end.pathname}`).toBe(`${owners.issuer}/end_session`);
    expect(end.searchParams.get('id_token_hint')).toMatch(/^eyJ/);
    expect(end.searchParams.get('post_logout_redirect_uri')).toBe(`${ORIGIN}/`);
    expect(
      setCookies(out).some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && c.includes('Max-Age=0')),
    ).toBe(true);
  });

  it('without a session, logout still clears the cookie and returns home', async () => {
    const out = await auth.logout(
      new Request(`${ORIGIN}/auth/logout`, { method: 'POST', headers: { origin: ORIGIN } }),
    );
    expect(out.status).toBe(303);
    expect(out.headers.get('location')).toBe(`${ORIGIN}/`);
  });
});
