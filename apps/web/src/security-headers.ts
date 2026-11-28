import type { WebEnv } from './env';

/**
 * Baseline HTTP security headers for every web route (security baseline
 * D-019). The strict, nonce-based Content-Security-Policy (G-31, Phase 3) is
 * built per request by `contentSecurityPolicy()` below and set by `src/proxy.ts`.
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

export type CspOptions = {
  /** Fresh per request; never reused. */
  nonce: string;
  appEnv: WebEnv['APP_ENV'];
  /** True only under `next dev`, whose React refresh needs eval. Never in a built app. */
  devServer: boolean;
  /**
   * Origins a form submission may end up at besides our own: the OIDC issuers, because logout is
   * a same-origin POST that redirects to the provider's end-session endpoint.
   */
  formActionOrigins: readonly string[];
};

/**
 * Strict Content-Security-Policy (Phase 3 M3.5; G-31; Doc 01 §15 security). Scripts run only with
 * the per-request nonce (`strict-dynamic` lets Next.js load its own chunks from a trusted script);
 * no inline event handlers, no foreign scripts, no plugins, no framing, no `<base>` hijack, and
 * forms post only to us and the identity providers. Tenant content is text only, so nothing
 * tenant-supplied is ever allowed to run.
 */
export function contentSecurityPolicy(options: CspOptions): string {
  const nonce = `'nonce-${options.nonce}'`;
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      nonce,
      "'strict-dynamic'",
      ...(options.devServer ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", nonce],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'self'", ...options.formActionOrigins],
    ['frame-ancestors', "'none'"],
    ['frame-src', "'none'"],
    ['worker-src', "'self'"],
    ['manifest-src', "'self'"],
  ];
  if (options.appEnv === 'staging' || options.appEnv === 'production') {
    directives.push(['upgrade-insecure-requests']);
  }
  return directives.map((d) => d.join(' ')).join('; ');
}

/** A fresh CSP nonce: 128 random bits, base64. */
export function cspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
