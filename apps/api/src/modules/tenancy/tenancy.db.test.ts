// Public tenant resolution against real PostgreSQL (Phase 2 M2.2; D-027). Exercises the HTTP
// stack, the SECURITY DEFINER resolver and the runtime role together.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { errorEnvelopeSchema, publicTenantSchema } from '@platform/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createApp } from '../../create-app.js';
import { createDatabase } from '../../infrastructure/database/database.js';
import type { Db } from '../../infrastructure/database/database.js';

const { adminUrl, runtimeUrl, operatorUrl } = inject('database');

// Unique to this file: the database is shared by every db test file.
const ACTIVE_ID = '2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a';
const TENANTS = [
  [ACTIVE_ID, 'resolve-active', 'Café Active', 'active'],
  ['2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b', 'resolve-suspended', 'Suspended Bar', 'suspended'],
  ['2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c', 'resolve-retired', 'Retired Bakery', 'retired'],
] as const;

let app: INestApplication;
let db: Db;
let base: string;

beforeAll(async () => {
  const owner = new pg.Client({ connectionString: adminUrl });
  await owner.connect();
  for (const [id, slug, name, status] of TENANTS) {
    await owner.query(
      'INSERT INTO app.tenants (id, slug, display_name, status) VALUES ($1, $2, $3, $4)',
      [id, slug, name, status],
    );
  }
  await owner.end();
  db = createDatabase({ connectionString: runtimeUrl, maxConnections: 4 });
  app = await createApp({ logger: false, database: db });
  await app.listen(0, '127.0.0.1');
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  base = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  await app.close(); // also destroys the pool (DatabaseModule shutdown hook)
});

describe('GET /public/tenants/:slug (D-027)', () => {
  it('returns the public fields of an active tenant, and never its internal id', async () => {
    const res = await fetch(`${base}/public/tenants/resolve-active`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(publicTenantSchema.parse(JSON.parse(text))).toEqual({
      slug: 'resolve-active',
      displayName: 'Café Active',
    });
    expect(text).not.toContain(ACTIVE_ID);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['a suspended tenant', 'resolve-suspended'],
    ['a retired tenant', 'resolve-retired'],
    ['an unknown slug', 'no-such-tenant'],
    ['a malformed slug', 'Resolve-Active'],
    ['a reserved slug', 'admin'],
    ['an injection attempt', "resolve-active'%20OR%20'1'='1"],
    ['an encoded traversal', '..%2Fresolve-active'],
    ['an over-long slug', 'a'.repeat(300)],
  ])('answers %s with the same 404 envelope', async (_label, slug) => {
    const res = await fetch(`${base}/public/tenants/${slug}`);
    expect(res.status).toBe(404);
    const body = errorEnvelopeSchema.parse(await res.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('The requested resource was not found.');
  });
});

describe('the resolver function (D-027, D-028)', () => {
  it('pins search_path and runs as SECURITY DEFINER', async () => {
    const owner = new pg.Client({ connectionString: adminUrl });
    await owner.connect();
    const { rows } = await owner.query<{ secdef: boolean; config: string[] | null }>(`
      SELECT p.prosecdef AS secdef, p.proconfig AS config
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'resolve_active_tenant'`);
    await owner.end();
    expect(rows).toEqual([{ secdef: true, config: ['search_path=pg_catalog, pg_temp'] }]);
  });

  it('returns at most one row and never non-active tenants, even when called directly', async () => {
    const runtime = new pg.Client({ connectionString: runtimeUrl });
    await runtime.connect();
    try {
      const all = await runtime.query("SELECT * FROM app.resolve_active_tenant('%')");
      const suspended = await runtime.query(
        "SELECT * FROM app.resolve_active_tenant('resolve-suspended')",
      );
      expect([all.rowCount, suspended.rowCount]).toEqual([0, 0]);
    } finally {
      await runtime.end();
    }
  });

  it('cannot be executed by the operator role', async () => {
    const operator = new pg.Client({ connectionString: operatorUrl });
    await operator.connect();
    try {
      await expect(
        operator.query("SELECT * FROM app.resolve_active_tenant('resolve-active')"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await operator.end();
    }
  });

  it('does not widen what the runtime role can read directly', async () => {
    const rows = await db.selectFrom('app.tenants').select('slug').execute();
    expect(rows).toEqual([]); // no tenant context: still nothing
  });
});
