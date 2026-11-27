// Startup database-role check (D-035; audit A-01, A-07). Reproduces the audit's escalation paths
// with real roles on the throwaway cluster, shows the risk is real where it still exists, and
// proves the fail-closed check refuses every one. Not a role-name comparison: the same role passes
// for one pool and fails for the other, and renamed/indirect paths are caught.
import { randomBytes } from 'node:crypto';

import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { adminQuery, seedTenant } from '../../../test/db/fixtures.js';
import {
  assertSafeRuntimeRole,
  createDatabase,
  inspectRuntimeRole,
  UnsafeDatabaseRoleError,
} from './database.js';
import type { Db } from './database.js';

const { adminUrl, ownerUrl, runtimeUrl, operatorUrl, database } = inject('database');

const created: string[] = [];
const restore: string[] = [];

async function admin(text: string) {
  return adminQuery(adminUrl, text);
}

/** A throwaway LOGIN role on the test cluster; returns its connection URL. */
let serial = 0;
async function loginRole(base: string, attributes = '', grants: string[] = []): Promise<string> {
  const password = randomBytes(12).toString('hex');
  // A unique role per test case; `grants` refer to it as ROLE.
  const name = `${base}_${String((serial += 1))}`;
  await admin(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' ${attributes}`);
  created.push(name);
  await admin(`GRANT CONNECT ON DATABASE ${database} TO ${name}`);
  for (const g of grants) await admin(g.replaceAll('ROLE', name));
  const url = new URL(runtimeUrl);
  url.username = name;
  url.password = password;
  return url.toString();
}

async function problems(url: string, pool: 'runtime' | 'operator' = 'runtime'): Promise<string[]> {
  const db = createDatabase({ connectionString: url, maxConnections: 1 });
  try {
    return await inspectRuntimeRole(db, pool);
  } finally {
    await db.destroy();
  }
}

async function count(url: string, sqlText: string): Promise<number> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(sqlText);
    return rows[0]?.n ?? -1;
  } finally {
    await client.end();
  }
}

let tenantA: { tenantId: string; accountId: string };

beforeAll(async () => {
  tenantA = await seedTenant(adminUrl);
  await seedTenant(adminUrl);
});

afterEach(async () => {
  while (restore.length > 0) await admin(restore.pop() as string);
});

afterAll(async () => {
  for (const name of created) {
    await admin(`REVOKE ALL ON DATABASE ${database} FROM ${name}`);
    await admin(`DROP OWNED BY ${name}`);
    await admin(`DROP ROLE IF EXISTS ${name}`);
  }
});

describe('the provisioned roles', () => {
  it('runtime passes as the runtime pool, operator as the operator pool', async () => {
    expect(await problems(runtimeUrl, 'runtime')).toEqual([]);
    expect(await problems(operatorUrl, 'operator')).toEqual([]);
    const db: Db = createDatabase({ connectionString: runtimeUrl, maxConnections: 1 });
    await expect(assertSafeRuntimeRole(db, 'runtime')).resolves.toBeUndefined();
    await db.destroy();
  });

  it('the check is about effective privileges, not names: each role fails as the other pool', async () => {
    expect((await problems(runtimeUrl, 'operator')).join(';')).toMatch(/unexpected privileges/);
    expect((await problems(operatorUrl, 'runtime')).join(';')).toMatch(/unexpected privileges/);
  });

  it('refuses the migration role and a superuser', async () => {
    expect(await problems(ownerUrl)).toEqual(
      expect.arrayContaining([
        'owns database objects',
        'owns the database',
        'is a member of another role',
      ]),
    );
    expect(await problems(adminUrl)).toEqual(expect.arrayContaining(['is a superuser']));
    const db = createDatabase({ connectionString: ownerUrl, maxConnections: 1 });
    await expect(assertSafeRuntimeRole(db)).rejects.toBeInstanceOf(UnsafeDatabaseRoleError);
    await db.destroy();
  });
});

describe('adversarial: role membership (audit A-01)', () => {
  it('INHERIT member of app_owner: can SET ROLE to the definer and read every tenant; refused', async () => {
    const url = await loginRole('audit_x_mem_inh', 'INHERIT', ['GRANT app_owner TO ROLE']);
    // The risk is real: through app_owner -> app_definer it reaches the cross-tenant policies.
    expect(
      await count(
        url,
        'SET ROLE app_definer; SELECT count(*)::int AS n FROM app.memberships',
      ).catch(async () => {
        // pg returns the last result of a multi-statement query; fall back to two statements.
        const c = new pg.Client({ connectionString: url });
        await c.connect();
        await c.query('SET ROLE app_definer');
        const { rows } = await c.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM app.memberships',
        );
        await c.end();
        return rows[0]?.n ?? -1;
      }),
    ).toBeGreaterThanOrEqual(2);
    expect(await problems(url)).toContain('is a member of another role');
  });

  it.each([
    ['NOINHERIT member of app_owner', 'NOINHERIT', 'GRANT app_owner TO ROLE'],
    [
      'membership WITH INHERIT FALSE, SET FALSE',
      '',
      'GRANT app_owner TO ROLE WITH INHERIT FALSE, SET FALSE',
    ],
    [
      'member of a superuser role (NOINHERIT)',
      'NOINHERIT',
      `GRANT ${new URL(adminUrl).username} TO ROLE`,
    ],
    ['member of pg_read_all_data', '', 'GRANT pg_read_all_data TO ROLE'],
    ['member of app_definer', '', 'GRANT app_definer TO ROLE'],
  ])('refuses a %s', async (_name, attributes, grant) => {
    const url = await loginRole('audit_x_mem', attributes, [grant]);
    expect(await problems(url)).toContain('is a member of another role');
  });

  it('refuses INDIRECT membership (member of a role that is a member of app_owner)', async () => {
    await admin('DROP ROLE IF EXISTS audit_x_middle');
    await admin('CREATE ROLE audit_x_middle NOLOGIN');
    created.push('audit_x_middle');
    await admin('GRANT app_owner TO audit_x_middle');
    const url = await loginRole('audit_x_indirect', '', ['GRANT audit_x_middle TO ROLE']);
    expect(await problems(url)).toContain('is a member of another role');
  });

  it('refuses the real runtime role after `GRANT app_owner TO app_runtime`', async () => {
    await admin('GRANT app_owner TO app_runtime');
    restore.push('REVOKE app_owner FROM app_runtime');
    expect(await problems(runtimeUrl)).toContain('is a member of another role');
  });
});

describe('adversarial: attributes, ownership and privileges', () => {
  it.each([
    ['CREATEROLE', 'has CREATEROLE'],
    ['CREATEDB', 'has CREATEDB'],
    ['REPLICATION', 'has REPLICATION'],
    ['BYPASSRLS', 'has BYPASSRLS'],
  ])('refuses %s', async (attribute, problem) => {
    const url = await loginRole('audit_x_attr', attribute);
    expect(await problems(url)).toContain(problem);
  });

  it('refuses an extra grant on the runtime role (privileges must match exactly)', async () => {
    await admin('GRANT INSERT ON app.memberships TO app_runtime');
    restore.push('REVOKE INSERT ON app.memberships FROM app_runtime');
    expect((await problems(runtimeUrl)).join(';')).toMatch(
      /unexpected privileges: table:app\.memberships:INSERT/,
    );
  });

  it('refuses a missing grant (the schema and the code disagree)', async () => {
    await admin('REVOKE EXECUTE ON FUNCTION app.session_validate(bytea, text) FROM app_runtime');
    restore.push('GRANT EXECUTE ON FUNCTION app.session_validate(bytea, text) TO app_runtime');
    expect((await problems(runtimeUrl)).join(';')).toMatch(/lacks expected privileges/);
  });

  it('refuses TEMP and CREATE rights on the database', async () => {
    await admin(`GRANT TEMP, CREATE ON DATABASE ${database} TO app_runtime`);
    restore.push(`REVOKE TEMP, CREATE ON DATABASE ${database} FROM app_runtime`);
    expect(await problems(runtimeUrl)).toEqual(
      expect.arrayContaining(['may create temporary tables', 'may create schemas in the database']),
    );
  });

  it('refuses ownership of any object', async () => {
    await admin('CREATE TABLE public.audit_x_owned (id int)');
    await admin('ALTER TABLE public.audit_x_owned OWNER TO app_runtime');
    restore.push('DROP TABLE public.audit_x_owned');
    expect(await problems(runtimeUrl)).toContain('owns database objects');
  });
});

describe('adversarial: preset tenant context and role switches (audit A-07)', () => {
  it('refuses a tenant context preset in the connection options', async () => {
    const url = new URL(runtimeUrl);
    url.searchParams.set('options', `-c app.tenant_id=${tenantA.tenantId}`);
    // The risk: a query outside withTenant() would see tenant A instead of failing closed.
    expect(await count(url.toString(), 'SELECT count(*)::int AS n FROM app.tenants')).toBe(1);
    expect(await problems(url.toString())).toContain('starts with a preset tenant context');
  });

  it('refuses a tenant context preset with ALTER ROLE … SET', async () => {
    await admin(
      `ALTER ROLE app_runtime IN DATABASE ${database} SET app.tenant_id = '${tenantA.tenantId}'`,
    );
    restore.push(`ALTER ROLE app_runtime IN DATABASE ${database} RESET app.tenant_id`);
    expect(await problems(runtimeUrl)).toEqual(
      expect.arrayContaining([
        'starts with a preset tenant context',
        'has preset role or database settings that affect security',
      ]),
    );
  });

  it('refuses row_security switched off for the session', async () => {
    const url = new URL(runtimeUrl);
    url.searchParams.set('options', '-c row_security=off');
    expect(await problems(url.toString())).toContain('row_security is not on');
  });
});
