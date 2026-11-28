/**
 * Login abuse controls for the web BFF (decision D-038; audit C-03). INSTANCE-LOCAL, like the
 * API's limiter: N web instances allow N × these limits (recorded as a pre-production condition).
 *
 * The audit showed one client could make the BFF send ~250 token requests per second to the
 * identity provider with forged callbacks, enough to trip ZITADEL Cloud's per-IP ban (50 req/s)
 * and lock every user out. Four independent controls now stand in the way:
 *
 *  1. per-client limits on /auth/<kind>/login and /callback (best effort: the client address is
 *     only as trustworthy as the configured proxy hops);
 *  2. global per-instance limits on the same routes (not spoofable);
 *  3. a global cap on outbound token requests (protects the provider's budget whatever happens);
 *  4. single-use login transactions: a login cookie completes at most one callback, so each
 *     forged callback costs the attacker a fresh login (no amplification).
 */

type Window = { count: number; resetAt: number };

/** Fixed-window counters with bounded memory and O(1) eviction (same design as the API, D-037). */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
    private readonly now: () => number,
  ) {}

  /** True if allowed (and counted). Full table of live keys: refuse new keys (fail closed). */
  hit(key: string): boolean {
    const now = this.now();
    let w = this.windows.get(key);
    if (w !== undefined && w.resetAt <= now) {
      this.windows.delete(key);
      w = undefined;
    }
    if (w === undefined) {
      for (const [k, old] of this.windows) {
        if (old.resetAt > now) break;
        this.windows.delete(k);
      }
      if (this.windows.size >= this.maxKeys) return false;
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    if (w.count >= this.limit) return false;
    w.count += 1;
    return true;
  }
}

/**
 * Ids of login transactions that have completed (or tried to). Bounded; entries expire with the
 * transaction itself. When full of live entries, new completions are refused (fail closed).
 */
export class SingleUseSet {
  private readonly used = new Map<string, number>();

  constructor(
    private readonly maxEntries: number,
    private readonly now: () => number,
  ) {}

  /** Marks `id` used; false if it was already used or the set is full. */
  consume(id: string, expiresAt: number): boolean {
    const now = this.now();
    for (const [k, exp] of this.used) {
      if (exp > now) break;
      this.used.delete(k);
    }
    if (this.used.has(id) || this.used.size >= this.maxEntries) return false;
    this.used.set(id, expiresAt);
    return true;
  }
}

export { webClientAddress } from '../http/client-address';

/** RFC 6749 §A.11: a code is printable ASCII; we also bound its length before any provider call. */
export const AUTHORIZATION_CODE = /^[\x21-\x7e]{8,512}$/;
