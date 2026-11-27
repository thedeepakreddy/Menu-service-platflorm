import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import pg from 'pg';

/**
 * Forward-only SQL migration runner (decision D-024).
 *
 * - Applies `NNNN_name.sql` files from a directory in lexical order, each in its own transaction,
 *   recording name and SHA-256 checksum in `migrations.applied`.
 * - An applied file whose content changed is an error (history is never rewritten; fix forward).
 * - A session advisory lock serialises concurrent runners.
 * - Must run as the migration role (`app_owner`), never as the API runtime role (D-028, D-029).
 *
 * This module has no relative imports so that tooling can load it directly (Node type stripping).
 */

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
/** Arbitrary constant key for pg_advisory_lock; unique to this application. */
const LOCK_KEY = 4_202_611_270;

export type MigrationResult = { applied: string[]; alreadyApplied: string[] };

export class MigrationError extends Error {
  override name = 'MigrationError';
}

async function listMigrations(
  dir: string,
): Promise<{ name: string; sql: string; checksum: string }[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const invalid = names.filter((name) => !MIGRATION_FILE.test(name));
  if (invalid.length > 0) {
    throw new MigrationError(`invalid migration file name(s): ${invalid.join(', ')}`);
  }
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(dir, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

export async function migrate(connectionString: string, dir: string): Promise<MigrationResult> {
  const migrations = await listMigrations(dir);
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('CREATE SCHEMA IF NOT EXISTS migrations');
    await client.query(
      `CREATE TABLE IF NOT EXISTS migrations.applied (
         name       text        PRIMARY KEY,
         checksum   text        NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM migrations.applied',
    );
    const recorded = new Map(rows.map((row) => [row.name, row.checksum]));
    const known = new Set(migrations.map((m) => m.name));
    const unknown = [...recorded.keys()].filter((name) => !known.has(name));
    if (unknown.length > 0) {
      throw new MigrationError(
        `database has migrations this build does not: ${unknown.join(', ')}`,
      );
    }

    const result: MigrationResult = { applied: [], alreadyApplied: [] };
    for (const migration of migrations) {
      const checksum = recorded.get(migration.name);
      if (checksum !== undefined) {
        if (checksum !== migration.checksum) {
          throw new MigrationError(`applied migration ${migration.name} has been modified`);
        }
        result.alreadyApplied.push(migration.name);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO migrations.applied (name, checksum) VALUES ($1, $2)', [
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new MigrationError(`migration ${migration.name} failed`, { cause: error });
      }
      result.applied.push(migration.name);
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}
