import type { WebEnv } from './env';

/**
 * Baseline HTTP security headers for every web route (security baseline
 * D-019). A strict Content-Security-Policy needs nonce plumbing in Next.js
 * and is deferred to the customer platform phase (G-31, Phase 3).
 *
 * Two kinds of header, delivered differently (audit F-04):
 * - `webSecurityHeaders()` do not depend on the environment. They are set in
 *   `next.config.ts`, which Next.js compiles into the build output; binding
 *   them at build time is harmless because they are constants.
 * - `hstsHeader()` depends on the deployment environment. It is set at
 *   request time by `src/proxy.ts` from the runtime `APP_ENV`, so the same
 *   build artifact can be promoted from test to staging to production
 *   (Doc 01 §17) and sends HSTS exactly where it runs as staging/production.
 *   HSTS omits `includeSubDomains`/`preload` until the tenant domain model
 *   is decided (G-06, G-21).
 */
export type HeaderEntry = { key: string; value: string };

export function webSecurityHeaders(): HeaderEntry[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
}

/** HSTS for production-like environments only; never in development or test. */
export function hstsHeader(appEnv: WebEnv['APP_ENV']): HeaderEntry | undefined {
  return appEnv === 'staging' || appEnv === 'production'
    ? { key: 'Strict-Transport-Security', value: 'max-age=31536000' }
    : undefined;
}
