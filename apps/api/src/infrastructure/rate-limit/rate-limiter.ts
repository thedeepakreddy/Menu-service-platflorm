/**
 * In-process fixed-window rate limiter (decision D-031).
 *
 * INSTANCE-LOCAL: each API process counts independently. With N instances a client can make up to
 * N × limit requests per window. This is not distributed enforcement; an edge or shared-store
 * limit is required before running more than one instance (D-031, Phase 10).
 *
 * Memory is bounded by `maxKeys`. When the table is full of live (unexpired) keys, a NEW key is
 * refused — fail closed — because failing open would let an attacker bypass every limit simply by
 * rotating source addresses. Existing keys keep their own budgets.
 */
export type RateLimitPolicy = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number; reason: 'limit' | 'capacity' };

type Window = { count: number; resetAt: number };

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly maxKeys: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new RangeError('maxKeys must be >= 1');
  }

  /** Counts one request for `key` under `policy`. Synchronous, so atomic within the process. */
  hit(key: string, policy: RateLimitPolicy): RateLimitDecision {
    const now = this.now();
    let window = this.windows.get(key);
    if (window !== undefined && window.resetAt <= now) {
      this.windows.delete(key);
      window = undefined;
    }
    if (window === undefined) {
      if (this.windows.size >= this.maxKeys) this.evictExpired(now);
      if (this.windows.size >= this.maxKeys) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(policy.windowMs / 1000),
          reason: 'capacity',
        };
      }
      window = { count: 0, resetAt: now + policy.windowMs };
      this.windows.set(key, window);
    }
    if (window.count >= policy.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
        reason: 'limit',
      };
    }
    window.count += 1;
    return { allowed: true, remaining: policy.limit - window.count };
  }

  /** Number of tracked keys (for tests and metrics). */
  get size(): number {
    return this.windows.size;
  }

  private evictExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
