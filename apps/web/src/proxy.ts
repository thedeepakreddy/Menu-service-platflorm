import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { parseWebEnv } from './env';
import { RAW_TENANT_SEGMENT_HEADER, rawFirstSegment } from './public/raw-segment';
import { contentSecurityPolicy, cspNonce, hstsHeader } from './security-headers';

/**
 * Request-time handling for every route:
 *
 * - Security headers that depend on the runtime environment (D-019, audit F-04): `APP_ENV` is read
 *   from the running server, not the build, so HSTS follows the environment an artifact is
 *   deployed to. `next start` has already refused an invalid APP_ENV when it loaded
 *   next.config.ts; this parse fails closed too.
 * - A strict, nonce-based Content-Security-Policy, fresh for every request (Phase 3 M3.5, G-31).
 *   Next.js reads the nonce from the request's CSP header and puts it on its own scripts; every
 *   page is dynamically rendered (D-040 O-6), so no prerendered page carries a stale nonce.
 * - The raw (still percent-encoded) first path segment is passed to the page in a request header
 *   that this proxy always overwrites, so the tenant resolver can refuse non-canonical spellings
 *   (D-040 O-1) and a client can never supply its own value.
 */
const env = parseWebEnv(process.env);
const hsts = hstsHeader(env.APP_ENV);
// Logout is a same-origin POST that redirects to the provider's end-session endpoint.
const formActionOrigins = [env.WEB_OWNER_OIDC_ISSUER, env.WEB_OPERATOR_OIDC_ISSUER]
  .filter((issuer): issuer is string => issuer !== undefined)
  .map((issuer) => new URL(issuer).origin);
// `next dev` needs eval for React refresh. Never relaxed where staging or production is declared,
// whatever NODE_ENV says (defence in depth, M3.6 review finding 11).
const devServer =
  process.env.NODE_ENV === 'development' &&
  env.APP_ENV !== 'staging' &&
  env.APP_ENV !== 'production';

export function proxy(request: NextRequest): NextResponse {
  const csp = contentSecurityPolicy({
    nonce: cspNonce(),
    appEnv: env.APP_ENV,
    devServer,
    formActionOrigins: [...new Set(formActionOrigins)],
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.delete(RAW_TENANT_SEGMENT_HEADER);
  const raw = rawFirstSegment(new URL(request.url).pathname);
  if (raw !== undefined) requestHeaders.set(RAW_TENANT_SEGMENT_HEADER, raw);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  // noindex for every response, independent of JavaScript and of page metadata: the not-found
  // shell carries its robots meta only after client rendering (D-040 O-7; G-51; review 10).
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  if (hsts !== undefined) response.headers.set(hsts.key, hsts.value);
  return response;
}

export const config = { matcher: '/:path*' };
