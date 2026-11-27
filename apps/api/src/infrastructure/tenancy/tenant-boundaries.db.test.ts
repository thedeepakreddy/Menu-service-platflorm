// Tenant-safe cache and job boundaries (Doc 05 §13 Phase 2; D-027), against real PostgreSQL.
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { seedTenant } from '../../../test/db/fixtures.js';
import { createDatabase, toTenantId } from '../database/database.js';
import type { Db } from '../database/database.js';
import { runTenantJob, tenantCacheKey, TenantJobRejectedError } from './tenant-boundaries.js';

const { adminUrl, runtimeUrl } = inject('database');
let db: Db;
let a: { tenantId: string; slug: string };
let b: { tenantId: string; slug: string };

beforeAll(async () => {
  db = createDatabase({ connectionString: runtimeUrl, maxConnections: 4 });
  a = await seedTenant(adminUrl);
  b = await seedTenant(adminUrl);
});

afterAll(async () => {
  await db.destroy();
});

describe('tenantCacheKey', () => {
  it('namespaces every key by tenant, so tenants never share an entry', () => {
    const ka = tenantCacheKey(toTenantId(a.tenantId), 'menu', 'v1');
    const kb = tenantCacheKey(toTenantId(b.tenantId), 'menu', 'v1');
    expect(ka).not.toBe(kb);
    expect(ka.startsWith(`tenant:${a.tenantId}|`)).toBe(true);
  });

  it('refuses a malformed tenant id and ambiguous parts', () => {
    expect(() => tenantCacheKey('not-a-uuid' as never, 'x')).toThrow();
    expect(() => tenantCacheKey(toTenantId(a.tenantId))).toThrow(RangeError);
    expect(() => tenantCacheKey(toTenantId(a.tenantId), 'a|b')).toThrow(RangeError);
    expect(() => tenantCacheKey(toTenantId(a.tenantId), '')).toThrow(RangeError);
  });
});

describe('runTenantJob', () => {
  it('runs the handler inside its own tenant only', async () => {
    const seen = await runTenantJob(
      db,
      { tenantId: a.tenantId, type: 'test.job', payload: {} },
      async (_job, trx) =>
        (await sql<{ slug: string }>`SELECT slug FROM app.tenants`.execute(trx)).rows,
    );
    expect(seen).toEqual([{ slug: a.slug }]);
  });

  it.each([
    ['no tenant', { type: 'test.job', payload: {} }],
    ['a malformed tenant', { tenantId: "x' OR '1'='1", type: 'test.job', payload: {} }],
    [
      'an extra field',
      { tenantId: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a', type: 't', payload: {}, x: 1 },
    ],
    ['not an object', 'job'],
  ])('refuses a job with %s before any work', async (_name, raw) => {
    let ran = false;
    await expect(
      runTenantJob(db, raw, () => {
        ran = true;
        return Promise.resolve();
      }),
    ).rejects.toBeInstanceOf(TenantJobRejectedError);
    expect(ran).toBe(false);
  });
});
