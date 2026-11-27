// HTTP rate limiting against the real stack (D-031, D-037; audit D-01, D-02, D-04, D-05). Limits
// are tiny and the clock is injected, so the tests are deterministic.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { errorEnvelopeSchema } from '@platform/contracts';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createIdps, identityConfig } from '../../../test/db/app.js';
import {
  bffHeaders,
  seedOperator,
  seedTenant,
  TEST_BFF_CREDENTIAL,
} from '../../../test/db/fixtures.js';
import { createApp } from '../../create-app.js';
import { JsonLogger } from '../../logging/json-logger.js';
import { createDatabase } from '../database/database.js';
import { DEFAULT_RATE_LIMITS } from './rate-limit.js';
import type { RateLimitConfig } from './rate-limit.js';

const { adminUrl, runtimeUrl, operatorUrl } = inject('database');
let now = 5_000_000;
const lines: string[] = [];
let tenantSlug: string;
let operatorToken: string;

type Started = { app: INestApplication; base: string };
const started: Started[] = [];

async function start(rateLimits: RateLimitConfig, trustedProxies: string[] = []): Promise<Started> {
  const app = await createApp({
    logger: new JsonLogger({ level: 'info', sink: (l) => lines.push(l) }),
    database: createDatabase({ connectionString: runtimeUrl, maxConnections: 2 }),
    operatorDatabase: createDatabase({ connectionString: operatorUrl, maxConnections: 1 }),
    identity: identityConfig(await createIdps()),
    rateLimits,
    trustedProxies,
  });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  const s = { app, base: `http://127.0.0.1:${String(port)}` };
  started.push(s);
  return s;
}

const small = (operator = 30): RateLimitConfig => ({
  policies: {
    'public-tenant': { limit: 3, windowMs: 60_000 },
    owner: { limit: 3, windowMs: 60_000 },
    operator: { limit: operator, windowMs: 60_000 },
    session: { limit: 3, windowMs: 60_000 },
  },
  maxKeys: 100,
  now: () => now,
});

let s: Started;

beforeAll(async () => {
  tenantSlug = (await seedTenant(adminUrl)).slug;
  operatorToken = (await seedOperator(adminUrl)).token;
  s = await start(small(2));
});

afterAll(async () => {
  for (const x of started) await x.app.close();
});

describe('HTTP rate limiting (D-031, D-037)', () => {
  it('public tenant resolution: the 4th request in a window is 429 with Retry-After and the envelope', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i += 1) {
      statuses.push((await fetch(`${s.base}/public/tenants/${tenantSlug}`)).status);
    }
    const limited = await fetch(`${s.base}/public/tenants/${tenantSlug}`);
    expect(statuses).toEqual([200, 200, 200]);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(errorEnvelopeSchema.parse(await limited.json()).error.code).toBe('TOO_MANY_REQUESTS');
    expect(limited.headers.get('x-content-type-options')).toBe('nosniff'); // headers still set
  });

  it('a new window restores access', async () => {
    now += 61_000;
    expect((await fetch(`${s.base}/public/tenants/${tenantSlug}`)).status).toBe(200);
  });

  it('failed authentication attempts count: guessing is limited before any verification', async () => {
    now += 61_000;
    const a = await fetch(`${s.base}/operator/session`, { headers: bffHeaders('A'.repeat(43)) });
    const b = await fetch(`${s.base}/operator/session`, { headers: bffHeaders('B'.repeat(43)) });
    const c = await fetch(`${s.base}/operator/session`, { headers: bffHeaders(operatorToken) });
    expect([a.status, b.status, c.status]).toEqual([401, 401, 429]);
  });
});

describe('D-01: one budget per group, shared by every route in it', () => {
  it('reproduces the audit: 32 requests spread over two operator routes allow only 30 in total', async () => {
    const x = await start(small(30));
    const routes = ['/operator/session', '/operator/tenants/some-tenant'];
    const statuses: number[] = [];
    for (let i = 0; i < 32; i += 1) {
      const res = await fetch(`${x.base}${routes[i % 2] ?? ''}`, {
        headers: bffHeaders('A'.repeat(43)),
      });
      statuses.push(res.status);
    }
    // Before the fix each controller had its own limiter: 60 per minute (30 + 30).
    expect(statuses.filter((st) => st === 429)).toHaveLength(2);
    expect(statuses.slice(0, 30).every((st) => st === 401)).toBe(true);
  });

  it('case or slash variants of a path share the same budget', async () => {
    const x = await start(small(2));
    const a = await fetch(`${x.base}/operator/session`);
    const b = await fetch(`${x.base}/OPERATOR/session`);
    const c = await fetch(`${x.base}//operator//session`);
    expect([a.status, b.status, c.status]).toEqual([401, 401, 429]);
  });

  it('groups are independent: exhausting operator does not affect owner or public routes', async () => {
    const x = await start(small(1));
    await fetch(`${x.base}/operator/session`);
    expect((await fetch(`${x.base}/operator/session`)).status).toBe(429);
    expect((await fetch(`${x.base}/owner/tenants/${tenantSlug}`)).status).toBe(401);
    expect((await fetch(`${x.base}/public/tenants/${tenantSlug}`)).status).toBe(200);
  });

  it('the default operator budget is exactly 30 per minute (D-031)', () => {
    expect(DEFAULT_RATE_LIMITS.policies.operator).toEqual({ limit: 30, windowMs: 60_000 });
  });
});

describe('D-02: limited before the body is parsed', () => {
  it('a rate-limited request with a large nested JSON body is refused without parsing it', async () => {
    const x = await start(small(1));
    await fetch(`${x.base}/operator/tenants`, {
      method: 'POST',
      headers: bffHeaders(),
      body: '{}',
    });
    const nested = `${'['.repeat(10_000)}${']'.repeat(10_000)}`;
    const res = await fetch(`${x.base}/operator/tenants`, {
      method: 'POST',
      headers: bffHeaders(),
      body: nested,
    });
    expect(res.status).toBe(429); // not 400/413: refused before the body parser
  });
});

describe('D-04/D-05: client identity and the trusted-proxy model', () => {
  it('ignores X-Forwarded-For without a trusted proxy (no spoofed fresh budgets)', async () => {
    const x = await start(small());
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await fetch(`${x.base}/public/tenants/${tenantSlug}`, {
        headers: { 'x-forwarded-for': `198.51.100.${String(i)}` },
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('behind a trusted proxy, distinct clients get distinct budgets', async () => {
    const x = await start(small(), ['127.0.0.1']);
    const hit = (client: string) =>
      fetch(`${x.base}/public/tenants/${tenantSlug}`, {
        headers: { 'x-forwarded-for': client },
      }).then((r) => r.status);
    for (let i = 0; i < 3; i += 1) await hit('198.51.100.1');
    expect(await hit('198.51.100.1')).toBe(429);
    expect(await hit('198.51.100.2')).toBe(200);
  });

  it('IPv6 clients behind a trusted proxy are keyed by /64', async () => {
    const x = await start(small(), ['127.0.0.1']);
    const hit = (client: string) =>
      fetch(`${x.base}/public/tenants/${tenantSlug}`, {
        headers: { 'x-forwarded-for': client },
      }).then((r) => r.status);
    expect(await hit('2001:db8:1:1::1')).toBe(200);
    expect(await hit('2001:db8:1:1::2')).toBe(200);
    expect(await hit('2001:db8:1:1:ffff::3')).toBe(200);
    expect(await hit('2001:db8:1:1::4')).toBe(429); // same /64, new address: same budget
    expect(await hit('2001:db8:1:2::1')).toBe(200);
  });

  it('the BFF-forwarded client address counts only with the BFF credential', async () => {
    const x = await start(small());
    const hit = (client: string, credential: boolean) =>
      fetch(`${x.base}/public/tenants/${tenantSlug}`, {
        headers: {
          'x-platform-client-address': client,
          ...(credential ? { 'x-platform-bff-credential': TEST_BFF_CREDENTIAL } : {}),
        },
      }).then((r) => r.status);
    // With the credential, each browser behind the BFF has its own budget.
    for (let i = 0; i < 3; i += 1) await hit('198.51.100.10', true);
    expect(await hit('198.51.100.10', true)).toBe(429);
    expect(await hit('198.51.100.11', true)).toBe(200);
    // Without it, the header is ignored: all such requests share the socket address's budget.
    for (let i = 0; i < 3; i += 1) await hit(`203.0.113.${String(i)}`, false);
    expect(await hit('203.0.113.99', false)).toBe(429);
  });

  it('logs the limited group, never the client address', () => {
    const limited = lines.filter((l) => l.includes('rate_limited'));
    expect(limited.length).toBeGreaterThan(0);
    expect(limited.every((l) => !l.includes('127.0.0.1') && !l.includes('198.51.100'))).toBe(true);
  });
});
