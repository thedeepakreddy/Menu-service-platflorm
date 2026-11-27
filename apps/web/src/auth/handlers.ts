import { randomUUID } from 'node:crypto';

import * as oidc from 'openid-client';

import { AUTHORIZATION_CODE, FixedWindowLimiter, SingleUseSet, webClientAddress } from './abuse';
import { ApiUnavailableError, createApiClient } from './api-client';
import type { ApiClient } from './api-client';
import type { AuthConfig, LoginKind, ProviderConfig } from './config';
import { isLoginKind } from './config';
import {
  clearCookie,
  cookie,
  LOGIN_COOKIE,
  openLogin,
  parseSessionCookie,
  readCookie,
  sealLogin,
  SESSION_COOKIE,
  sessionCookieValue,
} from './session';

/**
 * OIDC backend-for-frontend (Phase 2 M2.6 + audit remediation; D-030, D-034, D-038). Standard
 * OpenID Connect only (`openid-client`); nothing here is specific to one identity provider. The
 * application, not the provider, decides tenancy and authorization: these handlers establish WHO
 * the user is and hand the login to the API, which owns the server-side session.
 */

const LOGIN_TTL_SECONDS = 600;
/** After a discovery failure, refuse for this long instead of hitting the provider again. */
const DISCOVERY_FAILURE_BACKOFF_MS = 30_000;

const noStore = { 'cache-control': 'no-store' };

function plain(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...noStore, ...extra },
  });
}

function redirect(location: string, setCookies: string[], status = 302): Response {
  const headers = new Headers({ location, ...noStore });
  for (const c of setCookies) headers.append('set-cookie', c);
  return new Response(null, { status, headers });
}

const tooMany = () =>
  plain(429, 'Too many sign-in attempts. Please wait and try again.', { 'retry-after': '60' });
const unavailable = () => plain(503, 'Sign-in is temporarily unavailable. Please try again later.');

export type CurrentSession = { kind: LoginKind; token: string; expiresAt: number };

export type AuthHandlers = {
  login(request: Request, kind: string): Promise<Response>;
  callback(request: Request, kind: string): Promise<Response>;
  logout(request: Request): Promise<Response>;
  session(request: Request): Promise<Response>;
  /** The current live session (validated by the API), for server-side API calls. */
  currentSession(request: Request): Promise<CurrentSession | undefined>;
};

export type AuthHandlerOptions = {
  /** Clock in milliseconds (tests). */
  now?: () => number;
  /** Fetch used for every request to the provider (tests: trust a test CA). */
  customFetch?: oidc.CustomFetch;
  /** API client (tests may substitute). */
  api?: ApiClient;
  /** Per-client and global limits on login + callback (D-038). */
  limits?: { perClientPerMinute: number; globalPerMinute: number };
};

export function createAuthHandlers(
  config: AuthConfig,
  options: AuthHandlerOptions = {},
): AuthHandlers {
  const now = options.now ?? (() => Date.now());
  const nowSeconds = () => Math.floor(now() / 1000);
  const discovered = new Map<LoginKind, Promise<oidc.Configuration>>();
  const discoveryFailedAt = new Map<LoginKind, number>();
  const api =
    options.api ??
    createApiClient({ apiOrigin: config.apiOrigin, bffCredential: config.bffCredential });
  const limits = options.limits ?? { perClientPerMinute: 30, globalPerMinute: 1200 };
  const perClient = new FixedWindowLimiter(limits.perClientPerMinute, 60_000, 50_000, now);
  const global = new FixedWindowLimiter(limits.globalPerMinute, 60_000, 4, now);
  const tokenRequests = new FixedWindowLimiter(config.tokenRequestsPerMinute, 60_000, 4, now);
  const usedTransactions = new SingleUseSet(100_000, () => nowSeconds());

  function provider(kind: string): { kind: LoginKind; provider: ProviderConfig } | undefined {
    if (!isLoginKind(kind)) return undefined;
    const p = config.providers[kind];
    return p === undefined ? undefined : { kind, provider: p };
  }

  const clientOf = (request: Request) =>
    webClientAddress(request.headers.get('x-forwarded-for'), config.trustedProxyHops);

  /** Rate limits for the login routes; false = refuse with 429. */
  function admit(request: Request, route: string): boolean {
    return global.hit(route) && perClient.hit(`${route}|${clientOf(request)}`);
  }

  /**
   * Discovery is cached; a failure is cached briefly too, so an outage neither hammers the
   * provider nor needs a restart to recover.
   */
  function configuration(kind: LoginKind, p: ProviderConfig): Promise<oidc.Configuration> {
    const failedAt = discoveryFailedAt.get(kind);
    if (failedAt !== undefined && now() - failedAt < DISCOVERY_FAILURE_BACKOFF_MS) {
      return Promise.reject(new Error('discovery backing off'));
    }
    let pending = discovered.get(kind);
    if (pending === undefined) {
      // HTTPS only: there is no plain-http path in this code. Tests use a TLS test provider and
      // pass a fetch that trusts its throwaway certificate.
      pending = oidc.discovery(new URL(p.issuer), p.clientId, p.clientSecret, undefined, {
        timeout: 10,
        ...(options.customFetch === undefined ? {} : { [oidc.customFetch]: options.customFetch }),
      });
      pending.catch(() => {
        discovered.delete(kind);
        discoveryFailedAt.set(kind, now());
      });
      discovered.set(kind, pending);
    }
    return pending;
  }

  const callbackUrl = (kind: LoginKind) => `${config.publicOrigin}/auth/${kind}/callback`;

  async function currentSession(request: Request): Promise<CurrentSession | undefined> {
    const cookieValue = parseSessionCookie(
      readCookie(request.headers.get('cookie'), SESSION_COOKIE),
    );
    if (cookieValue === undefined) return undefined;
    const live = await api.currentSession(cookieValue.kind, cookieValue.token, clientOf(request));
    return live === undefined ? undefined : { ...cookieValue, expiresAt: live.expiresAt };
  }

  return {
    currentSession,

    async login(request, kind) {
      const found = provider(kind);
      if (found === undefined) return plain(404, 'Not found');
      if (!admit(request, 'login')) return tooMany();
      let cfg: oidc.Configuration;
      try {
        cfg = await configuration(found.kind, found.provider);
      } catch {
        // Provider outage: say so, keep nothing, leak nothing.
        return unavailable();
      }
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const transaction = {
        id: randomUUID(),
        kind: found.kind,
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        codeVerifier,
        expiresAt: nowSeconds() + LOGIN_TTL_SECONDS,
      };
      const url = oidc.buildAuthorizationUrl(cfg, {
        redirect_uri: callbackUrl(found.kind),
        scope: found.provider.scope,
        response_type: 'code',
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        state: transaction.state,
        nonce: transaction.nonce,
        ...(found.provider.requireMfa ? { max_age: String(found.provider.maxAuthAgeSeconds) } : {}),
      });
      const sealed = await sealLogin(transaction, config.sessionKey);
      return redirect(url.href, [cookie(LOGIN_COOKIE, sealed, LOGIN_TTL_SECONDS)]);
    },

    async callback(request, kind) {
      const found = provider(kind);
      if (found === undefined) return plain(404, 'Not found');
      if (!admit(request, 'callback')) return tooMany();
      const failed = () =>
        plain(400, 'Sign-in failed. Please start again.', {
          'set-cookie': clearCookie(LOGIN_COOKIE),
        });
      const transaction = await openLogin(
        readCookie(request.headers.get('cookie'), LOGIN_COOKIE),
        config.sessionKey,
      );
      // No, expired or cross-kind login transaction: refuse (login CSRF, replay).
      if (
        transaction === undefined ||
        transaction.kind !== found.kind ||
        transaction.expiresAt <= nowSeconds()
      ) {
        return failed();
      }
      // Everything checkable locally is checked BEFORE any request to the provider (C-03):
      // exactly one state equal to the transaction's, exactly one well-formed code, no error.
      const incoming = new URL(request.url);
      const states = incoming.searchParams.getAll('state');
      const codes = incoming.searchParams.getAll('code');
      if (
        states.length !== 1 ||
        states[0] !== transaction.state ||
        codes.length !== 1 ||
        !AUTHORIZATION_CODE.test(codes[0] ?? '') ||
        incoming.searchParams.has('error')
      ) {
        return failed();
      }
      // Single use: a login cookie can be redeemed once, even if the code exchange fails.
      if (!usedTransactions.consume(transaction.id, transaction.expiresAt)) return failed();
      // Global cap on outbound token requests: the provider's budget is never exhausted.
      if (!tokenRequests.hit('token')) return unavailable();
      let cfg: oidc.Configuration;
      try {
        cfg = await configuration(found.kind, found.provider);
      } catch {
        return unavailable();
      }
      // The callback URL is rebuilt from the configured origin, never from request headers.
      const current = new URL(`${callbackUrl(found.kind)}${incoming.search}`);
      let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
      try {
        tokens = await oidc.authorizationCodeGrant(cfg, current, {
          pkceCodeVerifier: transaction.codeVerifier,
          expectedState: transaction.state,
          expectedNonce: transaction.nonce,
          idTokenExpected: true,
          ...(found.provider.requireMfa ? { maxAge: found.provider.maxAuthAgeSeconds } : {}),
        });
      } catch {
        return failed(); // wrong state, nonce, PKCE, signature, issuer, audience, expiry, ...
      }
      const claims = tokens.claims();
      if (claims === undefined || tokens.id_token === undefined) return failed();
      if (found.provider.requireMfa) {
        const amr: unknown = claims.amr;
        const authTime = claims.auth_time;
        // Defence in depth: the API verifies this again before it creates the session (D-034).
        if (
          !Array.isArray(amr) ||
          !amr.includes('mfa') ||
          typeof authTime !== 'number' ||
          nowSeconds() - authTime > found.provider.maxAuthAgeSeconds
        ) {
          return failed();
        }
      }
      // Hand the login to the API exactly once; the tokens are not kept anywhere afterwards.
      const previous = parseSessionCookie(
        readCookie(request.headers.get('cookie'), SESSION_COOKIE),
      );
      let session: Awaited<ReturnType<ApiClient['createSession']>>;
      try {
        session = await api.createSession(
          found.kind,
          { idToken: tokens.id_token, accessToken: tokens.access_token },
          previous?.token,
          clientOf(request),
        );
      } catch (error) {
        if (error instanceof ApiUnavailableError) return unavailable();
        throw error;
      }
      if (session === undefined) return failed();
      return redirect(`${config.publicOrigin}/`, [
        clearCookie(LOGIN_COOKIE),
        cookie(
          SESSION_COOKIE,
          sessionCookieValue(found.kind, session.token),
          session.expiresAt - nowSeconds(),
        ),
      ]);
    },

    async logout(request) {
      // CSRF: state-changing, so POST only, and only from our own origin.
      if (request.method !== 'POST') return plain(405, 'Method not allowed', { allow: 'POST' });
      if (request.headers.get('origin') !== config.publicOrigin) return plain(403, 'Forbidden');
      const value = parseSessionCookie(readCookie(request.headers.get('cookie'), SESSION_COOKIE));
      const cleared = [clearCookie(SESSION_COOKIE)];
      if (value === undefined) return redirect(`${config.publicOrigin}/`, cleared, 303);
      // Revoke server-side first: the token is dead whatever happens next (works for an expired
      // session too, so the provider logout below is never skipped, audit C-06).
      try {
        await api.revokeSession(value.token, clientOf(request));
      } catch {
        // API unreachable: the cookie is still cleared; the session expires on its own.
      }
      const found = provider(value.kind);
      if (found === undefined) return redirect(`${config.publicOrigin}/`, cleared, 303);
      try {
        const cfg = await configuration(found.kind, found.provider);
        // RP-initiated logout ends the provider session too. No ID token in the URL (C-06):
        // client_id identifies the client instead (OIDC RP-Initiated Logout 1.0 §2).
        const url = oidc.buildEndSessionUrl(cfg, {
          client_id: found.provider.clientId,
          post_logout_redirect_uri: `${config.publicOrigin}/`,
        });
        return redirect(url.href, cleared, 303);
      } catch {
        // Provider unreachable: the local session is still ended.
        return redirect(`${config.publicOrigin}/`, cleared, 303);
      }
    },

    async session(request) {
      let s: CurrentSession | undefined;
      try {
        s = await currentSession(request);
      } catch (error) {
        if (error instanceof ApiUnavailableError) return unavailable();
        throw error;
      }
      const body =
        s === undefined
          ? { authenticated: false }
          : { authenticated: true, kind: s.kind, expiresAt: s.expiresAt };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json', ...noStore },
      });
    },
  };
}
