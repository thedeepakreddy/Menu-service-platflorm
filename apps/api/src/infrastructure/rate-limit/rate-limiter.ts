/**
 * In-process fixed-window rate limiter (decisions D-031, D-037).
 *
 * INSTANCE-LOCAL: each API process counts independently. With N instances a client can make up to
 * N × limit requests per window. This is not distributed enforcement; an edge or shared-store
 * limit is required before running more than one instance (pre-production blocker, D-037).
 *
 * Memory is bounded by `maxKeys`. Eviction is O(1) amortised (audit D-03): windows are kept in
 * insertion order (a key whose window restarts is re-inserted at the end), so expired windows
 * collect at the head and are dropped from there. When the table is full of live keys, a NEW key
 * is refused — fail closed — because failing open would let an attacker bypass every limit by
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
      this.evictExpiredHead(now);
      if (this.windows.size >= this.maxKeys) {
        return {
          allowed: false,
          retryAfterSeconds: this.capacityRetryAfter(now),
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

  /** Drops expired windows from the head of the insertion order; stops at the first live one. */
  private evictExpiredHead(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt > now) return;
      this.windows.delete(key);
    }
  }

  /** When the table is full: the time until the oldest window frees its slot (audit D-06). */
  private capacityRetryAfter(now: number): number {
    const first = this.windows.values().next();
    const resetAt = first.done === true ? now : first.value.resetAt;
    return Math.max(1, Math.ceil((resetAt - now) / 1000));
  }
}
