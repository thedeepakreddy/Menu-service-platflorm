import { describe, expect, it } from 'vitest';

import { RateLimiter } from './rate-limiter.js';

const policy = { limit: 3, windowMs: 10_000 };

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('RateLimiter (D-031, instance-local)', () => {
  it('allows up to the limit in a window, then refuses with Retry-After', () => {
    const c = clock();
    const rl = new RateLimiter(100, c.now);
    expect([1, 2, 3].map(() => rl.hit('k', policy).allowed)).toEqual([true, true, true]);
    c.advance(4_000);
    expect(rl.hit('k', policy)).toEqual({ allowed: false, retryAfterSeconds: 6, reason: 'limit' });
  });

  it('starts a fresh window once the old one has expired', () => {
    const c = clock();
    const rl = new RateLimiter(100, c.now);
    for (let i = 0; i < 3; i += 1) rl.hit('k', policy);
    c.advance(10_000);
    expect(rl.hit('k', policy)).toEqual({ allowed: true, remaining: 2 });
  });

  it('keeps keys independent', () => {
    const rl = new RateLimiter(100, clock().now);
    for (let i = 0; i < 3; i += 1) rl.hit('a', policy);
    expect(rl.hit('a', policy).allowed).toBe(false);
    expect(rl.hit('b', policy).allowed).toBe(true);
  });

  it('fails closed for NEW keys when the table is full of live keys; existing keys keep working', () => {
    const rl = new RateLimiter(2, clock().now);
    expect(rl.hit('a', policy).allowed).toBe(true);
    expect(rl.hit('b', policy).allowed).toBe(true);
    expect(rl.hit('c', policy)).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
      reason: 'capacity',
    });
    expect(rl.hit('a', policy).allowed).toBe(true);
    expect(rl.size).toBe(2);
  });

  it('evicts expired keys to make room, so memory stays bounded', () => {
    const c = clock();
    const rl = new RateLimiter(2, c.now);
    rl.hit('a', policy);
    rl.hit('b', policy);
    c.advance(10_001);
    expect(rl.hit('c', policy).allowed).toBe(true);
    expect(rl.size).toBe(1);
  });

  it('holds the bound under a flood of distinct keys', () => {
    const rl = new RateLimiter(1_000, clock().now);
    let refused = 0;
    for (let i = 0; i < 50_000; i += 1)
      if (!rl.hit(`ip-${String(i)}`, policy).allowed) refused += 1;
    expect(rl.size).toBe(1_000);
    expect(refused).toBe(49_000);
  });

  it('rejects an invalid capacity', () => {
    expect(() => new RateLimiter(0)).toThrow(RangeError);
  });
});
