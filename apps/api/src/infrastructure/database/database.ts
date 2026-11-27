import { Kysely, PostgresDialect, sql } from 'kysely';
import type { Generated, Transaction } from 'kysely';
import pg from 'pg';
import { z } from 'zod';

/**
 * Database access (decisions D-024, D-028).
 *
 * The single rule that keeps tenants apart in application code: tenant-scoped work runs only
 * through `withTenant()`, which opens a transaction and sets the transaction-local tenant
 * setting as its first statement. Nothing else may call `set_config` or `SET` for
 * `app.tenant_id` (a test scans the source). Session-level settings leak across pooled
 * connections; a transaction-local one cannot.
 */

/** Table types for schema `app` (migrations/0001_tenancy_foundation.sql). */
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
};

export function createDatabase(options: DatabaseOptions): Db {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    // Fail fast instead of queueing forever when the database is unreachable.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
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

/**
 * Refuses to run the API with a database role that would silently defeat row-level security:
 * a superuser, a role with BYPASSRLS, or a role that owns tables in schema `app` (D-028).
 * Called at startup. The error names the problem, never the role or the connection string.
 */
export async function assertSafeRuntimeRole(db: Db): Promise<void> {
  const { rows } = await sql<{ superuser: boolean; bypassrls: boolean; owns_tables: boolean }>`
    SELECT r.rolsuper AS superuser,
           r.rolbypassrls AS bypassrls,
           EXISTS (SELECT 1 FROM pg_tables t
                   WHERE t.schemaname = 'app' AND t.tableowner = current_user) AS owns_tables
    FROM pg_roles r WHERE r.rolname = current_user
  `.execute(db);
  const role = rows[0];
  if (role === undefined) throw new UnsafeDatabaseRoleError('database role not found');
  const problems = [
    role.superuser ? 'is a superuser' : undefined,
    role.bypassrls ? 'has BYPASSRLS' : undefined,
    role.owns_tables ? 'owns application tables' : undefined,
  ].filter((p): p is string => p !== undefined);
  if (problems.length > 0) {
    throw new UnsafeDatabaseRoleError(
      `the API database role ${problems.join(', ')}; it must be the restricted runtime role`,
    );
  }
}
