// Test and CI database provisioning (decisions D-028, D-029). NOT production tooling.
//
// Creates the three application roles on a throwaway, loopback-only PostgreSQL cluster, creates a
// fresh database owned by app_owner, and applies the real migrations as app_owner. It drops and
// recreates the target database, so it is guarded: the admin URL must point at a loopback host,
// and the database name must start with `platform_test` or `platform_e2e`.
//
// Passwords here are fixed SYNTHETIC values for throwaway local clusters. They are not secrets and
// must never be used anywhere else; production roles are provisioned by the environment (D-029).
//
// Only erasable TypeScript syntax and `.ts` imports, so Node 24 can run it directly
// (`node apps/api/test/db/provision-cli.ts`).
import pg from 'pg';

import { migrate } from '../../src/infrastructure/database/migrate.ts';

export const SYNTHETIC_PASSWORDS = {
  app_owner: 'synthetic-owner-password-not-a-secret',
  app_runtime: 'synthetic-runtime-password-not-a-secret',
  app_operator: 'synthetic-operator-password-not-a-secret',
} as const;

type RoleName = keyof typeof SYNTHETIC_PASSWORDS;

const ROLE_ATTRIBUTES: Record<RoleName, string> = {
  // The migration identity: owns the database and schema; not a superuser; no BYPASSRLS.
  app_owner: 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  // The only role the API uses (D-028).
  app_runtime: 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',
  // Platform operator path; reaches data only through audited SECURITY DEFINER functions.
  app_operator: 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',
};

const DEFINER_ATTRIBUTES =
  'NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION';

export type ProvisionedDatabase = {
  database: string;
  /** Superuser URL for this database: test seeding only (bypasses RLS, like a restore would). */
  adminUrl: string;
  ownerUrl: string;
  runtimeUrl: string;
  operatorUrl: string;
};

const DATABASE_NAME = /^platform_(test|e2e)[a-z0-9_]{0,40}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function urlFor(adminUrl: URL, role: RoleName, database: string): string {
  const url = new URL(adminUrl.toString());
  url.username = role;
  url.password = SYNTHETIC_PASSWORDS[role];
  url.pathname = `/${database}`;
  return url.toString();
}

export async function provisionDatabase(
  adminConnectionString: string,
  database: string,
  migrationsDir: string,
): Promise<ProvisionedDatabase> {
  const adminUrl = new URL(adminConnectionString);
  if (!LOOPBACK.has(adminUrl.hostname)) {
    throw new Error('refusing to provision: the admin database URL must point at a loopback host');
  }
  if (!DATABASE_NAME.test(database)) {
    throw new Error(
      'refusing to provision: database name must start with platform_test or platform_e2e',
    );
  }

  const admin = new pg.Client({ connectionString: adminConnectionString });
  await admin.connect();
  try {
    for (const role of Object.keys(ROLE_ATTRIBUTES) as RoleName[]) {
      const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const verb = exists.rowCount === 0 ? 'CREATE' : 'ALTER';
      await admin.query(
        `${verb} ROLE ${role} ${ROLE_ATTRIBUTES[role]} PASSWORD ${admin.escapeLiteral(SYNTHETIC_PASSWORDS[role])}`,
      );
    }
    // The definer role (D-035): owns every SECURITY DEFINER function and holds the only
    // cross-tenant policies. It can never log in, and only the migration role may SET ROLE to it
    // (needed to hand function ownership over); nobody inherits its privileges.
    const definer = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'app_definer'");
    await admin.query(
      `${definer.rowCount === 0 ? 'CREATE' : 'ALTER'} ROLE app_definer ${DEFINER_ATTRIBUTES}`,
    );
    await admin.query('GRANT app_definer TO app_owner WITH INHERIT FALSE, SET TRUE');
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    // Always UTF-8, whatever the cluster default: under SQL_ASCII the bytes of a multi-byte
    // character count as control characters, and tenants_display_name_text would reject names
    // such as "Kávéház" (found in Phase 3). C collation keeps ordering deterministic.
    await admin.query(
      `CREATE DATABASE ${database} OWNER app_owner ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
    );
    // No default access for other roles; app roles connect explicitly; no TEMP for anyone else.
    await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${database} TO app_runtime, app_operator`);
  } finally {
    await admin.end();
  }

  // public schema: nobody but its owner may create objects (PostgreSQL 15+ default, made explicit).
  const ownerUrl = urlFor(adminUrl, 'app_owner', database);
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    await owner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally {
    await owner.end();
  }

  await migrate(ownerUrl, migrationsDir);
  const adminDbUrl = new URL(adminUrl.toString());
  adminDbUrl.pathname = `/${database}`;
  return {
    database,
    adminUrl: adminDbUrl.toString(),
    ownerUrl,
    runtimeUrl: urlFor(adminUrl, 'app_runtime', database),
    operatorUrl: urlFor(adminUrl, 'app_operator', database),
  };
}
