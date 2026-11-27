import * as oidc from 'openid-client';

import type { AuthConfig, LoginKind, ProviderConfig } from './config';
import { isLoginKind } from './config';
import {
  clearCookie,
  cookie,
  LOGIN_COOKIE,
  MAX_COOKIE_BYTES,
  openLogin,
  openSession,
  readCookie,
  sealLogin,
  sealSession,
  SESSION_COOKIE,
} from './session';
import type { Session } from './session';

/**
 * OIDC backend-for-frontend (Phase 2 M2.6; D-030, D-033). Standard OpenID Connect only
 * (`openid-client`); nothing here is specific to one identity provider. The application, not the
 * provider, decides tenancy and authorization: these handlers only establish WHO the user is.
 */

const LOGIN_TTL_SECONDS = 600;

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

export type AuthHandlers = {
  login(request: Request, kind: string): Promise<Response>;
  callback(request: Request, kind: string): Promise<Response>;
  logout(request: Request): Promise<Response>;
  session(request: Request): Promise<Response>;
  /** The current session, for server-side API calls; undefined if absent, invalid or expired. */
  currentSession(request: Request): Promise<Session | undefined>;
};

export type AuthHandlerOptions = {
  /** Clock in milliseconds (tests). */
  now?: () => number;
  /** Fetch used for every request to the provider (tests: trust a test CA). */
  customFetch?: oidc.CustomFetch;
};

export function createAuthHandlers(
  config: AuthConfig,
  options: AuthHandlerOptions = {},
): AuthHandlers {
  const now = options.now ?? (() => Date.now());
  const discovered = new Map<LoginKind, Promise<oidc.Configuration>>();
  const nowSeconds = () => Math.floor(now() / 1000);

  function provider(kind: string): { kind: LoginKind; provider: ProviderConfig } | undefined {
    if (!isLoginKind(kind)) return undefined;
    const p = config.providers[kind];
    return p === undefined ? undefined : { kind, provider: p };
  }

  /** Discovery is cached; a failure is not, so a provider outage recovers without a restart. */
  function configuration(kind: LoginKind, p: ProviderConfig): Promise<oidc.Configuration> {
    let pending = discovered.get(kind);
    if (pending === undefined) {
      // HTTPS only: there is no plain-http path in this code. Tests use a TLS test provider and
      // pass a fetch that trusts its throwaway certificate.
      pending = oidc.discovery(new URL(p.issuer), p.clientId, p.clientSecret, undefined, {
        timeout: 10,
        ...(options.customFetch === undefined ? {} : { [oidc.customFetch]: options.customFetch }),
      });
      pending.catch(() => discovered.delete(kind));
      discovered.set(kind, pending);
    }
    return pending;
  }

  const callbackUrl = (kind: LoginKind) => `${config.publicOrigin}/auth/${kind}/callback`;

  async function currentSession(request: Request): Promise<Session | undefined> {
    const s = await openSession(
      readCookie(request.headers.get('cookie'), SESSION_COOKIE),
      config.sessionKey,
    );
    return s !== undefined && s.expiresAt > nowSeconds() ? s : undefined;
  }

  return {
    currentSession,

    async login(_request, kind) {
      const found = provider(kind);
      if (found === undefined) return plain(404, 'Not found');
      let cfg: oidc.Configuration;
      try {
        cfg = await configuration(found.kind, found.provider);
      } catch {
        // Provider outage: say so, keep nothing, leak nothing.
        return plain(503, 'Sign-in is temporarily unavailable. Please try again later.');
      }
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const transaction = {
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
      let cfg: oidc.Configuration;
      try {
        cfg = await configuration(found.kind, found.provider);
      } catch {
        return plain(503, 'Sign-in is temporarily unavailable. Please try again later.');
      }
      // The callback URL is rebuilt from the configured origin, never from request headers.
      const incoming = new URL(request.url);
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
      const expiresIn = tokens.expiresIn();
      if (
        claims === undefined ||
        tokens.id_token === undefined ||
        expiresIn === undefined ||
        expiresIn <= 0
      ) {
        return failed();
      }
      if (found.provider.requireMfa) {
        const amr: unknown = claims.amr;
        const authTime = claims.auth_time;
        // Defence in depth: the API checks this again on every operator request (D-033).
        if (
          !Array.isArray(amr) ||
          !amr.includes('mfa') ||
          typeof authTime !== 'number' ||
          nowSeconds() - authTime > found.provider.maxAuthAgeSeconds
        ) {
          return failed();
        }
      }
      const session: Session = {
        kind: found.kind,
        issuer: claims.iss,
        subject: claims.sub,
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        expiresAt: nowSeconds() + Math.min(expiresIn, found.provider.maxSessionSeconds),
      };
      const sealed = await sealSession(session, config.sessionKey);
      if (sealed.length > MAX_COOKIE_BYTES) return failed(); // never silently drop a session
      return redirect(`${config.publicOrigin}/`, [
        clearCookie(LOGIN_COOKIE),
        cookie(SESSION_COOKIE, sealed, session.expiresAt - nowSeconds()),
      ]);
    },

    async logout(request) {
      // CSRF: state-changing, so POST only, and only from our own origin.
      if (request.method !== 'POST') return plain(405, 'Method not allowed', { allow: 'POST' });
      if (request.headers.get('origin') !== config.publicOrigin) return plain(403, 'Forbidden');
      const session = await openSession(
        readCookie(request.headers.get('cookie'), SESSION_COOKIE),
        config.sessionKey,
      );
      const cleared = [clearCookie(SESSION_COOKIE)];
      const found = session === undefined ? undefined : provider(session.kind);
      if (session === undefined || found === undefined)
        return redirect(`${config.publicOrigin}/`, cleared, 303);
      try {
        const cfg = await configuration(found.kind, found.provider);
        // RP-initiated logout ends the provider session too.
        const url = oidc.buildEndSessionUrl(cfg, {
          id_token_hint: session.idToken,
          post_logout_redirect_uri: `${config.publicOrigin}/`,
        });
        return redirect(url.href, cleared, 303);
      } catch {
        // Provider unreachable: the local session is still ended.
        return redirect(`${config.publicOrigin}/`, cleared, 303);
      }
    },

    async session(request) {
      const s = await currentSession(request);
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
