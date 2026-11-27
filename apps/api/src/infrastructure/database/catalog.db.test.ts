// Database security catalog and adversarial permission tests (Phase 2 remediation; D-035;
// audit A-02, A-03, A-04, A-08, B-04). Each adversarial test first CONFIRMS that its mutation was
// applied, then shows that (a) the catalog check flags it and (b) it does not widen what the
// application roles can see or do.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { adminQuery, asRole, seedTenant } from '../../../test/db/fixtures.js';

const { adminUrl, ownerUrl, runtimeUrl, operatorUrl } = inject('database');

const CANONICAL_TENANT_EXPR =
  '(tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))';
const CANONICAL_TENANT_ROW_EXPR = '(id = ( SELECT app.current_tenant_id() AS current_tenant_id))';

/** Who may EXECUTE each function in schema `app` (besides its owner). Anything else is a finding. */
const FUNCTION_GRANTEES: Record<string, string[]> = {
  current_tenant_id: ['app_operator', 'app_runtime'],
  resolve_active_tenant: ['app_runtime'],
  session_create: ['app_runtime'],
  session_validate: ['app_runtime'],
  session_revoke: ['app_runtime'],
  operator_provision_tenant: ['app_operator'],
  operator_set_tenant_status: ['app_operator'],
  operator_get_tenant: ['app_operator'],
  operator_get_account: ['app_operator'],
  operator_set_account_status: ['app_operator'],
  operator_revoke_owner_membership: ['app_operator'],
  operator_transfer_ownership: ['app_operator'],
  operator_unlink_account_identity: ['app_operator'],
  operator_link_account_identity: ['app_operator'],
  operator_operation_outcome: ['app_operator'],
  // Internal helpers: callable only by their owner (the definer) from other definer functions.
  revoke_account_sessions: [],
  operator_from_session: [],
  write_operator_audit: [],
  assert_tenant_owned: [],
  owns_active_tenant: [],
  lock_owner_account: [],
  operator_audit_immutable: [],
};

/**
 * Every catalog-level violation of the D-035 model, as readable strings. Empty = compliant. The
 * same function is used against the real schema and against deliberately broken copies.
 */
async function catalogViolations(client: pg.Client): Promise<string[]> {
  const v: string[] = [];
  const q = async <R extends pg.QueryResultRow>(text: string) => (await client.query<R>(text)).rows;
  // Deterministic, schema-qualified expression text from pg_get_expr.
  await client.query('SET search_path = pg_catalog');

  for (const r of await q<{
    name: string;
    kind: string;
    rls: boolean;
    force: boolean;
    opts: string[] | null;
  }>(`
      SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls,
             c.relforcerowsecurity AS force, c.reloptions AS opts
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`)) {
    if ((r.kind === 'r' || r.kind === 'p') && !(r.rls && r.force))
      v.push(`table ${r.name}: RLS not enabled and forced`);
    if (r.kind === 'v' && !(r.opts ?? []).includes('security_invoker=true'))
      v.push(`view ${r.name}: not security_invoker`);
    if (r.kind === 'm' || r.kind === 'f')
      v.push(`relation ${r.name}: materialized/foreign relations are not allowed in app`);
  }

  for (const p of await q<{
    tbl: string;
    pol: string;
    permissive: boolean;
    roles: string[];
    qual: string | null;
    chk: string | null;
    cmd: string;
  }>(`
      SELECT c.relname AS tbl, p.polname AS pol, p.polpermissive AS permissive,
             ARRAY(SELECT CASE WHEN r = 0 THEN 'public' ELSE r::regrole::text END
                   FROM unnest(p.polroles) AS r ORDER BY 1) AS roles,
             pg_get_expr(p.polqual, p.polrelid) AS qual,
             pg_get_expr(p.polwithcheck, p.polrelid) AS chk, p.polcmd AS cmd
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app'`)) {
    const label = `policy ${p.tbl}.${p.pol}`;
    if (p.roles.some((r) => !['app_runtime', 'app_operator', 'app_definer'].includes(r))) {
      v.push(`${label}: applies to ${p.roles.join(',')}`);
    }
    if (p.roles.includes('app_runtime') || p.roles.includes('app_operator')) {
      const canonical = p.tbl === 'tenants' ? CANONICAL_TENANT_ROW_EXPR : CANONICAL_TENANT_EXPR;
      if (p.qual !== canonical)
        v.push(`${label}: runtime USING is not the canonical tenant expression`);
      if (p.cmd !== 'r' && p.chk !== null && p.chk !== canonical)
        v.push(`${label}: runtime WITH CHECK is not canonical`);
    }
  }

  // Every table the runtime can read and every tenant-owned table has the RESTRICTIVE backstop.
  for (const t of await q<{ tbl: string; guarded: boolean }>(`
      SELECT c.relname AS tbl,
             EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND NOT p.polpermissive
                     AND 'app_runtime'::regrole = ANY (p.polroles)) AS guarded
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p')
        AND (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                       AND a.attname = 'tenant_id' AND NOT a.attisdropped)
             OR has_table_privilege('app_runtime', c.oid, 'SELECT'))`)) {
    if (!t.guarded) v.push(`table ${t.tbl}: no restrictive tenant policy for app_runtime`);
  }

  for (const f of await q<{
    name: string;
    owner: string;
    secdef: boolean;
    config: string[] | null;
    public: boolean;
    grantees: string[];
    body: string;
  }>(`
      SELECT p.proname AS name, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef,
             p.proconfig AS config,
             EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public,
             ARRAY(SELECT DISTINCT pg_get_userbyid(a.grantee)::text
                   FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   WHERE a.grantee <> 0 AND a.grantee <> p.proowner
                     AND a.privilege_type = 'EXECUTE' ORDER BY 1) AS grantees,
             p.prosrc AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app'`)) {
    const label = `function ${f.name}`;
    if (f.public) v.push(`${label}: executable by PUBLIC`);
    const expected = FUNCTION_GRANTEES[f.name];
    if (expected === undefined) v.push(`${label}: not in the reviewed function list`);
    else if (JSON.stringify(f.grantees) !== JSON.stringify([...expected].sort())) {
      v.push(`${label}: EXECUTE granted to ${f.grantees.join(',') || 'nobody'}`);
    }
    if (f.secdef) {
      if (f.owner !== 'app_definer') v.push(`${label}: SECURITY DEFINER owned by ${f.owner}`);
      if (!(f.config ?? []).includes('search_path=pg_catalog, pg_temp'))
        v.push(`${label}: search_path not pinned`);
    } else if (f.owner !== 'app_owner') {
      v.push(`${label}: owned by ${f.owner}`);
    }
    if (/set_config|SET\s+ROLE|SESSION\s+AUTHORIZATION/i.test(f.body))
      v.push(`${label}: changes settings or role`);
  }

  // New functions are not executable by PUBLIC by default.
  const defaults = await q<{ ok: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM pg_default_acl d
                     WHERE d.defaclrole = 'app_owner'::regrole AND d.defaclobjtype = 'f'
                       AND d.defaclnamespace = 0
                       AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a
                                       WHERE a.grantee = 0)) AS ok`);
  if (defaults[0]?.ok !== true) v.push('default privileges: functions are executable by PUBLIC');

  // The audit trail is append-only.
  const audit = await q<{ owner_mutate: boolean; triggers: number }>(`
      SELECT has_table_privilege('app_owner', 'app.operator_audit', 'UPDATE')
          OR has_table_privilege('app_owner', 'app.operator_audit', 'DELETE')
          OR has_table_privilege('app_owner', 'app.operator_audit', 'TRUNCATE') AS owner_mutate,
             (SELECT count(*)::int FROM pg_trigger t
              WHERE t.tgrelid = 'app.operator_audit'::regclass AND NOT t.tgisinternal
                AND t.tgenabled <> 'D') AS triggers`);
  if (audit[0]?.owner_mutate !== false) v.push('operator_audit: the owner may modify history');
  if ((audit[0]?.triggers ?? 0) < 2)
    v.push('operator_audit: immutability triggers missing or disabled');

  // Application roles: no superuser/BYPASSRLS; the definer cannot log in and only the migration
  // role may SET ROLE to it, without inheriting it.
  const roles = await q<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
  }>(`
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles
      WHERE rolname IN ('app_owner', 'app_runtime', 'app_operator', 'app_definer')`);
  for (const r of roles) {
    if (r.rolsuper || r.rolbypassrls) v.push(`role ${r.rolname}: superuser or BYPASSRLS`);
    if (r.rolname === 'app_definer' && r.rolcanlogin) v.push('role app_definer: can log in');
  }
  for (const m of await q<{ member: string; inherit: boolean }>(`
      SELECT pg_get_userbyid(m.member) AS member, m.inherit_option AS inherit
      FROM pg_auth_members m WHERE m.roleid = 'app_definer'::regrole`)) {
    if (m.member !== 'app_owner' || m.inherit) v.push(`role app_definer: member ${m.member}`);
  }
  return v.sort();
}

let admin: pg.Client;
let tenantA: { tenantId: string; slug: string };
let tenantB: { tenantId: string; slug: string };

beforeAll(async () => {
  admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  tenantA = await seedTenant(adminUrl);
  tenantB = await seedTenant(adminUrl);
});

afterAll(async () => {
  await admin.end();
});

/** Rows of app.memberships the runtime sees inside tenant B's context. */
async function runtimeMembershipsInB(): Promise<{ tenant_id: string }[]> {
  const client = new pg.Client({ connectionString: runtimeUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB.tenantId]);
    const { rows } = await client.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM app.memberships',
    );
    await client.query('ROLLBACK');
    return rows;
  } finally {
    await client.end();
  }
}

describe('security catalog (D-035)', () => {
  it('the migrated schema has no violations', async () => {
    expect(await catalogViolations(admin)).toEqual([]);
  });
});

describe('adversarial: the migration role holds no row access (audit A-02)', () => {
  it('app_owner reads and writes no tenant rows despite owning the tables', async () => {
    const { rows } = await asRole<{ n: number }>(
      ownerUrl,
      'SELECT count(*)::int AS n FROM app.tenants',
    );
    expect(rows[0]?.n).toBe(0);
    await expect(
      asRole(ownerUrl, "INSERT INTO app.tenants (slug, display_name) VALUES ('evil-co', 'x')"),
    ).rejects.toThrow(/row-level security/);
  });

  it('a view created by app_owner and granted to the runtime leaks nothing and is flagged', async () => {
    await asRole(
      ownerUrl,
      `CREATE VIEW app.memberships_leak AS SELECT * FROM app.memberships;
                            GRANT SELECT ON app.memberships_leak TO app_runtime`,
    );
    try {
      const exists = await adminQuery(
        adminUrl,
        "SELECT 1 FROM pg_views WHERE viewname = 'memberships_leak'",
      );
      expect(exists.rowCount).toBe(1); // the mutation really applied
      // Owner-privileged view: before 0005 this returned every tenant's memberships.
      const viaView = await asRole<{ n: number }>(
        runtimeUrl,
        'SELECT count(*)::int AS n FROM app.memberships_leak',
      );
      expect(viaView.rows[0]?.n).toBe(0);
      expect(await catalogViolations(admin)).toContain(
        'view memberships_leak: not security_invoker',
      );
    } finally {
      await asRole(ownerUrl, 'DROP VIEW app.memberships_leak');
    }
  });
});

describe('adversarial: a sloppy policy cannot widen runtime access (audit A-03)', () => {
  it('a permissive `OR true` policy is neutralised by the restrictive backstop and flagged', async () => {
    expect((await runtimeMembershipsInB()).map((r) => r.tenant_id)).toEqual([tenantB.tenantId]);
    await asRole(
      ownerUrl,
      `CREATE POLICY sloppy ON app.memberships FOR SELECT TO app_runtime
                            USING (tenant_id = (SELECT app.current_tenant_id()) OR true)`,
    );
    try {
      const applied = await adminQuery(
        adminUrl,
        "SELECT 1 FROM pg_policy WHERE polname = 'sloppy'",
      );
      expect(applied.rowCount).toBe(1);
      const rows = await runtimeMembershipsInB();
      expect(rows.map((r) => r.tenant_id)).toEqual([tenantB.tenantId]); // not tenant A's
      expect(rows.map((r) => r.tenant_id)).not.toContain(tenantA.tenantId);
      expect(await catalogViolations(admin)).toContain(
        'policy memberships.sloppy: runtime USING is not the canonical tenant expression',
      );
    } finally {
      await asRole(ownerUrl, 'DROP POLICY sloppy ON app.memberships');
    }
  });

  it('dropping the restrictive backstop is flagged', async () => {
    await asRole(ownerUrl, 'DROP POLICY memberships_tenant_guard ON app.memberships');
    try {
      expect(await catalogViolations(admin)).toContain(
        'table memberships: no restrictive tenant policy for app_runtime',
      );
    } finally {
      await asRole(
        ownerUrl,
        `CREATE POLICY memberships_tenant_guard ON app.memberships AS RESTRICTIVE
        FOR ALL TO app_runtime, app_operator
        USING (tenant_id = (SELECT app.current_tenant_id()))
        WITH CHECK (tenant_id = (SELECT app.current_tenant_id()))`,
      );
    }
    expect(await catalogViolations(admin)).toEqual([]);
  });
});

describe('adversarial: functions are not executable by default (audit A-04)', () => {
  it('a new SECURITY DEFINER function without any REVOKE is not callable by the app roles', async () => {
    await asRole(
      ownerUrl,
      `CREATE FUNCTION app.forgot_revoke() RETURNS bigint LANGUAGE sql
                            SECURITY DEFINER SET search_path = pg_catalog, pg_temp
                            AS $$ SELECT count(*) FROM app.memberships $$`,
    );
    try {
      const { rows } = await adminQuery<{ rt: boolean; op: boolean }>(
        adminUrl,
        `SELECT has_function_privilege('app_runtime', 'app.forgot_revoke()', 'EXECUTE') AS rt,
                has_function_privilege('app_operator', 'app.forgot_revoke()', 'EXECUTE') AS op`,
      );
      expect(rows[0]).toEqual({ rt: false, op: false });
      await expect(asRole(runtimeUrl, 'SELECT app.forgot_revoke()')).rejects.toThrow(
        /permission denied/,
      );
      const violations = await catalogViolations(admin);
      expect(violations).toContain('function forgot_revoke: not in the reviewed function list');
      expect(violations).toContain('function forgot_revoke: SECURITY DEFINER owned by app_owner');
    } finally {
      await asRole(ownerUrl, 'DROP FUNCTION app.forgot_revoke()');
    }
  });

  it('a PUBLIC grant is flagged', async () => {
    await asRole(ownerUrl, 'GRANT EXECUTE ON FUNCTION app.operator_audit_immutable() TO PUBLIC');
    try {
      expect(await catalogViolations(admin)).toContain(
        'function operator_audit_immutable: executable by PUBLIC',
      );
    } finally {
      await asRole(
        ownerUrl,
        'REVOKE EXECUTE ON FUNCTION app.operator_audit_immutable() FROM PUBLIC',
      );
    }
  });
});

describe('adversarial: the operator audit trail is append-only (audit B-04)', () => {
  beforeAll(async () => {
    await adminQuery(
      adminUrl,
      `INSERT INTO app.operator_audit (operator_id, action, reason, target_tenant)
       VALUES ('seed', 'test.seed', 'seeded for the immutability test', $1)`,
      [tenantA.tenantId],
    );
  });

  it.each([
    ['UPDATE', "UPDATE app.operator_audit SET reason = 'rewritten history!'"],
    ['DELETE', 'DELETE FROM app.operator_audit'],
    ['TRUNCATE', 'TRUNCATE app.operator_audit'],
  ])('the migration role cannot %s it', async (_name, statement) => {
    await expect(asRole(ownerUrl, statement)).rejects.toThrow(/permission denied/);
  });

  it.each([
    ['UPDATE', "UPDATE app.operator_audit SET reason = 'rewritten history!'"],
    ['DELETE', 'DELETE FROM app.operator_audit'],
    ['TRUNCATE', 'TRUNCATE app.operator_audit'],
  ])('even a superuser %s is refused by the trigger', async (_name, statement) => {
    await expect(adminQuery(adminUrl, statement)).rejects.toThrow(/append-only/);
    const { rows } = await adminQuery<{ n: number }>(
      adminUrl,
      'SELECT count(*)::int AS n FROM app.operator_audit',
    );
    expect(rows[0]?.n).toBeGreaterThan(0);
  });

  it('the definer role (behind every operator function) cannot change it either', async () => {
    await expect(
      asRole(
        ownerUrl,
        "SET ROLE app_definer; UPDATE app.operator_audit SET reason = 'rewritten history!'",
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('application roles cannot read or write it at all', async () => {
    await expect(asRole(runtimeUrl, 'SELECT * FROM app.operator_audit')).rejects.toThrow(
      /permission denied/,
    );
    await expect(asRole(operatorUrl, 'SELECT * FROM app.operator_audit')).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('the definer role (D-035)', () => {
  it('cannot be used to log in and cannot be assumed by the application roles', async () => {
    for (const url of [runtimeUrl, operatorUrl]) {
      await expect(asRole(url, 'SET ROLE app_definer')).rejects.toThrow(/permission denied/);
    }
    const definerUrl = new URL(runtimeUrl);
    definerUrl.username = 'app_definer';
    await expect(asRole(definerUrl.toString(), 'SELECT 1')).rejects.toThrow();
  });
});
