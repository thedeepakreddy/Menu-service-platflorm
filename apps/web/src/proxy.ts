import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { parseWebEnv } from './env';
import { RAW_TENANT_SEGMENT_HEADER, rawFirstSegment } from './public/raw-segment';
import { hstsHeader } from './security-headers';

/**
 * Request-time handling for every route:
 *
 * - Security headers that depend on the runtime environment (D-019, audit F-04): `APP_ENV` is read
 *   from the running server, not the build, so HSTS follows the environment an artifact is
 *   deployed to. `next start` has already refused an invalid APP_ENV when it loaded
 *   next.config.ts; this parse fails closed too.
 * - The raw (still percent-encoded) first path segment is passed to the page in a request header
 *   that this proxy always overwrites, so the tenant resolver can refuse non-canonical spellings
 *   (D-040 O-1) and a client can never supply its own value.
 */
const hsts = hstsHeader(parseWebEnv(process.env).APP_ENV);

export function proxy(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(RAW_TENANT_SEGMENT_HEADER);
  const raw = rawFirstSegment(new URL(request.url).pathname);
  if (raw !== undefined) requestHeaders.set(RAW_TENANT_SEGMENT_HEADER, raw);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (hsts !== undefined) response.headers.set(hsts.key, hsts.value);
  return response;
}

export const config = { matcher: '/:path*' };
