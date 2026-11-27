-- 0001 — Tenancy foundation (Phase 2, M2.1; decisions D-024, D-027, D-028).
--
-- Runs as the migration role `app_owner`, which owns the database and everything created here.
-- The roles app_owner, app_runtime and app_operator are created by the environment's
-- provisioning step, not by migrations (they are cluster-wide; see D-028, D-029).
--
-- Isolation model (D-028):
--   * every table in schema `app` has ROW LEVEL SECURITY enabled AND forced, so even the owner is
--     subject to policies (a database test asserts this for every table);
--   * tenant-owned tables carry `tenant_id` and the policy
--     `tenant_id = (SELECT app.current_tenant_id())`, evaluated once per statement (InitPlan);
--   * tenant context is a transaction-local setting written only by withTenant();
--   * app_runtime gets the minimum grants; identity and audit tables are reachable only through
--     reviewed SECURITY DEFINER functions (added by later migrations).

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO app_runtime, app_operator;

-- Current tenant from the transaction-local setting. NULL when unset or empty: fails closed.
-- (After a transaction-local set_config has ended, current_setting(..., true) returns '' rather
-- than NULL in that session, hence nullif.) A malformed value raises 22P02: also fails closed.
CREATE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
REVOKE ALL ON FUNCTION app.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO app_runtime, app_operator;

-- Tenants. Public URLs use the slug (D-027); the id never appears in a public URL.
CREATE TABLE app.tenants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        NOT NULL UNIQUE
                           CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$'),
  display_name text        NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  status       text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'suspended', 'retired')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenants FORCE ROW LEVEL SECURITY;
-- Inside a tenant context the runtime may read that tenant's own row, nothing else.
CREATE POLICY tenants_own_row ON app.tenants
  FOR SELECT TO app_runtime
  USING (id = (SELECT app.current_tenant_id()));
-- FORCE binds the owner too. SECURITY DEFINER functions (owned by app_owner) and data
-- migrations need to read and maintain tenants across tenants.
CREATE POLICY tenants_owner_all ON app.tenants
  FOR ALL TO app_owner
  USING (true) WITH CHECK (true);
GRANT SELECT ON app.tenants TO app_runtime;

-- Platform accounts: an identity from the identity provider, mapped by (issuer, subject) (D-025).
-- Not tenant-owned. The runtime has no direct access; lookups go through SECURITY DEFINER
-- functions added with the identity milestone.
CREATE TABLE app.accounts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer     text        NOT NULL CHECK (length(issuer) BETWEEN 1 AND 500),
  subject    text        NOT NULL CHECK (length(subject) BETWEEN 1 AND 500),
  kind       text        NOT NULL CHECK (kind IN ('owner', 'operator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
ALTER TABLE app.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY accounts_owner_all ON app.accounts
  FOR ALL TO app_owner
  USING (true) WITH CHECK (true);

-- Memberships: tenant-owned. Phase 2 has one role, `owner` (Doc 01 §5: no staff roles in MVP).
CREATE TABLE app.memberships (
  tenant_id  uuid        NOT NULL REFERENCES app.tenants (id),
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  role       text        NOT NULL DEFAULT 'owner' CHECK (role = 'owner'),
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, account_id)
);
CREATE INDEX memberships_account_idx ON app.memberships (account_id);
ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_tenant_isolation ON app.memberships
  FOR ALL TO app_runtime
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
CREATE POLICY memberships_owner_all ON app.memberships
  FOR ALL TO app_owner
  USING (true) WITH CHECK (true);
GRANT SELECT ON app.memberships TO app_runtime;

-- Operator audit: written only by SECURITY DEFINER operator functions (D-028). Append-only for
-- every application role; no runtime or operator grants.
CREATE TABLE app.operator_audit (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  db_user       text        NOT NULL DEFAULT session_user,
  operator_id   text        NOT NULL CHECK (length(operator_id) BETWEEN 1 AND 200),
  action        text        NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  reason        text        NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  target_tenant uuid        REFERENCES app.tenants (id)
);
ALTER TABLE app.operator_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.operator_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY operator_audit_owner_insert ON app.operator_audit
  FOR INSERT TO app_owner
  WITH CHECK (true);
CREATE POLICY operator_audit_owner_read ON app.operator_audit
  FOR SELECT TO app_owner
  USING (true);
