import { Logger } from '@nestjs/common';
import { Kysely, PostgresDialect, sql } from 'kysely';
import type { Generated, Transaction } from 'kysely';
import pg from 'pg';
import { z } from 'zod';

import { EXPECTED_PRIVILEGES } from './role-policy.js';
import type { PoolRole } from './role-policy.js';

/**
 * Database access (decisions D-024, D-028, D-035).
 *
 * The single rule that keeps tenants apart in application code: tenant-scoped work runs only
 * through `withTenant()`, which opens a transaction and sets the transaction-local tenant
 * setting as its first statement. Nothing else may call `set_config` or `SET` for
 * `app.tenant_id` (a test scans the source). Session-level settings leak across pooled
 * connections; a transaction-local one cannot.
 */

/** Table types for schema `app` (migrations/0001, 0006). */
export interface Database {
  'app.tenants': {
    id: Generated<string>;
    slug: string;
    display_name: string;
    status: Generated<'active' | 'suspended' | 'retired'>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  'app.memberships': {
    tenant_id: string;
    account_id: string;
    role: Generated<'owner'>;
    status: Generated<'active' | 'revoked'>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
}

export type Db = Kysely<Database>;
export type TenantTransaction = Transaction<Database>;

declare const tenantIdBrand: unique symbol;
/** A tenant id that has been validated as a uuid and resolved server-side (D-027). */
export type TenantId = string & { readonly [tenantIdBrand]: true };

const uuid = z.uuid();

/** Validates a tenant id before it can be used as context. Throws on anything but a uuid. */
export function toTenantId(value: string): TenantId {
  return uuid.parse(value) as TenantId;
}

export type DatabaseOptions = {
  connectionString: string;
  /** Maximum pooled connections (default 10). */
  maxConnections?: number;
  /** Server-side statement timeout in ms (default 10 s). */
  statementTimeoutMs?: number;
};

const logger = new Logger('Database');

/**
 * Creates the pool. Connection failures never crash the process (audit B-01/A-06): an idle
 * connection that dies is reported by the pool's `error` event, a checked-out one by its own
 * client `error` event; without listeners Node would treat either as an unhandled error and
 * exit. Both are logged with the error code only (never the connection string), the broken
 * connection is discarded, and the pool opens a fresh one for the next request.
 */
export function createDatabase(options: DatabaseOptions): Db {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    // Fail fast instead of queueing forever when the database is unreachable.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    // Bounded server-side work (audit A-09): no statement, lock wait or idle transaction can hold
    // a pooled connection (and its tenant transaction) indefinitely.
    statement_timeout: options.statementTimeoutMs ?? 10_000,
    lock_timeout: 5_000,
    idle_in_transaction_session_timeout: 15_000,
  });
  pool.on('error', (error) => {
    logger.warn({ event: 'database_connection_lost', state: 'idle', code: errorCode(error) });
  });
  pool.on('connect', (client) => {
    client.on('error', (error) => {
      logger.warn({ event: 'database_connection_lost', state: 'active', code: errorCode(error) });
    });
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

const CONNECTION_MESSAGES = [
  'Connection terminated',
  'timeout exceeded when trying to connect',
  'Client has encountered a connection error',
  'Cannot use a pool after calling end',
  'connect ECONNREFUSED',
];

/**
 * True for errors meaning "the database is unavailable right now" (connection lost or refused,
 * server shutting down or overloaded, statement or lock timeout, serialization conflict). They
 * map to 503 and are safe to retry for idempotent reads. Constraint and permission errors are
 * NOT unavailability.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = errorCode(error);
  if (code.startsWith('08')) return true; // connection exception class
  if (['57P01', '57P02', '57P03', '53300', '57014', '55P03', '40001', '40P01'].includes(code)) {
    return true;
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code))
    return true;
  return CONNECTION_MESSAGES.some((m) => error.message.includes(m));
}

/**
 * Runs an IDEMPOTENT database read, retrying once after a short pause if the database was
 * momentarily unavailable (a dropped pooled connection is replaced on the retry). Never use this
 * for mutations: their outcome may be unknown after a connection loss (see the operator
 * outcome reconciliation, audit B-02).
 */
export async function withReadRetry<T>(fn: () => Promise<T>, pauseMs = 50): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return fn();
  }
}

/** Readiness probe: the database answers within `timeoutMs`. */
export async function isDatabaseReady(db: Db, timeoutMs = 2_000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const probe = sql`SELECT 1`.execute(db).then(() => true);
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, timeoutMs);
    });
    return await Promise.race([probe, timeout]);
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs `fn` in a transaction whose tenant context is `tenantId`. One tenant per transaction:
 * the context is set once, first, and `fn` receives only the transaction handle.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: TenantId,
  fn: (trx: TenantTransaction) => Promise<T>,
): Promise<T> {
  // Re-validate: the brand is a compile-time aid, not a runtime guarantee.
  const id = toTenantId(tenantId);
  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.tenant_id', ${id}, true)`.execute(trx);
    return fn(trx);
  });
}

export class UnsafeDatabaseRoleError extends Error {
  override name = 'UnsafeDatabaseRoleError';
}

type RoleFacts = {
  is_session_user: boolean;
  superuser: boolean;
  bypassrls: boolean;
  createrole: boolean;
  createdb: boolean;
  replication: boolean;
  member_of: number;
  reachable_roles: number;
  owns_objects: boolean;
  owns_database: boolean;
  db_create: boolean;
  db_temp: boolean;
  schema_create: boolean;
  tenant_setting: string;
  row_security: string;
  preset_settings: boolean;
};

/**
 * Refuses to run with a database role that could defeat row-level security, directly or
 * indirectly (decision D-035, audit A-01/A-07). The check is structural, not a role-name
 * comparison: it inspects the connected role's attributes, every role it can reach through
 * membership (direct or indirect, with or without INHERIT or SET), what it owns, its database
 * and schema privileges, preset session settings, and compares its EFFECTIVE table, sequence
 * and function privileges with the exact allowlist for the pool (`role-policy.ts`).
 *
 * Fail closed: any query error, unexpected privilege or missing privilege refuses startup.
 * The error names the problems, never the role or the connection string.
 */
export async function assertSafeRuntimeRole(db: Db, pool: PoolRole = 'runtime'): Promise<void> {
  const problems = await inspectRuntimeRole(db, pool);
  if (problems.length > 0) {
    throw new UnsafeDatabaseRoleError(
      `the API ${pool} database role is unsafe (${problems.join('; ')}); it must be the restricted ${pool} role`,
    );
  }
}

/** The list of problems found for the connected role (empty = safe). Exported for tests. */
export async function inspectRuntimeRole(db: Db, pool: PoolRole): Promise<string[]> {
  const { rows } = await sql<RoleFacts>`
    SELECT
      current_user = session_user AS is_session_user,
      r.rolsuper AS superuser,
      r.rolbypassrls AS bypassrls,
      r.rolcreaterole AS createrole,
      r.rolcreatedb AS createdb,
      r.rolreplication AS replication,
      (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS member_of,
      (SELECT count(*)::int FROM pg_roles x
        WHERE x.oid <> r.oid AND pg_has_role(r.oid, x.oid, 'MEMBER')) AS reachable_roles,
      (EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid
                 AND c.relnamespace NOT IN (SELECT oid FROM pg_namespace
                                            WHERE nspname IN ('pg_catalog', 'information_schema')
                                               OR nspname LIKE 'pg_toast%' OR nspname LIKE 'pg_temp%'))
       OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.proowner = r.oid
                    AND p.pronamespace NOT IN (SELECT oid FROM pg_namespace
                                               WHERE nspname IN ('pg_catalog', 'information_schema')))
       OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid
                    AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%')
       OR EXISTS (SELECT 1 FROM pg_type t WHERE t.typowner = r.oid
                    AND t.typnamespace NOT IN (SELECT oid FROM pg_namespace
                                               WHERE nspname IN ('pg_catalog', 'information_schema')))
      ) AS owns_objects,
      EXISTS (SELECT 1 FROM pg_database d
              WHERE d.datname = current_database() AND d.datdba = r.oid) AS owns_database,
      has_database_privilege(r.oid, current_database(), 'CREATE') AS db_create,
      has_database_privilege(r.oid, current_database(), 'TEMP') AS db_temp,
      EXISTS (SELECT 1 FROM pg_namespace n
              WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                AND n.nspname NOT LIKE 'pg_%'
                AND has_schema_privilege(r.oid, n.oid, 'CREATE')) AS schema_create,
      coalesce(current_setting('app.tenant_id', true), '') AS tenant_setting,
      current_setting('row_security') AS row_security,
      EXISTS (SELECT 1 FROM pg_db_role_setting s, unnest(s.setconfig) AS c(setting)
              WHERE (s.setrole = r.oid OR s.setrole = 0)
                AND (s.setdatabase = 0
                     OR s.setdatabase = (SELECT oid FROM pg_database
                                         WHERE datname = current_database()))
                AND (c.setting LIKE 'app.%' OR c.setting LIKE 'role=%'
                     OR c.setting LIKE 'session_authorization=%'
                     OR c.setting LIKE 'row_security=%')) AS preset_settings
    FROM pg_roles r WHERE r.oid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  `.execute(db);
  const role = rows[0];
  if (role === undefined) return ['the connected role was not found'];

  const problems: string[] = [];
  const flag = (condition: boolean, problem: string) => {
    if (condition) problems.push(problem);
  };
  flag(
    !role.is_session_user,
    'the connection switched role (current_user differs from session_user)',
  );
  flag(role.superuser, 'is a superuser');
  flag(role.bypassrls, 'has BYPASSRLS');
  flag(role.createrole, 'has CREATEROLE');
  flag(role.createdb, 'has CREATEDB');
  flag(role.replication, 'has REPLICATION');
  flag(role.member_of > 0 || role.reachable_roles > 0, 'is a member of another role');
  flag(role.owns_objects, 'owns database objects');
  flag(role.owns_database, 'owns the database');
  flag(role.db_create, 'may create schemas in the database');
  flag(role.db_temp, 'may create temporary tables');
  flag(role.schema_create, 'may create objects in a schema');
  flag(role.tenant_setting !== '', 'starts with a preset tenant context');
  flag(role.row_security !== 'on', 'row_security is not on');
  flag(role.preset_settings, 'has preset role or database settings that affect security');

  const actual = new Set(await effectivePrivileges(db));
  const expected = new Set(EXPECTED_PRIVILEGES[pool]);
  const unexpected = [...actual].filter((p) => !expected.has(p)).sort();
  const missing = [...expected].filter((p) => !actual.has(p)).sort();
  if (unexpected.length > 0) problems.push(`has unexpected privileges: ${unexpected.join(', ')}`);
  if (missing.length > 0) problems.push(`lacks expected privileges: ${missing.join(', ')}`);
  return problems;
}

/**
 * Every effective privilege the connected role holds on application objects, through any path
 * (direct grant, PUBLIC, membership), as `kind:schema.name:PRIVILEGE` strings.
 */
async function effectivePrivileges(db: Db): Promise<string[]> {
  const { rows } = await sql<{ privilege: string }>`
    WITH me AS (SELECT oid FROM pg_roles WHERE rolname = current_user),
    rels AS (
      SELECT c.oid, n.nspname || '.' || c.relname AS name, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    )
    SELECT 'table:' || r.name || ':' || p.priv AS privilege
    FROM rels r, me,
         unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS p(priv)
    WHERE r.relkind <> 'S' AND has_any_column_privilege(me.oid, r.oid, p.priv)
    UNION ALL
    SELECT 'table:' || r.name || ':' || p.priv
    FROM rels r, me, unnest(ARRAY['DELETE', 'TRUNCATE', 'TRIGGER']) AS p(priv)
    WHERE r.relkind <> 'S' AND has_table_privilege(me.oid, r.oid, p.priv)
    UNION ALL
    SELECT 'sequence:' || r.name || ':' || p.priv
    FROM rels r, me, unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) AS p(priv)
    WHERE r.relkind = 'S' AND has_sequence_privilege(me.oid, r.oid, p.priv)
    UNION ALL
    SELECT 'function:' || n.nspname || '.' || f.proname || ':EXECUTE'
    FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace, me
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%'
      AND has_function_privilege(me.oid, f.oid, 'EXECUTE')
  `.execute(db);
  return rows.map((r) => r.privilege);
}
