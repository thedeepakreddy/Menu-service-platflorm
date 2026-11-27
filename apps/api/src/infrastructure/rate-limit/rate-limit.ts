import { Logger } from '@nestjs/common';
import type { ErrorEnvelope } from '@platform/contracts';
import type { NextFunction, Request, Response } from 'express';

import { resolveRequestId } from '../../request-id.js';
import {
  addressKey,
  CLIENT_ADDRESS_HEADER,
  clientAddress,
  parseTrustedProxies,
} from './client-address.js';
import type { TrustedProxies } from './client-address.js';
import { RateLimiter } from './rate-limiter.js';
import type { RateLimitPolicy } from './rate-limiter.js';

/**
 * Route groups with their limits (D-031, amended by D-037). A group's budget is SHARED by every
 * route in the group (audit D-01: the former per-module guard gave each controller its own
 * limiter, so the operator budget was effectively doubled).
 *
 * Applied as Express middleware BEFORE body parsing and before any authentication or database
 * work (audit D-02), so a refused request costs only a map lookup. One limiter per process.
 */
export type RateLimitGroup = 'public-tenant' | 'owner' | 'operator' | 'session';

export type RateLimitConfig = {
  policies: Record<RateLimitGroup, RateLimitPolicy>;
  /** Upper bound on tracked keys per instance. */
  maxKeys: number;
  /** Clock, injectable for tests. */
  now?: () => number;
};

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  policies: {
    'public-tenant': { limit: 120, windowMs: 60_000 },
    owner: { limit: 120, windowMs: 60_000 },
    operator: { limit: 30, windowMs: 60_000 },
    session: { limit: 60, windowMs: 60_000 },
  },
  maxKeys: 50_000,
};

/**
 * The group a request path belongs to. Express matches routes case-insensitively, so the path is
 * normalised (decoded, lower-cased, repeated slashes collapsed) before classification: no
 * spelling of an operator path can fall into a more generous group. Only the health probes are
 * unlimited; every other path (including unknown ones) is limited.
 */
export function routeGroup(rawPath: string): RateLimitGroup | undefined {
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    // keep the raw path; malformed escapes are classified as they are
  }
  path = path.toLowerCase().replace(/\/{2,}/g, '/');
  if (path === '/health' || path === '/health/ready') return undefined;
  if (path === '/operator' || path.startsWith('/operator/')) return 'operator';
  if (path === '/owner' || path.startsWith('/owner/')) return 'owner';
  if (path === '/auth/sessions' || path.startsWith('/auth/sessions/')) return 'session';
  return 'public-tenant';
}

export type RateLimitMiddlewareOptions = {
  config: RateLimitConfig;
  /** Exact IPs / CIDRs whose X-Forwarded-For entries are trusted (D-037). Empty: none. */
  trustedProxies?: readonly string[];
  /** True if the request carries the valid BFF credential (then its forwarded address counts). */
  isBff?: (req: Request) => boolean;
};

const logger = new Logger('RateLimit');

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions) {
  const { config } = options;
  const limiter = new RateLimiter(config.maxKeys, config.now);
  const proxies: TrustedProxies = parseTrustedProxies(options.trustedProxies ?? []);
  const isBff = options.isBff ?? (() => false);

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const group = routeGroup(req.path);
    if (group === undefined) {
      next();
      return;
    }
    const address = clientAddress(
      {
        socketAddress: req.socket.remoteAddress,
        forwardedFor: header(req, 'x-forwarded-for'),
        bffForwarded: header(req, CLIENT_ADDRESS_HEADER),
        bffAuthenticated: header(req, CLIENT_ADDRESS_HEADER) !== undefined && isBff(req),
      },
      proxies,
    );
    const decision = limiter.hit(`${group}|${addressKey(address)}`, config.policies[group]);
    if (decision.allowed) {
      next();
      return;
    }
    const requestId = req.requestId ?? resolveRequestId(undefined);
    // Never log the client address (D-020): personal data, and not needed to act on this.
    logger.warn({ event: 'rate_limited', group, reason: decision.reason, requestId });
    const body: ErrorEnvelope = {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please retry later.',
        requestId,
      },
    };
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    res.status(429).json(body);
  };
}
