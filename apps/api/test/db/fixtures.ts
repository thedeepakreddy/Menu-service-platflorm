// Shared database-test fixtures (Phase 2 remediation). Seeding uses the cluster SUPERUSER URL of
// the throwaway test database (`adminUrl`): since migration 0005 no application role — not even
// the migration role — can write tenant data directly, which is exactly the property under test.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';

export async function adminQuery<R extends pg.QueryResultRow = pg.QueryResultRow>(
  adminUrl: string,
  text: string,
  values: unknown[] = [],
): Promise<pg.QueryResult<R>> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await client.query<R>(text, values);
  } finally {
    await client.end();
  }
}

/** Runs one statement as a role (its own connection, no tenant context). */
export async function asRole<R extends pg.QueryResultRow = pg.QueryResultRow>(
  url: string,
  text: string,
  values: unknown[] = [],
): Promise<pg.QueryResult<R>> {
  return adminQuery<R>(url, text, values);
}

export type Seeded = { tenantId: string; accountId: string };

let counter = 0;
const unique = (prefix: string) =>
  `${prefix}-${String(process.pid)}-${String((counter += 1))}-${randomUUID().slice(0, 8)}`;

/** A fresh slug that passes the slug rule. */
export function slug(prefix = 't'): string {
  return unique(prefix)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 60);
}

export async function seedAccount(
  adminUrl: string,
  options: {
    issuer?: string | null;
    subject?: string | null;
    kind?: 'owner' | 'operator';
    status?: 'active' | 'deactivated';
  } = {},
): Promise<string> {
  const { rows } = await adminQuery<{ id: string }>(
    adminUrl,
    `INSERT INTO app.accounts (issuer, subject, kind, status) VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      options.issuer === undefined ? 'https://idp.test' : options.issuer,
      options.subject === undefined ? unique('sub') : options.subject,
      options.kind ?? 'owner',
      options.status ?? 'active',
    ],
  );
  return rows[0]?.id as string;
}

/** A tenant with an active owner membership (or none, with `owner: null`). */
export async function seedTenant(
  adminUrl: string,
  options: {
    slug?: string;
    status?: 'active' | 'suspended' | 'retired';
    owner?: string | null;
  } = {},
): Promise<Seeded & { slug: string }> {
  const s = options.slug ?? slug();
  const accountId =
    options.owner === undefined ? await seedAccount(adminUrl) : (options.owner ?? '');
  const { rows } = await adminQuery<{ id: string }>(
    adminUrl,
    `INSERT INTO app.tenants (slug, display_name, status) VALUES ($1, $2, $3) RETURNING id`,
    [s, `Tenant ${s}`, options.status ?? 'active'],
  );
  const tenantId = rows[0]?.id as string;
  if (accountId !== '') {
    await adminQuery(
      adminUrl,
      `INSERT INTO app.memberships (tenant_id, account_id, role, status) VALUES ($1, $2, 'owner', 'active')`,
      [tenantId, accountId],
    );
  }
  return { tenantId, accountId, slug: s };
}

export const tokenHash = (token: string) => createHash('sha256').update(token, 'ascii').digest();

/**
 * A live server-side session inserted directly (bypassing login), for tests of routes and
 * database functions that need an authenticated principal. Returns the opaque token.
 */
export async function seedSession(
  adminUrl: string,
  accountId: string,
  kind: 'owner' | 'operator',
  options: { mfa?: boolean; absoluteSeconds?: number; idleSeconds?: number } = {},
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const absolute = options.absoluteSeconds ?? 1800;
  const idle = options.idleSeconds ?? 900;
  await adminQuery(
    adminUrl,
    `INSERT INTO app.sessions (token_hash, account_id, kind, mfa, auth_time, client_id,
                               idle_timeout, idle_expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4, now(), 'test-client', make_interval(secs => $5),
             least(now() + make_interval(secs => $5), now() + make_interval(secs => $6)),
             now() + make_interval(secs => $6))`,
    [tokenHash(token), accountId, kind, options.mfa ?? kind === 'operator', idle, absolute],
  );
  return token;
}

/** An active operator account with a live MFA session. */
export async function seedOperator(
  adminUrl: string,
): Promise<{ accountId: string; token: string }> {
  const accountId = await seedAccount(adminUrl, { kind: 'operator', issuer: 'https://ops.test' });
  return { accountId, token: await seedSession(adminUrl, accountId, 'operator') };
}

/** Synthetic BFF credential for tests (43 base64url characters). Not a secret. */
export const TEST_BFF_CREDENTIAL = 'synthetic-bff-credential-for-tests-only-00000';

export function bffHeaders(session?: string, extra: Record<string, string> = {}) {
  return {
    'x-platform-bff-credential': TEST_BFF_CREDENTIAL,
    ...(session === undefined ? {} : { authorization: `Session ${session}` }),
    'content-type': 'application/json',
    ...extra,
  };
}

/** A port that is free right now (bound and released), instead of a random guess. */
export async function freePort(): Promise<string> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        resolve(String(port));
      });
    });
  });
}
