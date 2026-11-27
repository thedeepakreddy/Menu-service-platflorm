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
 *   Enforced structurally before anything runs (audit A-05, D-035): the connected role must own
 *   the database, must not be a superuser or have BYPASSRLS/CREATEROLE, and must not have
 *   switched role. A runtime or operator role owns nothing, so it is refused.
 * - History is append-only: a new file that sorts before an already-applied one is refused
 *   (no out-of-order migrations).
 * - A file may not control transactions itself (COMMIT/ROLLBACK/BEGIN/SAVEPOINT/...), nor switch
 *   role or session authorization: each file runs inside the runner's own transaction, and the
 *   runner verifies after the file that this transaction is still the one it opened.
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

/**
 * Removes comments, string literals and dollar-quoted bodies, so that only top-level SQL remains
 * for the transaction-control check (function bodies legitimately contain BEGIN/END).
 */
export function topLevelSql(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith('--')) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      out += ' ';
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar !== null) {
      const end = text.indexOf(dollar[0], i + dollar[0].length);
      i = end === -1 ? text.length : end + dollar[0].length;
      out += ' $body$ ';
      continue;
    }
    const ch = text.charAt(i);
    if (ch === "'" || ch === '"') {
      // E'...' strings treat backslash as an escape (review R2-05: `E'\''` hid a COMMIT).
      const escapes = ch === "'" && i > 0 && /[eE]/.test(text.charAt(i - 1));
      let j = i + 1;
      while (j < text.length) {
        if (escapes && text.charAt(j) === '\\') j += 2;
        else if (text.charAt(j) === ch) {
          if (text.charAt(j + 1) === ch) j += 2;
          else break;
        } else j += 1;
      }
      i = j + 1;
      out += ch === "'" ? " '' " : ' "x" ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const FORBIDDEN_STATEMENT =
  /(^|;)\s*(COMMIT|ROLLBACK|ABORT|BEGIN|START\s+TRANSACTION|END|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION|SET\s+(SESSION\s+|LOCAL\s+)?ROLE|RESET\s+ROLE|SET\s+(SESSION\s+)?SESSION\s+AUTHORIZATION|RESET\s+SESSION\s+AUTHORIZATION)\b/i;

// A role or authorization switch through the settings function (review R2-05), outside comments.
const FORBIDDEN_SETTING = /set_config\s*\(\s*'(role|session_authorization)'/i;

/** Throws if a migration file contains top-level transaction control or a role switch. */
export function assertNoTransactionControl(name: string, text: string): void {
  const sql = topLevelSql(text);
  // set_config takes the setting name as a string literal, which topLevelSql blanks out, so the
  // role-switch check runs on the text with only comments removed.
  const withoutComments = text.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (FORBIDDEN_STATEMENT.test(sql) || FORBIDDEN_SETTING.test(withoutComments)) {
    throw new MigrationError(
      `migration ${name} contains transaction control or a role switch, which is not allowed`,
    );
  }
}

type MigratorFacts = {
  is_session_user: boolean;
  superuser: boolean;
  bypassrls: boolean;
  createrole: boolean;
  owns_database: boolean;
};

/** Refuses to migrate unless connected as the database-owning, unprivileged migration role. */
async function assertMigrationIdentity(client: pg.Client): Promise<void> {
  const { rows } = await client.query<MigratorFacts>(
    `SELECT current_user = session_user AS is_session_user,
            r.rolsuper AS superuser, r.rolbypassrls AS bypassrls, r.rolcreaterole AS createrole,
            EXISTS (SELECT 1 FROM pg_database d
                    WHERE d.datname = current_database() AND d.datdba = r.oid) AS owns_database
     FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const role = rows[0];
  const problems = [
    role === undefined ? 'the connected role was not found' : undefined,
    role?.is_session_user === false ? 'the connection switched role' : undefined,
    role?.superuser === true ? 'is a superuser' : undefined,
    role?.bypassrls === true ? 'has BYPASSRLS' : undefined,
    role?.createrole === true ? 'has CREATEROLE' : undefined,
    role?.owns_database === false ? 'does not own the database' : undefined,
  ].filter((p): p is string => p !== undefined);
  if (problems.length > 0) {
    throw new MigrationError(
      `refusing to migrate: the connected role ${problems.join(', ')}; migrations must run as the migration role`,
    );
  }
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
      assertNoTransactionControl(name, sql);
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

export async function migrate(connectionString: string, dir: string): Promise<MigrationResult> {
  const migrations = await listMigrations(dir);
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await assertMigrationIdentity(client);
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

    // Append-only history: a pending file must sort after every applied one.
    const lastApplied = [...recorded.keys()].sort().at(-1);
    const outOfOrder = migrations.filter(
      (m) => !recorded.has(m.name) && lastApplied !== undefined && m.name < lastApplied,
    );
    if (outOfOrder.length > 0) {
      throw new MigrationError(
        `pending migration(s) sort before an applied one: ${outOfOrder.map((m) => m.name).join(', ')}`,
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
        // A transaction-local marker: if the file somehow ended the runner's transaction, the
        // marker is gone afterwards and the runner refuses to record the migration.
        await client.query("SELECT set_config('migrations.guard', $1, true)", [migration.name]);
        await client.query(migration.sql);
        const guard = await client.query<{ guard: string | null; role_ok: boolean }>(
          `SELECT current_setting('migrations.guard', true) AS guard,
                  current_user = session_user AS role_ok`,
        );
        const check = guard.rows[0];
        if (check?.guard !== migration.name) {
          throw new MigrationError(`migration ${migration.name} ended the runner's transaction`);
        }
        if (!check.role_ok) {
          throw new MigrationError(`migration ${migration.name} left a switched role behind`);
        }
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
