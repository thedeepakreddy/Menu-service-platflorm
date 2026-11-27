// Migration runner identity and history rules (D-024, D-035; audit A-05). Each case reproduces the
// audit's experiment against the real, migrated test database.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, inject, it } from 'vitest';

import { adminQuery } from '../../../test/db/fixtures.js';
import { assertNoTransactionControl, migrate, MigrationError, topLevelSql } from './migrate.js';

const { adminUrl, ownerUrl, runtimeUrl, operatorUrl } = inject('database');
const migrationsDir = inject('migrationsDir');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A copy of the real migrations plus extra files. */
function withExtra(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  dirs.push(dir);
  cpSync(migrationsDir, dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('migration identity (audit A-05)', () => {
  it.each([
    ['a superuser', () => adminUrl, /is a superuser/],
    ['the runtime role', () => runtimeUrl, /does not own the database/],
    ['the operator role', () => operatorUrl, /does not own the database/],
  ])('refuses to run as %s, before running any SQL', async (_name, url, reason) => {
    const dir = withExtra({ '9999_probe.sql': 'CREATE TABLE app.should_not_exist (id int);' });
    await expect(migrate(url(), dir)).rejects.toThrow(reason);
    const { rowCount } = await adminQuery(
      adminUrl,
      "SELECT 1 FROM pg_tables WHERE tablename = 'should_not_exist'",
    );
    expect(rowCount).toBe(0);
  });

  it('runs as the migration role (idempotently)', async () => {
    const result = await migrate(ownerUrl, migrationsDir);
    expect(result.applied).toEqual([]);
  });
});

describe('append-only history (audit A-05)', () => {
  it('refuses a new migration that sorts before an applied one', async () => {
    const dir = withExtra({ '0002_zz_late.sql': 'CREATE TABLE app.late (id int);' });
    await expect(migrate(ownerUrl, dir)).rejects.toThrow(/sort before an applied one/);
    const { rowCount } = await adminQuery(
      adminUrl,
      "SELECT 1 FROM pg_tables WHERE tablename = 'late'",
    );
    expect(rowCount).toBe(0);
  });
});

describe('no transaction control inside a migration (audit A-05)', () => {
  it.each([
    ['COMMIT', 'CREATE TABLE app.half_applied (id int); COMMIT; SELECT 1/0;'],
    ['ROLLBACK', 'ROLLBACK;'],
    ['BEGIN', 'BEGIN; SELECT 1;'],
    ['START TRANSACTION', 'start transaction;'],
    ['SAVEPOINT', 'SAVEPOINT s1;'],
    ['SET ROLE', 'SET ROLE app_definer;'],
    ['SET SESSION AUTHORIZATION', 'SET SESSION AUTHORIZATION app_definer;'],
  ])('refuses a file containing %s and applies nothing', async (_name, text) => {
    const dir = withExtra({ '9998_bad.sql': text });
    await expect(migrate(ownerUrl, dir)).rejects.toBeInstanceOf(MigrationError);
    const { rowCount } = await adminQuery(
      adminUrl,
      "SELECT 1 FROM pg_tables WHERE tablename = 'half_applied'",
    );
    expect(rowCount).toBe(0);
  });

  it('allows BEGIN/END inside function bodies, strings and comments', () => {
    const body = `-- COMMIT in a comment
      /* ROLLBACK in a block comment */
      CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN NULL; END $fn$;
      SELECT 'COMMIT; BEGIN';`;
    expect(() => {
      assertNoTransactionControl('x.sql', body);
    }).not.toThrow();
    expect(topLevelSql(body)).not.toMatch(/COMMIT|BEGIN|ROLLBACK/);
  });

  it('the real migrations pass the check', async () => {
    const result = await migrate(ownerUrl, migrationsDir);
    expect(result.alreadyApplied.length).toBeGreaterThanOrEqual(6);
  });
});
