// Trusted-proxy model and rate-limit keys (D-037; audit D-01, D-03, D-04, D-05).
import { describe, expect, it } from 'vitest';

import {
  addressKey,
  clientAddress,
  normalizeAddress,
  parseTrustedProxies,
} from './client-address.js';
import { routeGroup } from './rate-limit.js';
import { RateLimiter } from './rate-limiter.js';

const none = parseTrustedProxies([]);
const proxies = parseTrustedProxies(['10.0.0.0/8', '192.0.2.10', 'fd00::/8']);
const input = (over: Partial<Parameters<typeof clientAddress>[0]>) => ({
  socketAddress: '203.0.113.7',
  forwardedFor: undefined,
  bffForwarded: undefined,
  bffAuthenticated: false,
  ...over,
});

describe('clientAddress: trust model', () => {
  it('uses the socket address when no proxy is trusted, ignoring forwarded headers', () => {
    expect(clientAddress(input({ forwardedFor: '198.51.100.1' }), none)).toBe('203.0.113.7');
  });

  it('ignores X-Forwarded-For from an untrusted peer even when proxies are configured', () => {
    expect(clientAddress(input({ forwardedFor: '198.51.100.1' }), proxies)).toBe('203.0.113.7');
  });

  it('takes the right-most untrusted hop behind trusted proxies', () => {
    const seen = clientAddress(
      input({ socketAddress: '10.1.2.3', forwardedFor: '198.51.100.1, 203.0.113.9, 10.9.9.9' }),
      proxies,
    );
    expect(seen).toBe('203.0.113.9');
  });

  it('cannot be spoofed by prepending addresses: the client controls only the left part', () => {
    const spoofed = clientAddress(
      input({ socketAddress: '192.0.2.10', forwardedFor: '10.0.0.1, 1.1.1.1, 203.0.113.50' }),
      proxies,
    );
    expect(spoofed).toBe('203.0.113.50');
  });

  it('falls back to the peer for a malformed or oversized header', () => {
    expect(
      clientAddress(
        input({ socketAddress: '10.0.0.1', forwardedFor: 'not-an-ip, 1.2.3.4' }),
        proxies,
      ),
    ).toBe('10.0.0.1');
    const long = Array.from({ length: 40 }, () => '198.51.100.1').join(',');
    expect(clientAddress(input({ socketAddress: '10.0.0.1', forwardedFor: long }), proxies)).toBe(
      '10.0.0.1',
    );
  });

  it('honours the BFF-forwarded address only with the BFF credential', () => {
    expect(clientAddress(input({ bffForwarded: '198.51.100.77' }), none)).toBe('203.0.113.7');
    expect(
      clientAddress(input({ bffForwarded: '198.51.100.77', bffAuthenticated: true }), none),
    ).toBe('198.51.100.77');
    expect(clientAddress(input({ bffForwarded: 'garbage', bffAuthenticated: true }), none)).toBe(
      '203.0.113.7',
    );
  });

  it('treats IPv4-mapped IPv6 as IPv4', () => {
    expect(normalizeAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('rejects invalid trusted-proxy entries', () => {
    for (const bad of ['*', 'proxy', '10.0.0.0/33', '::/129', '10.0.0.0/a']) {
      expect(() => parseTrustedProxies([bad])).toThrow();
    }
  });
});

describe('addressKey: IPv6 /64 aggregation (D-04)', () => {
  it('keys every address of one /64 alike, and different /64s apart', () => {
    expect(addressKey('2001:db8:1:2::1')).toBe(addressKey('2001:db8:1:2:ffff:ffff:ffff:ffff'));
    expect(addressKey('2001:db8:1:2::1')).not.toBe(addressKey('2001:db8:1:3::1'));
    expect(addressKey('2001:db8:1:2::1')).toBe('2001:0db8:0001:0002::/64');
  });

  it('keeps IPv4 addresses exact', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
  });
});

describe('routeGroup: every spelling of a path lands in its group (D-01)', () => {
  it.each([
    ['/operator/session', 'operator'],
    ['/operator/tenants', 'operator'],
    ['/OPERATOR/session', 'operator'],
    ['//operator//tenants', 'operator'],
    ['/%6Fperator/session', 'operator'],
    ['/owner/tenants/x', 'owner'],
    ['/auth/sessions', 'session'],
    ['/auth/sessions/current/owner', 'session'],
    ['/public/tenants/x', 'public-tenant'],
    ['/unknown', 'public-tenant'],
  ])('%s → %s', (path, group) => {
    expect(routeGroup(path)).toBe(group);
  });

  it('leaves only the health probes unlimited', () => {
    expect(routeGroup('/health')).toBeUndefined();
    expect(routeGroup('/health/ready')).toBeUndefined();
  });
});

describe('RateLimiter: O(1) eviction (D-03)', () => {
  it('evicts expired windows from the head without scanning live ones', () => {
    let t = 0;
    const limiter = new RateLimiter(3, () => t);
    const policy = { limit: 1, windowMs: 1000 };
    limiter.hit('a', policy);
    limiter.hit('b', policy);
    t = 500;
    limiter.hit('c', policy);
    expect(limiter.hit('d', policy)).toMatchObject({ allowed: false, reason: 'capacity' });
    t = 1000; // a and b have expired
    expect(limiter.hit('d', policy).allowed).toBe(true);
    expect(limiter.size).toBe(2);
  });

  it('reports a capacity Retry-After from the oldest window, not a fixed value (D-06)', () => {
    let t = 0;
    const limiter = new RateLimiter(1, () => t);
    limiter.hit('a', { limit: 5, windowMs: 60_000 });
    t = 50_000;
    expect(limiter.hit('b', { limit: 5, windowMs: 60_000 })).toEqual({
      allowed: false,
      reason: 'capacity',
      retryAfterSeconds: 10,
    });
  });

  it('stays fast with a full table of live keys', () => {
    const limiter = new RateLimiter(50_000, () => 0);
    const policy = { limit: 1, windowMs: 60_000 };
    for (let i = 0; i < 50_000; i += 1) limiter.hit(`k${String(i)}`, policy);
    const started = performance.now();
    for (let i = 0; i < 10_000; i += 1) limiter.hit(`new${String(i)}`, policy);
    // The old O(n) scan took ~0.5 ms per refused key (5 s here); O(1) takes a few ms in total.
    expect(performance.now() - started).toBeLessThan(500);
  });
});
