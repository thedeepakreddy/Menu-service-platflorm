-- 0005 — Definer role, narrow cross-tenant policies, function defaults, audit integrity
-- (Phase 2 audit remediation: A-02, A-03, A-04, B-04; decision D-035).
--
-- Before this migration the table owner `app_owner` had `USING (true)` policies on every table,
-- so every path that ran as app_owner saw all tenants: the SECURITY DEFINER functions, any view
-- it created, and any role holding its membership (audit A-01/A-02).
--
-- After this migration:
--   * `app_definer` (NOLOGIN, created by provisioning, see D-035) owns every SECURITY DEFINER
--     function and holds the ONLY cross-tenant policies, one per command it needs. There is no
--     DELETE on tenant data and no UPDATE/DELETE/TRUNCATE on the audit trail.
--   * `app_owner` keeps DDL authority (it owns the tables) but has no row policy at all: under
--     FORCE ROW LEVEL SECURITY it reads and writes no rows. A view it creates sees nothing.
--   * Tenant-owned tables carry a RESTRICTIVE tenant policy for the application roles, so an
--     extra permissive policy added by mistake can never widen what the runtime sees.
--   * New functions are not executable by PUBLIC by default; each grant is explicit.
--   * The operator audit trail refuses UPDATE, DELETE and TRUNCATE.

GRANT USAGE, CREATE ON SCHEMA app TO app_definer;

-- A-04: functions created by the migration role are no longer executable by PUBLIC by default.
-- (PUBLIC EXECUTE on functions can only be revoked globally, not per schema.)
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Existing SECURITY DEFINER functions move to the definer role.
ALTER FUNCTION app.resolve_active_tenant(text) OWNER TO app_definer;
ALTER FUNCTION app.find_account(text, text, text) OWNER TO app_definer;
ALTER FUNCTION app.operator_provision_tenant(text, text, text, text, text, text) OWNER TO app_definer;
ALTER FUNCTION app.operator_set_tenant_status(text, text, text, text, text) OWNER TO app_definer;

-- A-02: remove the owner's catch-all policies.
DROP POLICY tenants_owner_all ON app.tenants;
DROP POLICY accounts_owner_all ON app.accounts;
DROP POLICY memberships_owner_all ON app.memberships;
DROP POLICY operator_audit_owner_insert ON app.operator_audit;
DROP POLICY operator_audit_owner_read ON app.operator_audit;

-- The definer's privileges: exactly the commands the reviewed functions perform.
GRANT SELECT, INSERT, UPDATE ON app.tenants TO app_definer;
GRANT SELECT, INSERT, UPDATE ON app.accounts TO app_definer;
GRANT SELECT, INSERT, UPDATE ON app.memberships TO app_definer;
GRANT SELECT, INSERT ON app.operator_audit TO app_definer;

CREATE POLICY tenants_definer_select ON app.tenants FOR SELECT TO app_definer USING (true);
CREATE POLICY tenants_definer_insert ON app.tenants FOR INSERT TO app_definer WITH CHECK (true);
CREATE POLICY tenants_definer_update ON app.tenants FOR UPDATE TO app_definer
  USING (true) WITH CHECK (true);

CREATE POLICY accounts_definer_select ON app.accounts FOR SELECT TO app_definer USING (true);
CREATE POLICY accounts_definer_insert ON app.accounts FOR INSERT TO app_definer WITH CHECK (true);
CREATE POLICY accounts_definer_update ON app.accounts FOR UPDATE TO app_definer
  USING (true) WITH CHECK (true);

CREATE POLICY memberships_definer_select ON app.memberships FOR SELECT TO app_definer USING (true);
CREATE POLICY memberships_definer_insert ON app.memberships FOR INSERT TO app_definer
  WITH CHECK (true);
CREATE POLICY memberships_definer_update ON app.memberships FOR UPDATE TO app_definer
  USING (true) WITH CHECK (true);

CREATE POLICY operator_audit_definer_select ON app.operator_audit FOR SELECT TO app_definer
  USING (true);
CREATE POLICY operator_audit_definer_insert ON app.operator_audit FOR INSERT TO app_definer
  WITH CHECK (true);

-- A-03: restrictive backstops. Restrictive policies are ANDed with the permissive ones, so even
-- `USING (... OR true)` added later cannot show the runtime another tenant's rows.
CREATE POLICY tenants_tenant_guard ON app.tenants AS RESTRICTIVE FOR ALL
  TO app_runtime, app_operator
  USING (id = (SELECT app.current_tenant_id()))
  WITH CHECK (id = (SELECT app.current_tenant_id()));
CREATE POLICY memberships_tenant_guard ON app.memberships AS RESTRICTIVE FOR ALL
  TO app_runtime, app_operator
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));

-- B-04: the audit trail is append-only for every role, including the table owner. The owner's
-- own privileges are revoked, and triggers refuse the commands outright. (The table owner can
-- still drop a trigger with DDL: that is a migration, reviewed and run only by the verified
-- migration identity, D-035. The shipped log remains the trail of record, D-028.)
REVOKE UPDATE, DELETE, TRUNCATE ON app.operator_audit FROM app_owner;

CREATE FUNCTION app.operator_audit_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  RAISE EXCEPTION 'operator audit records are append-only' USING ERRCODE = 'PTX01';
END
$$;

CREATE TRIGGER operator_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON app.operator_audit
  FOR EACH ROW EXECUTE FUNCTION app.operator_audit_immutable();
CREATE TRIGGER operator_audit_no_truncate
  BEFORE TRUNCATE ON app.operator_audit
  FOR EACH STATEMENT EXECUTE FUNCTION app.operator_audit_immutable();
