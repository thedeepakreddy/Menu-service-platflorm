// Real-PostgreSQL tenant-isolation tests (Phase 2 M2.1; decisions D-024, D-028; Doc 05 §9).
// Every assertion runs against a freshly provisioned, migrated database as the real roles.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { createDatabase, toTenantId, withTenant } from './database.js';
import type { Db, TenantId } from './database.js';
import { migrate, MigrationError } from './migrate.js';

const { adminUrl, ownerUrl, runtimeUrl } = inject('database');
const migrationsDir = inject('migrationsDir');

// Synthetic tenants and accounts (valid v4 uuids).
const TENANT_A = toTenantId('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
const TENANT_B = toTenantId('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
const ACCOUNT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const ACCOUNT_B = '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b';

let db: Db;
/** Cluster superuser on the throwaway test database: seeding and inspection only. */
let owner: pg.Client;

beforeAll(async () => {
  owner = new pg.Client({ connectionString: adminUrl });
  await owner.connect();
  // Seed as the test cluster's superuser: since migration 0005 no application role, not even the
  // migration role, can write tenant rows directly (D-035).
  await owner.query(`
    INSERT INTO app.tenants (id, slug, display_name) VALUES
      ('${TENANT_A}', 'tenant-a', 'Tenant A'), ('${TENANT_B}', 'tenant-b', 'Tenant B');
    INSERT INTO app.accounts (id, issuer, subject, kind) VALUES
      ('${ACCOUNT_A}', 'https://idp.test', 'owner-a', 'owner'),
      ('${ACCOUNT_B}', 'https://idp.test', 'owner-b', 'owner');
    INSERT INTO app.memberships (tenant_id, account_id) VALUES
      ('${TENANT_A}', '${ACCOUNT_A}'), ('${TENANT_B}', '${ACCOUNT_B}');
  `);
  // Test-only probe table with the production policy pattern and runtime DML grants, so that the
  // write paths of withTenant() and WITH CHECK are exercised. Never created by migrations.
  await owner.query(`
    CREATE SCHEMA app_test;
    GRANT USAGE ON SCHEMA app_test TO app_runtime;
    CREATE TABLE app_test.notes (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES app.tenants (id),
      body text NOT NULL
    );
    ALTER TABLE app_test.notes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE app_test.notes FORCE ROW LEVEL SECURITY;
    CREATE POLICY notes_isolation ON app_test.notes FOR ALL TO app_runtime
      USING (tenant_id = (SELECT app.current_tenant_id()))
      WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
    GRANT SELECT, INSERT, UPDATE, DELETE ON app_test.notes TO app_runtime;
    INSERT INTO app_test.notes (tenant_id, body) VALUES
      ('${TENANT_A}', 'a1'), ('${TENANT_A}', 'a2'), ('${TENANT_B}', 'b1');
  `);
  db = createDatabase({ connectionString: runtimeUrl, maxConnections: 10 });
});

afterAll(async () => {
  await db.destroy();
  // The probe schema grants the runtime extra privileges; remove it so later files (which run
  // the exact-privilege startup check) see the real schema only.
  await owner.query('DROP SCHEMA app_test CASCADE');
  await owner.end();
});

const notes = (trx: Parameters<Parameters<typeof withTenant>[2]>[0]) =>
  sql<{ tenant_id: string; body: string }>`SELECT tenant_id, body FROM app_test.notes`.execute(trx);

describe('migrations (D-024)', () => {
  it('are idempotent: a second run applies nothing', async () => {
    const result = await migrate(ownerUrl, migrationsDir);
    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied.length).toBeGreaterThan(0);
  });

  it('refuse to run when an applied migration was modified', async () => {
    const first = readdirSync(migrationsDir).find((f) => f.endsWith('.sql')) ?? '';
    await owner.query("UPDATE migrations.applied SET checksum = 'tampered' WHERE name = $1", [
      first,
    ]);
    try {
      await expect(migrate(ownerUrl, migrationsDir)).rejects.toBeInstanceOf(MigrationError);
    } finally {
      const { createHash } = await import('node:crypto');
      const checksum = createHash('sha256')
        .update(readFileSync(join(migrationsDir, first), 'utf8'))
        .digest('hex');
      await owner.query('UPDATE migrations.applied SET checksum = $1 WHERE name = $2', [
        checksum,
        first,
      ]);
    }
  });

  it('cannot be run by the runtime role', async () => {
    await expect(migrate(runtimeUrl, migrationsDir)).rejects.toThrow();
  });
});

describe('tenant isolation through withTenant() (D-028)', () => {
  it('tenant A sees only its own rows', async () => {
    const result = await withTenant(db, TENANT_A, async (trx) => ({
      notes: (await notes(trx)).rows,
      tenants: (await sql<{ slug: string }>`SELECT slug FROM app.tenants`.execute(trx)).rows,
      memberships: (
        await sql<{ account_id: string }>`SELECT account_id FROM app.memberships`.execute(trx)
      ).rows,
    }));
    expect(result.notes.map((n) => n.body).sort()).toEqual(['a1', 'a2']);
    expect(result.tenants).toEqual([{ slug: 'tenant-a' }]);
    expect(result.memberships).toEqual([{ account_id: ACCOUNT_A }]);
  });

  it("tenant A cannot read, change or delete tenant B's rows", async () => {
    const counts = await withTenant(db, TENANT_A, async (trx) => {
      const read = await sql`SELECT 1 FROM app_test.notes WHERE tenant_id = ${TENANT_B}`.execute(
        trx,
      );
      const updated =
        await sql`UPDATE app_test.notes SET body = 'x' WHERE tenant_id = ${TENANT_B}`.execute(trx);
      const deleted = await sql`DELETE FROM app_test.notes WHERE tenant_id = ${TENANT_B}`.execute(
        trx,
      );
      return [read.rows.length, Number(updated.numAffectedRows), Number(deleted.numAffectedRows)];
    });
    expect(counts).toEqual([0, 0, 0]);
    const b = await owner.query('SELECT body FROM app_test.notes WHERE tenant_id = $1', [TENANT_B]);
    expect(b.rows).toEqual([{ body: 'b1' }]);
  });

  it('tenant A cannot write a row into tenant B or move a row there', async () => {
    await expect(
      withTenant(db, TENANT_A, (trx) =>
        sql`INSERT INTO app_test.notes (tenant_id, body) VALUES (${TENANT_B}, 'evil')`.execute(trx),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withTenant(db, TENANT_A, (trx) =>
        sql`UPDATE app_test.notes SET tenant_id = ${TENANT_B} WHERE body = 'a1'`.execute(trx),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('writes within the tenant succeed and are visible only to it', async () => {
    await withTenant(db, TENANT_B, (trx) =>
      sql`INSERT INTO app_test.notes (tenant_id, body) VALUES (${TENANT_B}, 'b2')`.execute(trx),
    );
    const a = await withTenant(db, TENANT_A, notes);
    expect(a.rows.map((n) => n.body)).not.toContain('b2');
    const b = await withTenant(db, TENANT_B, notes);
    expect(b.rows.map((n) => n.body).sort()).toEqual(['b1', 'b2']);
  });
});

describe('fail closed without tenant context (D-028)', () => {
  it('no context: reads return nothing and writes are rejected', async () => {
    const read = await sql`SELECT * FROM app_test.notes`.execute(db);
    const members = await sql`SELECT * FROM app.memberships`.execute(db);
    const tenants = await sql`SELECT * FROM app.tenants`.execute(db);
    expect([read.rows.length, members.rows.length, tenants.rows.length]).toEqual([0, 0, 0]);
    await expect(
      sql`INSERT INTO app_test.notes (tenant_id, body) VALUES (${TENANT_A}, 'x')`.execute(db),
    ).rejects.toThrow(/row-level security/);
  });

  it('an empty context sees nothing', async () => {
    const rows = await db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', '', true)`.execute(trx);
      return (await notes(trx)).rows;
    });
    expect(rows).toEqual([]);
  });

  it('withTenant() rejects a malformed tenant id before any SQL runs', async () => {
    await expect(withTenant(db, 'not-a-uuid' as TenantId, notes)).rejects.toThrow();
    expect(() => toTenantId("x' OR '1'='1")).toThrow();
  });
});

describe('pooled connections never carry context over (D-028)', () => {
  it('after commit and after rollback, the same backend has no tenant context', async () => {
    const single = createDatabase({ connectionString: runtimeUrl, maxConnections: 1 });
    try {
      const pid = async () =>
        (await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(single)).rows[0]?.pid;
      const before = await pid();
      await withTenant(single, TENANT_A, notes);
      const afterCommit = await sql`SELECT * FROM app_test.notes`.execute(single);
      await expect(
        withTenant(single, TENANT_A, async (trx) => {
          // Context is live inside the transaction, then the transaction rolls back.
          expect((await notes(trx)).rows.length).toBeGreaterThan(0);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      const afterRollback = await sql`SELECT * FROM app_test.notes`.execute(single);
      expect(await pid()).toBe(before); // genuinely the same physical connection
      expect([afterCommit.rows.length, afterRollback.rows.length]).toEqual([0, 0]);
    } finally {
      await single.destroy();
    }
  });

  it('200 concurrent transactions over 10 connections never see another tenant', async () => {
    const tenants = [TENANT_A, TENANT_B];
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) => {
        const tenant = tenants[i % 2] ?? TENANT_A;
        return withTenant(db, tenant, async (trx) => {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          const { rows } = await notes(trx);
          return rows.filter((row) => row.tenant_id !== tenant).length;
        });
      }),
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('tenant context is set only by withTenant() (D-028)', () => {
  it('no other API source file sets app.tenant_id or uses session-level SET', () => {
    const root = join(import.meta.dirname, '..', '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(5);
    // Audit A-08: match the bare function name (comments or quotes between the name and the
    // parenthesis must not evade the scan), session-level SET of any app.* setting, and role
    // switches. Only database.ts (withTenant) and migrate.ts (its own guard setting) may call
    // set_config at all.
    const allowed = new Map([
      [
        join('infrastructure', 'database', 'database.ts'),
        /set_config\('app\.tenant_id', \$\{id\}, true\)/g,
      ],
      [
        join('infrastructure', 'database', 'migrate.ts'),
        /set_config\('migrations\.guard', \$1, true\)/g,
      ],
    ]);
    const offenders = files.filter((file) => {
      let text = readFileSync(file, 'utf8');
      for (const [suffix, pattern] of allowed) {
        if (file.endsWith(suffix)) text = text.replace(pattern, '');
      }
      // Documentation comments may name the function; code may not call it.
      text = text.replace(/^\s*(\*|\/\/).*$/gm, '');
      return /set_config|\bSET\s+(LOCAL\s+|SESSION\s+)?(app\.|ROLE\b|SESSION\s+AUTHORIZATION)/i.test(
        text,
      );
    });
    expect(offenders).toEqual([]);
    // And database.ts itself uses only the transaction-local form.
    const helper = readFileSync(join(root, 'infrastructure', 'database', 'database.ts'), 'utf8');
    expect(helper).toMatch(/set_config\('app\.tenant_id', \$\{id\}, true\)/);
    expect(helper).not.toMatch(/set_config\([^)]*false\)/);
  });
});
