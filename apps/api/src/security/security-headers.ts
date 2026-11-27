import type { NextFunction, Request, Response } from 'express';

/**
 * Baseline HTTP security headers for the JSON API (security baseline D-019).
 *
 * The API serves only JSON, so it can use the strictest CSP and framing
 * policy. Responses are `no-store` because no API response is cacheable
 * public content yet; caching policy for tenant content is a Phase 3
 * prerequisite (G-37). HSTS is sent only in production-like environments,
 * which must terminate TLS. It deliberately omits `includeSubDomains` and
 * `preload` until the tenant domain/subdomain model is decided (G-06, G-21).
 */
export function securityHeaders(options: { hsts: boolean }) {
  return function securityHeadersMiddleware(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    if (options.hsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  };
}
