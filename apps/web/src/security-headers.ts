import type { WebEnv } from './env';

/**
 * Baseline HTTP security headers for every web route (security baseline
 * D-019). A strict Content-Security-Policy needs nonce plumbing in Next.js
 * and is deferred to the customer platform phase (G-31, Phase 3).
 * HSTS is sent only in production-like environments, without
 * `includeSubDomains`/`preload` until the tenant domain model is decided.
 */
export type HeaderEntry = { key: string; value: string };

export function webSecurityHeaders(appEnv: WebEnv['APP_ENV']): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
  if (appEnv === 'staging' || appEnv === 'production') {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
  }
  return headers;
}
