// Database connection failure and recovery (audit B-01/A-06). Before the fix, terminating a pooled
// backend crashed the API process (`Unhandled 'error' event … 57P01`). These tests run the BUILT
// API (`dist/main.js`, as in production) and an in-process pool, kill backends while idle and
// mid-query, and prove: the process stays alive, the failed request gets a 503 envelope, readiness
// reports the outage, and the next request succeeds on a fresh connection.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { adminQuery, seedTenant } from '../test/db/fixtures.js';
import {
  createDatabase,
  isDatabaseUnavailable,
  withReadRetry,
} from './infrastructure/database/database.js';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const { adminUrl, runtimeUrl, operatorUrl } = inject('database');

/** Terminates every backend of a role (the database "drops" its connections). */
async function killBackends(role: string): Promise<number> {
  const { rows } = await adminQuery<{ n: number }>(
    adminUrl,
    `SELECT count(pg_terminate_backend(pid))::int AS n FROM pg_stat_activity
     WHERE usename = $1 AND pid <> pg_backend_pid()`,
    [role],
  );
  return rows[0]?.n ?? 0;
}

describe('in-process pool (B-01)', () => {
  it('survives an idle connection being terminated, and reconnects', async () => {
    const db = createDatabase({ connectionString: runtimeUrl, maxConnections: 2 });
    try {
      await sql`SELECT 1`.execute(db);
      expect(await killBackends('app_runtime')).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 200)); // the idle client's error event fires here
      const { rows } = await sql<{ ok: number }>`SELECT 1 AS ok`.execute(db);
      expect(rows).toEqual([{ ok: 1 }]);
    } finally {
      await db.destroy();
    }
  });

  it('a query whose connection is terminated mid-flight fails as "unavailable"; a retry succeeds', async () => {
    const db = createDatabase({ connectionString: runtimeUrl, maxConnections: 1 });
    try {
      // Handlers are attached immediately, so the rejection is never "unhandled".
      const slow = sql`SELECT pg_sleep(5)`.execute(db).then(
        () => undefined,
        (e: unknown) => e,
      );
      await new Promise((r) => setTimeout(r, 300));
      await killBackends('app_runtime');
      const error = await slow;
      expect(isDatabaseUnavailable(error)).toBe(true);
      let calls = 0;
      const value = await withReadRetry(async () => {
        calls += 1;
        if (calls === 1) {
          const pending = sql`SELECT pg_sleep(5)`.execute(db).then(
            () => undefined,
            (e: unknown) => e,
          );
          await new Promise((r) => setTimeout(r, 300));
          await killBackends('app_runtime');
          const failure = await pending;
          if (failure !== undefined) throw failure;
        }
        return (await sql<{ ok: number }>`SELECT 1 AS ok`.execute(db)).rows[0]?.ok;
      });
      expect([calls, value]).toEqual([2, 1]);
    } finally {
      await db.destroy();
    }
  });

  it('isDatabaseUnavailable never classifies constraint or permission errors as outages', async () => {
    const db = createDatabase({ connectionString: runtimeUrl, maxConnections: 1 });
    try {
      const denied = await sql`SELECT * FROM app.accounts`.execute(db).catch((e: unknown) => e);
      expect(isDatabaseUnavailable(denied)).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});

describe('the built API process (B-01)', () => {
  let child: ChildProcess;
  let base: string;
  let exited: number | null = null;
  let stderr = '';
  let tenantSlug: string;

  beforeAll(async () => {
    tenantSlug = (await seedTenant(adminUrl)).slug;
    const port = String(20_000 + Math.floor(Math.random() * 20_000));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['dist/main.js'], {
      cwd: apiRoot,
      env: {
        PATH: process.env.PATH ?? '',
        APP_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: port,
        API_DATABASE_URL: runtimeUrl,
        API_OPERATOR_DATABASE_URL: operatorUrl,
        API_LOG_LEVEL: 'warn',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('exit', (code) => (exited = code ?? -1));
    for (let i = 0; i < 100; i += 1) {
      const ok = await fetch(`${base}/health`).then(
        (r) => r.ok,
        () => false,
      );
      if (ok) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`API did not start: ${stderr}`);
  });

  afterAll(() => {
    child.kill('SIGTERM');
  });

  it('keeps serving after every database connection is terminated', async () => {
    expect((await fetch(`${base}/public/tenants/${tenantSlug}`)).status).toBe(200);
    expect(await killBackends('app_runtime')).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(exited).toBeNull(); // before the fix: exit code 1
    const after = await fetch(`${base}/public/tenants/${tenantSlug}`);
    expect(after.status).toBe(200); // a fresh connection (or the bounded retry) served it
    expect((await fetch(`${base}/health/ready`)).status).toBe(200);
  });

  it('answers 503 (not 500, not a crash) while a request loses its connection, then recovers', async () => {
    // Hold every pooled connection busy, then kill them, so in-flight requests fail.
    const inflight = Array.from({ length: 12 }, () =>
      fetch(`${base}/public/tenants/${tenantSlug}`).then((r) => r.status),
    );
    await killBackends('app_runtime');
    const statuses = await Promise.all(inflight);
    expect(statuses.every((s) => s === 200 || s === 503)).toBe(true);
    expect(exited).toBeNull();
    await new Promise((r) => setTimeout(r, 200));
    expect((await fetch(`${base}/public/tenants/${tenantSlug}`)).status).toBe(200);
    expect(stderr).not.toContain('Unhandled');
    expect(stderr).not.toContain('synthetic-runtime-password');
  });
});

describe('readiness while the database is unreachable', () => {
  it('reports 503 on /health/ready and 503 envelopes, while /health stays 200', async () => {
    const port = String(20_000 + Math.floor(Math.random() * 20_000));
    const closed = new URL(runtimeUrl);
    closed.port = '1'; // nothing listens there
    // The startup check needs a database, so use the in-process app factory instead.
    const { createApp } = await import('./create-app.js');
    const db = createDatabase({ connectionString: closed.toString(), maxConnections: 1 });
    const app = await createApp({ logger: false, database: db });
    await app.listen(Number(port), '127.0.0.1');
    try {
      const url = `http://127.0.0.1:${port}`;
      expect((await fetch(`${url}/health`)).status).toBe(200);
      expect((await fetch(`${url}/health/ready`)).status).toBe(503);
      const res = await fetch(`${url}/public/tenants/some-tenant`);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
    } finally {
      await app.close();
    }
  });
});
