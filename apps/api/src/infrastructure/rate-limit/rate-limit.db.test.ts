// HTTP rate limiting against the real stack (Phase 2 M2.5; D-031). Limits are tiny and the clock
// is injected, so the tests are deterministic.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { errorEnvelopeSchema } from '@platform/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createTestIssuer } from '../../../test/identity/test-issuer.ts';
import type { TestIssuer } from '../../../test/identity/test-issuer.ts';
import { createApp } from '../../create-app.js';
import { JsonLogger } from '../../logging/json-logger.js';
import { createIdentityVerifier } from '../../modules/identity/index.js';
import { createDatabase } from '../database/database.js';

const { ownerUrl, runtimeUrl } = inject('database');
let now = 5_000_000;
const lines: string[] = [];
let app: INestApplication;
let base: string;
let operators: TestIssuer;

beforeAll(async () => {
  operators = await createTestIssuer('https://operators.ratelimit.test', 'platform-operator-api');
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(
    "INSERT INTO app.tenants (slug, display_name) VALUES ('rate-limited', 'Rate Limited') ON CONFLICT DO NOTHING",
  );
  await owner.query(
    "INSERT INTO app.accounts (issuer, subject, kind) VALUES ($1, 'rl-operator', 'operator')",
    [operators.issuer],
  );
  await owner.end();
  app = await createApp({
    logger: new JsonLogger({ level: 'info', sink: (l) => lines.push(l) }),
    database: createDatabase({ connectionString: runtimeUrl, maxConnections: 2 }),
    identity: {
      operator: createIdentityVerifier({
        issuer: operators.issuer,
        audience: operators.audience,
        keys: operators.keys,
        requireMfa: true,
      }),
    },
    rateLimits: {
      policies: {
        'public-tenant': { limit: 3, windowMs: 60_000 },
        owner: { limit: 3, windowMs: 60_000 },
        operator: { limit: 2, windowMs: 60_000 },
      },
      maxKeys: 100,
      now: () => now,
    },
  });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  base = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  await app.close();
});

const get = (path: string, token?: string) =>
  fetch(
    `${base}${path}`,
    token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } },
  );

describe('HTTP rate limiting (D-031)', () => {
  it('public tenant resolution: the 4th request in a window is 429 with Retry-After and the envelope', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i += 1)
      statuses.push((await get('/public/tenants/rate-limited')).status);
    expect(statuses).toEqual([200, 200, 200]);
    now += 15_000;
    const limited = await get('/public/tenants/rate-limited');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('45');
    expect(errorEnvelopeSchema.parse(await limited.json()).error.code).toBe('TOO_MANY_REQUESTS');
    // Security headers are still present on a limited response.
    expect(limited.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('unknown and malformed slugs consume the same budget (no free enumeration)', async () => {
    now += 60_000; // fresh window
    for (const slug of ['nope-1', 'nope-2', 'Bad_Slug'])
      expect((await get(`/public/tenants/${slug}`)).status).toBe(404);
    expect((await get('/public/tenants/nope-3')).status).toBe(429);
  });

  it('a new window restores access', async () => {
    now += 60_000;
    expect((await get('/public/tenants/rate-limited')).status).toBe(200);
  });

  it('failed authentication attempts count: token guessing is limited before verification', async () => {
    expect((await get('/operator/session', 'guess-1')).status).toBe(401);
    expect((await get('/operator/session', 'guess-2')).status).toBe(401);
    const valid = await operators.token({ sub: 'rl-operator', amr: ['pwd', 'mfa'] });
    expect((await get('/operator/session', valid)).status).toBe(429);
  });

  it('groups are independent: exhausting operator does not affect owner routes', async () => {
    expect((await get('/owner/tenants/rate-limited')).status).toBe(401); // no token, but not limited
  });

  it('logs the limited group, never the client address', () => {
    const limited = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((e) => e.event === 'rate_limited');
    expect(limited.length).toBeGreaterThanOrEqual(3);
    expect(new Set(limited.map((e) => e.group))).toEqual(new Set(['public-tenant', 'operator']));
    expect(lines.join('\n')).not.toContain('127.0.0.1');
  });
});
