import { NextResponse } from 'next/server';

import { parseWebEnv } from './env';
import { hstsHeader } from './security-headers';

/**
 * Request-time security headers (D-019, audit F-04). `APP_ENV` is read from
 * the environment of the running server, not the build, so HSTS follows the
 * environment an artifact is deployed to. `next start` has already refused an
 * invalid APP_ENV when it loaded next.config.ts; this parse fails closed too.
 */
const hsts = hstsHeader(parseWebEnv(process.env).APP_ENV);

export function proxy(): NextResponse {
  const response = NextResponse.next();
  if (hsts !== undefined) response.headers.set(hsts.key, hsts.value);
  return response;
}

export const config = { matcher: '/:path*' };
