import { HttpException, HttpStatus, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { RateLimiter } from './rate-limiter.js';
import type { RateLimitPolicy } from './rate-limiter.js';

/**
 * Route groups with their limits (D-031). Keyed by group + client socket address. Applied BEFORE
 * authentication guards, so failed authentication attempts count too.
 */
export type RateLimitGroup = 'public-tenant' | 'owner' | 'operator';

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
  },
  maxKeys: 50_000,
};

export const RATE_LIMIT_CONFIG = Symbol('RATE_LIMIT_CONFIG');
const RATE_LIMIT_GROUP = 'rateLimitGroup';

/** Marks a controller or handler with its rate-limit group. */
export const RateLimit = (group: RateLimitGroup) => SetMetadata(RATE_LIMIT_GROUP, group);

/**
 * The client address used as the key. Only the socket address: X-Forwarded-For is NOT trusted,
 * because without a configured trusted proxy any client could forge it (D-031). Behind a proxy,
 * all clients would share one key; configuring a trusted proxy is a deployment task (Phase 10).
 */
function clientAddress(req: Request): string {
  return req.socket.remoteAddress ?? 'unknown';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter: RateLimiter;
  private readonly logger = new Logger('RateLimit');

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_CONFIG) private readonly config: RateLimitConfig,
  ) {
    this.limiter = new RateLimiter(config.maxKeys, config.now);
  }

  canActivate(context: ExecutionContext): boolean {
    const group = this.reflector.getAllAndOverride<RateLimitGroup | undefined>(RATE_LIMIT_GROUP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (group === undefined) return true;
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const decision = this.limiter.hit(
      `${group}|${clientAddress(req)}`,
      this.config.policies[group],
    );
    if (decision.allowed) return true;
    http.getResponse<Response>().setHeader('Retry-After', String(decision.retryAfterSeconds));
    // Never log the client address (D-020): personal data, and not needed to act on this.
    this.logger.warn({
      event: 'rate_limited',
      group,
      reason: decision.reason,
      requestId: req.requestId,
    });
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}
