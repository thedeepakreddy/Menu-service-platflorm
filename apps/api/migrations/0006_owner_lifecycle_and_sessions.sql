-- 0006 — Owner account lifecycle, revocable server-side sessions, session-derived operator
-- identity, operation ids (Phase 2 audit remediation: E-01, E-03, B-02, B-03, B-07, B-08, E-10;
-- decisions D-034, D-036).
--
-- Every function below is SECURITY DEFINER, owned by app_definer (no PUBLIC execute: default
-- privileges from 0005, plus explicit REVOKE), pins search_path, and qualifies every object.
--
-- Error codes (SQLSTATE) mapped by the API:
--   PTA01 operator/owner session or account not usable (unauthenticated)
--   PTB01 identity already bound to an account     PTC01 stale expected state (compare-and-set)
--   PTI01 invalid transition                        PTK01 identity/account of the wrong kind
--   PTN01 tenant or account not found               PTO01 would leave an active tenant ownerless
--   PTR01 ID token already used (replay)            PTS01 account not active
--   23505 unique violation                          23514 check violation (invalid input)
--
-- Invariant (D-036): every ACTIVE tenant has exactly one active owner membership, and that
-- owner's account is active and linked to an identity. At most one active owner per tenant is
-- enforced by a unique index; the rest by the functions below, under row locks.

------------------------------------------------------------------------------------------------
-- Schema changes
------------------------------------------------------------------------------------------------

DROP FUNCTION app.find_account(text, text, text);
DROP FUNCTION app.operator_provision_tenant(text, text, text, text, text, text);
DROP FUNCTION app.operator_set_tenant_status(text, text, text, text, text);

-- B-07: the database enforces the same input rules as the API contracts.
ALTER TABLE app.tenants ADD CONSTRAINT tenants_slug_not_reserved CHECK (slug NOT IN (
  'admin', 'api', 'app', 'assets', 'auth', 'health', 'help', 'login', 'logout', 'operator',
  'owner', 'platform', 'public', 'static', 'status', 'support', 'www'));
ALTER TABLE app.tenants ADD CONSTRAINT tenants_display_name_text
  CHECK (display_name !~ '[[:cntrl:]]' AND display_name ~ '[^[:space:]]');

-- Accounts gain a lifecycle; an identity can be unlinked (both columns NULL) and re-linked.
ALTER TABLE app.accounts
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ALTER COLUMN issuer DROP NOT NULL,
  ALTER COLUMN subject DROP NOT NULL,
  ADD CONSTRAINT accounts_identity_pair CHECK ((issuer IS NULL) = (subject IS NULL)),
  ADD CONSTRAINT accounts_active_linked CHECK (status <> 'active' OR issuer IS NOT NULL),
  ADD CONSTRAINT accounts_issuer_https
    CHECK (issuer IS NULL OR issuer ~ '^https://[^/?#@[:space:][:cntrl:]]+(/[^?#@[:space:][:cntrl:]]*)?$'),
  ADD CONSTRAINT accounts_subject_text CHECK (subject IS NULL OR subject !~ '[[:cntrl:][:space:]]');

ALTER TABLE app.memberships ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- E-10: one active owner per tenant (Doc 01 §5).
CREATE UNIQUE INDEX memberships_one_active_owner ON app.memberships (tenant_id)
  WHERE role = 'owner' AND status = 'active';

-- Operator audit: the operator is an ACCOUNT derived from a verified session (B-03), every action
-- has a unique operation id (B-02), and lifecycle actions record their account target.
ALTER TABLE app.operator_audit
  ADD COLUMN operation_id uuid UNIQUE,
  ADD COLUMN operator_account uuid REFERENCES app.accounts (id),
  ADD COLUMN operator_session uuid,
  ADD COLUMN target_account uuid REFERENCES app.accounts (id),
  ADD COLUMN details jsonb,
  ADD CONSTRAINT operator_audit_reason_text
    CHECK (reason !~ '[[:cntrl:]]' AND reason ~ '[^[:space:]]');

-- Server-side sessions (E-03, D-034). The token itself is never stored: only its SHA-256.
CREATE TABLE app.sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash          bytea       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  account_id          uuid        NOT NULL REFERENCES app.accounts (id),
  kind                text        NOT NULL CHECK (kind IN ('owner', 'operator')),
  mfa                 boolean     NOT NULL,
  auth_time           timestamptz NOT NULL,
  client_id           text        NOT NULL CHECK (length(client_id) BETWEEN 1 AND 500),
  idp_session_id      text        CHECK (length(idp_session_id) BETWEEN 1 AND 500),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  idle_timeout        interval    NOT NULL
                      CHECK (idle_timeout BETWEEN interval '1 minute' AND interval '8 hours'),
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at          timestamptz,
  revoked_reason      text        CHECK (revoked_reason IN (
                        'logout', 'rotated', 'account_deactivated', 'identity_unlinked',
                        'identity_linked', 'membership_revoked', 'ownership_transferred',
                        'privilege_changed', 'tenant_suspended', 'tenant_retired')),
  CONSTRAINT sessions_revocation_pair CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  -- MFA downgrade protection: an operator session without MFA cannot exist.
  CONSTRAINT sessions_operator_mfa CHECK (kind <> 'operator' OR mfa),
  CONSTRAINT sessions_idle_within_absolute CHECK (idle_expires_at <= absolute_expires_at),
  CONSTRAINT sessions_absolute_after_creation CHECK (absolute_expires_at > created_at),
  -- Ceilings (D-034): owners 8 h; operators 1 h AND within 1 h of the MFA authentication.
  CONSTRAINT sessions_owner_ceiling
    CHECK (kind <> 'owner' OR absolute_expires_at <= created_at + interval '8 hours'),
  CONSTRAINT sessions_operator_ceiling
    CHECK (kind <> 'operator' OR (absolute_expires_at <= created_at + interval '1 hour'
                                  AND absolute_expires_at <= auth_time + interval '1 hour'))
);
CREATE INDEX sessions_account_live_idx ON app.sessions (account_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_absolute_expiry_idx ON app.sessions (absolute_expires_at);
ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.sessions TO app_definer;
CREATE POLICY sessions_definer_select ON app.sessions FOR SELECT TO app_definer USING (true);
CREATE POLICY sessions_definer_insert ON app.sessions FOR INSERT TO app_definer WITH CHECK (true);
CREATE POLICY sessions_definer_update ON app.sessions FOR UPDATE TO app_definer
  USING (true) WITH CHECK (true);
-- Only retention clean-up deletes, and only long-dead rows (see session_create).
CREATE POLICY sessions_definer_delete ON app.sessions FOR DELETE TO app_definer
  USING (absolute_expires_at < now() - interval '30 days');

-- ID tokens used to create a session (replay resistance, D-034): one session per ID token.
CREATE TABLE app.consumed_id_tokens (
  token_hash  bytea       PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consumed_id_tokens_expiry_idx ON app.consumed_id_tokens (expires_at);
ALTER TABLE app.consumed_id_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.consumed_id_tokens FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON app.consumed_id_tokens TO app_definer;
CREATE POLICY consumed_definer_select ON app.consumed_id_tokens FOR SELECT TO app_definer
  USING (true);
CREATE POLICY consumed_definer_insert ON app.consumed_id_tokens FOR INSERT TO app_definer
  WITH CHECK (true);
-- An entry may be removed only once the ID token itself has expired (it can no longer verify).
CREATE POLICY consumed_definer_delete ON app.consumed_id_tokens FOR DELETE TO app_definer
  USING (expires_at < now() - interval '10 minutes');

------------------------------------------------------------------------------------------------
-- Internal helpers (no EXECUTE grant to any login role; called only by the functions below)
------------------------------------------------------------------------------------------------

CREATE FUNCTION app.revoke_account_sessions(p_account uuid, p_reason text) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_count integer;
BEGIN
  UPDATE app.sessions s SET revoked_at = now(), revoked_reason = p_reason
  WHERE s.account_id = p_account AND s.revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

-- The operator behind a request, derived from a live MFA operator session (B-03). Never from a
-- caller-supplied id.
CREATE FUNCTION app.operator_from_session(p_session bytea)
  RETURNS TABLE (account_id uuid, session_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT s.account_id, s.id
    FROM app.sessions s JOIN app.accounts a ON a.id = s.account_id
    WHERE s.token_hash = p_session
      AND s.kind = 'operator' AND s.mfa
      AND s.revoked_at IS NULL
      AND now() < s.idle_expires_at AND now() < s.absolute_expires_at
      AND a.kind = 'operator' AND a.status = 'active' AND a.issuer IS NOT NULL
    FOR SHARE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operator session not valid' USING ERRCODE = 'PTA01';
  END IF;
END
$$;

CREATE FUNCTION app.write_operator_audit(
  p_operation uuid, p_operator uuid, p_session uuid, p_action text, p_reason text,
  p_tenant uuid, p_target_account uuid, p_details jsonb
) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    INSERT INTO app.operator_audit (operation_id, operator_id, operator_account, operator_session,
                                    action, reason, target_tenant, target_account, details)
    VALUES (p_operation, p_operator::text, p_operator, p_session, p_action, p_reason, p_tenant,
            p_target_account, p_details)
  $$;

-- The active owner membership of an active tenant must point at an active, linked account.
CREATE FUNCTION app.assert_tenant_owned(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  PERFORM 1
  FROM app.memberships m JOIN app.accounts a ON a.id = m.account_id
  WHERE m.tenant_id = p_tenant AND m.role = 'owner' AND m.status = 'active'
    AND a.status = 'active' AND a.issuer IS NOT NULL
  FOR SHARE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an active tenant needs an active owner' USING ERRCODE = 'PTO01';
  END IF;
END
$$;

-- True if the account is the active owner of any ACTIVE tenant (deactivating or unlinking it
-- would orphan that tenant).
CREATE FUNCTION app.owns_active_tenant(p_account uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM app.memberships m JOIN app.tenants t ON t.id = m.tenant_id
      WHERE m.account_id = p_account AND m.role = 'owner' AND m.status = 'active'
        AND t.status = 'active')
  $$;

------------------------------------------------------------------------------------------------
-- Sessions (executable by app_runtime only)
------------------------------------------------------------------------------------------------

CREATE FUNCTION app.session_create(
  p_token_hash          bytea,
  p_id_token_hash       bytea,
  p_id_token_expires_at timestamptz,
  p_issuer              text,
  p_subject             text,
  p_kind                text,
  p_mfa                 boolean,
  p_auth_time           timestamptz,
  p_client_id           text,
  p_idp_session_id      text,
  p_idle_seconds        integer,
  p_absolute_expires_at timestamptz,
  p_replaces            bytea
) RETURNS TABLE (session_id uuid, idle_expires_at timestamptz, absolute_expires_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_account uuid;
  v_idle    interval := make_interval(secs => p_idle_seconds);
  -- The ceiling is applied with the DATABASE clock, so API/database clock skew cannot violate the
  -- table's ceiling constraints: owners 8 h, operators 1 h (and the caller's auth_time bound).
  v_abs     timestamptz := least(p_absolute_expires_at,
                                 now() + CASE p_kind WHEN 'owner' THEN interval '8 hours'
                                                     ELSE interval '1 hour' END);
BEGIN
  IF v_abs <= now() + interval '1 minute' THEN
    RAISE EXCEPTION 'login is too close to expiry' USING ERRCODE = 'PTA01';
  END IF;
  -- Bounded retention clean-up (never more than 100 rows per login).
  DELETE FROM app.consumed_id_tokens c WHERE c.token_hash IN (
    SELECT x.token_hash FROM app.consumed_id_tokens x
    WHERE x.expires_at < now() - interval '10 minutes' LIMIT 100);
  DELETE FROM app.sessions s WHERE s.id IN (
    SELECT x.id FROM app.sessions x
    WHERE x.absolute_expires_at < now() - interval '30 days' LIMIT 100);

  -- Replay: one session per ID token, ever.
  INSERT INTO app.consumed_id_tokens (token_hash, expires_at)
  VALUES (p_id_token_hash, p_id_token_expires_at)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ID token already used' USING ERRCODE = 'PTR01';
  END IF;

  -- The identity must map to an ACTIVE account of the requested kind. FOR SHARE serialises with
  -- deactivation and unlinking (which lock the account FOR UPDATE).
  SELECT a.id INTO v_account FROM app.accounts a
  WHERE a.issuer = p_issuer AND a.subject = p_subject AND a.kind = p_kind AND a.status = 'active'
  FOR SHARE;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'no active account for this identity' USING ERRCODE = 'PTA01';
  END IF;

  -- Rotation (fixation protection): the browser's previous session, if any, ends now.
  IF p_replaces IS NOT NULL THEN
    UPDATE app.sessions s SET revoked_at = now(), revoked_reason = 'rotated'
    WHERE s.token_hash = p_replaces AND s.revoked_at IS NULL;
  END IF;

  RETURN QUERY
    INSERT INTO app.sessions AS s (token_hash, account_id, kind, mfa, auth_time, client_id,
                                   idp_session_id, idle_timeout, idle_expires_at,
                                   absolute_expires_at)
    VALUES (p_token_hash, v_account, p_kind, p_mfa, p_auth_time, p_client_id, p_idp_session_id,
            v_idle, least(now() + v_idle, v_abs), v_abs)
    RETURNING s.id, s.idle_expires_at, s.absolute_expires_at;
END
$$;

-- Validates a session for the given kind and extends its idle expiry (at most every 30 s, never
-- past the absolute expiry). Returns no row for an unknown, revoked, expired or wrong-kind
-- session, or one whose account is no longer active.
CREATE FUNCTION app.session_validate(p_token_hash bytea, p_kind text)
  RETURNS TABLE (session_id uuid, account_id uuid, absolute_expires_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  SELECT s.id INTO v_id
  FROM app.sessions s JOIN app.accounts a ON a.id = s.account_id
  WHERE s.token_hash = p_token_hash AND s.kind = p_kind AND s.revoked_at IS NULL
    AND now() < s.idle_expires_at AND now() < s.absolute_expires_at
    AND (s.kind <> 'operator' OR s.mfa)
    AND a.kind = p_kind AND a.status = 'active' AND a.issuer IS NOT NULL;
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE app.sessions s
  SET last_seen_at = now(),
      idle_expires_at = least(now() + s.idle_timeout, s.absolute_expires_at)
  WHERE s.id = v_id AND s.last_seen_at < now() - interval '30 seconds';
  RETURN QUERY
    SELECT s.id, s.account_id, s.absolute_expires_at FROM app.sessions s WHERE s.id = v_id;
END
$$;

CREATE FUNCTION app.session_revoke(p_token_hash bytea) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  UPDATE app.sessions s SET revoked_at = now(), revoked_reason = 'logout'
  WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL;
  RETURN FOUND;
END
$$;

------------------------------------------------------------------------------------------------
-- Operator: tenants (executable by app_operator only)
------------------------------------------------------------------------------------------------

CREATE FUNCTION app.operator_provision_tenant(
  p_session       bytea,
  p_operation     uuid,
  p_reason        text,
  p_slug          text,
  p_display_name  text,
  p_owner_issuer  text,
  p_owner_subject text
) RETURNS TABLE (slug text, display_name text, status text, owner_account uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_op      record;
  v_tenant  uuid;
  v_account uuid;
  v_kind    text;
  v_status  text;
BEGIN
  SELECT * INTO v_op FROM app.operator_from_session(p_session);

  SELECT a.id, a.kind, a.status INTO v_account, v_kind, v_status
  FROM app.accounts a WHERE a.issuer = p_owner_issuer AND a.subject = p_owner_subject
  FOR UPDATE;
  IF v_account IS NOT NULL AND v_kind <> 'owner' THEN
    RAISE EXCEPTION 'identity is bound to another account kind' USING ERRCODE = 'PTK01';
  END IF;
  IF v_account IS NOT NULL AND v_status <> 'active' THEN
    RAISE EXCEPTION 'owner account is not active' USING ERRCODE = 'PTS01';
  END IF;

  INSERT INTO app.tenants (slug, display_name, status)
  VALUES (p_slug, p_display_name, 'active')
  RETURNING id INTO v_tenant;

  IF v_account IS NULL THEN
    INSERT INTO app.accounts (issuer, subject, kind)
    VALUES (p_owner_issuer, p_owner_subject, 'owner')
    RETURNING id INTO v_account;
  END IF;

  INSERT INTO app.memberships (tenant_id, account_id, role, status)
  VALUES (v_tenant, v_account, 'owner', 'active');

  PERFORM app.write_operator_audit(p_operation, v_op.account_id, v_op.session_id,
    'tenant.provision', p_reason, v_tenant, v_account, NULL);

  RETURN QUERY
    SELECT t.slug, t.display_name, t.status, v_account FROM app.tenants t WHERE t.id = v_tenant;
END
$$;

CREATE FUNCTION app.operator_set_tenant_status(
  p_session         bytea,
  p_operation       uuid,
  p_reason          text,
  p_slug            text,
  p_expected_status text,
  p_new_status      text
) RETURNS TABLE (slug text, display_name text, status text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_op      record;
  v_tenant  uuid;
  v_current text;
  v_owner   uuid;
BEGIN
  SELECT * INTO v_op FROM app.operator_from_session(p_session);
  IF NOT (
       (p_expected_status = 'active'    AND p_new_status IN ('suspended', 'retired'))
    OR (p_expected_status = 'suspended' AND p_new_status IN ('active', 'retired'))
  ) THEN
    RAISE EXCEPTION 'invalid tenant status transition' USING ERRCODE = 'PTI01';
  END IF;

  SELECT t.id, t.status INTO v_tenant, v_current
  FROM app.tenants t WHERE t.slug = p_slug
  FOR UPDATE;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'PTN01';
  END IF;
  IF v_current <> p_expected_status THEN
    RAISE EXCEPTION 'tenant status changed concurrently' USING ERRCODE = 'PTC01';
  END IF;

  -- Reactivation needs an active, linked owner (no ownerless active tenant).
  IF p_new_status = 'active' THEN
    PERFORM app.assert_tenant_owned(v_tenant);
  END IF;

  UPDATE app.tenants t SET status = p_new_status, updated_at = now() WHERE t.id = v_tenant;

  -- Suspension and retirement end the owner's sessions (the API also re-checks tenant status on
  -- every request; this makes the cut-off visible immediately).
  IF p_new_status IN ('suspended', 'retired') THEN
    SELECT m.account_id INTO v_owner FROM app.memberships m
    WHERE m.tenant_id = v_tenant AND m.role = 'owner' AND m.status = 'active';
    IF v_owner IS NOT NULL THEN
      PERFORM app.revoke_account_sessions(v_owner,
        CASE p_new_status WHEN 'suspended' THEN 'tenant_suspended' ELSE 'tenant_retired' END);
    END IF;
  END IF;

  PERFORM app.write_operator_audit(p_operation, v_op.account_id, v_op.session_id,
    'tenant.status.' || p_expected_status || '_to_' || p_new_status, p_reason, v_tenant, v_owner,
    NULL);

  RETURN QUERY
    SELECT t.slug, t.display_name, t.status FROM app.tenants t WHERE t.id = v_tenant;
END
$$;

-- Read model for compare-and-set lifecycle calls: the tenant and its current active owner.
CREATE FUNCTION app.operator_get_tenant(p_session bytea, p_slug text)
  RETURNS TABLE (slug text, display_name text, status text, owner_account uuid,
                 owner_status text, owner_issuer text, owner_subject text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
BEGIN
  PERFORM 1 FROM app.operator_from_session(p_session);
  RETURN QUERY
    SELECT t.slug, t.display_name, t.status, a.id, a.status, a.issuer, a.subject
    FROM app.tenants t
    LEFT JOIN app.memberships m
      ON m.tenant_id = t.id AND m.role = 'owner' AND m.status = 'active'
    LEFT JOIN app.accounts a ON a.id = m.account_id
    WHERE t.slug = p_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'PTN01';
  END IF;
END
$$;

------------------------------------------------------------------------------------------------
-- Operator: owner account lifecycle (E-01, D-036; executable by app_operator only)
------------------------------------------------------------------------------------------------

CREATE FUNCTION app.operator_get_account(p_session bytea, p_account uuid)
  RETURNS TABLE (account_id uuid, kind text, status text, issuer text, subject text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
BEGIN
  PERFORM 1 FROM app.operator_from_session(p_session);
  RETURN QUERY
    SELECT a.id, a.kind, a.status, a.issuer, a.subject FROM app.accounts a
    WHERE a.id = p_account AND a.kind = 'owner';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'PTN01';
  END IF;
END
$$;

-- Locks and returns an OWNER account (FOR UPDATE); raises PTN01 if absent or not an owner.
CREATE FUNCTION app.lock_owner_account(p_account uuid)
  RETURNS TABLE (status text, issuer text, subject text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT a.status, a.issuer, a.subject FROM app.accounts a
    WHERE a.id = p_account AND a.kind = 'owner'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'PTN01';
  END IF;
END
$$;

CREATE FUNCTION app.operator_set_account_status(
  p_session         bytea,
  p_operation       uuid,
  p_reason          text,
  p_account         uuid,
  p_expected_status text,
  p_new_status      text
) RETURNS TABLE (account_id uuid, status text, sessions_revoked integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_op      record;
  v_acc     record;
  v_revoked integer := 0;
BEGIN
  SELECT * INTO v_op FROM app.operator_from_session(p_session);
  IF NOT ((p_expected_status = 'active' AND p_new_status = 'deactivated')
       OR (p_expected_status = 'deactivated' AND p_new_status = 'active')) THEN
    RAISE EXCEPTION 'invalid account status transition' USING ERRCODE = 'PTI01';
  END IF;
  SELECT * INTO v_acc FROM app.lock_owner_account(p_account);
  IF v_acc.status <> p_expected_status THEN
    RAISE EXCEPTION 'account status changed concurrently' USING ERRCODE = 'PTC01';
  END IF;
  IF p_new_status = 'deactivated' THEN
    IF app.owns_active_tenant(p_account) THEN
      RAISE EXCEPTION 'account owns an active tenant' USING ERRCODE = 'PTO01';
    END IF;
  ELSIF v_acc.issuer IS NULL THEN
    RAISE EXCEPTION 'an unlinked account cannot be reactivated' USING ERRCODE = 'PTI01';
  END IF;

  UPDATE app.accounts a SET status = p_new_status, updated_at = now() WHERE a.id = p_account;
  IF p_new_status = 'deactivated' THEN
    v_revoked := app.revoke_account_sessions(p_account, 'account_deactivated');
  END IF;

  PERFORM app.write_operator_audit(p_operation, v_op.account_id, v_op.session_id,
    'account.status.' || p_expected_status || '_to_' || p_new_status, p_reason, NULL, p_account,
    NULL);
  RETURN QUERY SELECT p_account, p_new_status, v_revoked;
END
$$;

-- Revokes the owner membership of a NON-active tenant (an active tenant may never be ownerless:
-- suspend it first, or transfer ownership instead).
CREATE FUNCTION app.operator_revoke_owner_membership(
  p_session        bytea,
  p_operation      uuid,
  p_reason         text,
  p_slug           text,
  p_expected_owner uuid
) RETURNS TABLE (slug text, status text, sessions_revoked integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_op      record;
  v_tenant  uuid;
  v_status  text;
  v_owner   uuid;
  v_revoked integer;
BEGIN
  SELECT * INTO v_op FROM app.operator_from_session(p_session);
  SELECT t.id, t.status INTO v_tenant, v_status FROM app.tenants t WHERE t.slug = p_slug
  FOR UPDATE;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'PTN01';
  END IF;
  SELECT m.account_id INTO v_owner FROM app.memberships m
  WHERE m.tenant_id = v_tenant AND m.role = 'owner' AND m.status = 'active'
  FOR UPDATE;
  IF v_owner IS DISTINCT FROM p_expected_owner OR v_owner IS NULL THEN
    RAISE EXCEPTION 'tenant owner changed concurrently' USING ERRCODE = 'PTC01';
  END IF;
  IF v_status = 'active' THEN
    RAISE EXCEPTION 'an active tenant needs an active owner' USING ERRCODE = 'PTO01';
  END IF;

  UPDATE app.memberships m SET status = 'revoked', updated_at = now()
  WHERE m.tenant_id = v_tenant AND m.account_id = v_owner;
  v_revoked := app.revoke_account_sessions(v_owner, 'membership_revoked');

  PERFORM app.write_operator_audit(p_operation, v_op.account_id, v_op.session_id,
    'tenant.owner.revoke', p_reason, v_tenant, v_owner, NULL);
  RETURN QUERY SELECT p_slug, v_status, v_revoked;
END
$$;

-- Controlled ownership transfer: compare-and-set on the current owner (NULL = currently none),
-- the new owner identity must not be an operator and must not be a deactivated account. Both
-- the previous and the new owner's sessions are rotated (privilege change).
CREATE FUNCTION app.operator_transfer_ownership(
  p_session        bytea,
  p_operation      uuid,
  p_reason         text,
  p_slug           text,
  p_expected_owner uuid,
  p_new_issuer     text,
  p_new_subject    text
) RETURNS TABLE (slug text, status text, owner_account uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_op     record;
  v_tenant uuid;
  v_status text;
  v_old    uuid;
  v_new    uuid;
  v_kind   text;
  v_astat  text;
BEGIN
  SELECT * INTO v_op FROM app.operator_from_session(p_session);
  SELECT t.id, t.status INTO v_tenant, v_status FROM app.tenants t WHERE t.slug = p_slug
  FOR UPDATE;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'PTN01';
  END IF;
  IF v_status = 'retired' THEN
    RAISE EXCEPTION 'a retired tenant cannot change owner' USING ERRCODE = 'PTI01';
  END IF;
  SELECT m.account_id INTO v_old FROM app.memberships m
  WHERE m.tenant_id = v_tenant AND m.role = 'owner' AND m.status = 'active'
  FOR UPDATE;
  IF v_old IS DISTINCT FROM p_expected_owner THEN
    RAISE EXCEPTION 'tenant owner changed concurrently' USING ERRCODE = 'PTC01';
  END IF;

  SELECT a.id, a.kind, a.status INTO v_new, v_kind, v_astat FROM app.accounts a
  WHERE a.issuer = p_new_issuer AND a.subject = p_new_subject
  FOR UPDATE;
  IF v_new IS NOT NULL AND v_kind <> 'owner' THEN
    RAISE EXCEPTION 'identity is bound to another account kind' USING ERRCODE = 'PTK01';
  END IF;
  IF v_new IS NOT NULL AND v_astat <> 'active' THEN
    RAISE EXCEPTION 'new owner account is not active' USING ERRCODE = 'PTS01';
  END IF;
  IF v_new IS NOT NULL AND v_new = v_old THEN
    RAISE EXCEPTION 'the new owner is the current owner' USING ERRCODE = 'PTI01';
  END IF;
  IF v_new IS NULL THEN
    INSERT INTO app.accounts (issuer, subject, kind) VALUES (p_new_issuer, p_new_subject, 'owner')
    RETURNING id INTO v_new;
  END IF;

  IF v_old IS NOT NULL THEN
    UPDATE app.memberships m SET status = 'revoked', updated_at = now()
    WHERE m.tenant_id = v_tenant AND m.account_id = v_old;
    PERFORM app.revoke_account_sessions(v_old, 'ownership_transferred');
  END IF;
  INSERT INTO app.memberships (tenant_id, account_id, role, status)
  VALUES (v_tenant, v_new, 'owner', 'active')
  ON CONFLICT (tenant_id, account_id) DO UPDATE SET status = 'active', updated_at = now();
  PERFORM app.revoke_account_sessions(v_new, 'privilege_changed');

  PERFORM app.write_operator_audit(p_operation, v_op.account_id, v_op.session_id,
    'tenant.owner.transfer', p_reason, v_tenant, v_new,
    jsonb_build_object('previous_owner', v_old));
  RETURN QUERY SELECT p_slug, v_status, v_new;
END
$$;

-- Unlinks the identity from an owner account (e.g. a compromised or lost identity). The account
-- is deactivated and every session ends. Refused while the account owns an active tenant.
CREATE FUNCTION app.operator_unlink_account_identity(
  p_session          bytea,
  p_operation        uuid,
  p_reason           text,
  p_account          uuid,
  p_expected_issuer  text,
  p_expected_subject text
) RETURNS TABLE (account_id uuid, status text, sessions_revoked integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_op      record;
  v_acc     record;
  v_revoked integer;
BEGIN
  SELECT * INTO v_op FROM app.operator_from_session(p_session);
  SELECT * INTO v_acc FROM app.lock_owner_account(p_account);
  IF v_acc.issuer IS DISTINCT FROM p_expected_issuer
     OR v_acc.subject IS DISTINCT FROM p_expected_subject OR v_acc.issuer IS NULL THEN
    RAISE EXCEPTION 'account identity changed concurrently' USING ERRCODE = 'PTC01';
  END IF;
  IF app.owns_active_tenant(p_account) THEN
    RAISE EXCEPTION 'account owns an active tenant' USING ERRCODE = 'PTO01';
  END IF;

  UPDATE app.accounts a SET issuer = NULL, subject = NULL, status = 'deactivated',
                            updated_at = now()
  WHERE a.id = p_account;
  v_revoked := app.revoke_account_sessions(p_account, 'identity_unlinked');

  PERFORM app.write_operator_audit(p_operation, v_op.account_id, v_op.session_id,
    'account.identity.unlink', p_reason, NULL, p_account,
    jsonb_build_object('previous_issuer', v_acc.issuer, 'previous_subject', v_acc.subject));
  RETURN QUERY SELECT p_account, 'deactivated'::text, v_revoked;
END
$$;

-- Links a new identity to an UNLINKED owner account. The account stays deactivated: reactivation
-- is a separate, explicitly audited step (two-step re-linking).
CREATE FUNCTION app.operator_link_account_identity(
  p_session     bytea,
  p_operation   uuid,
  p_reason      text,
  p_account     uuid,
  p_new_issuer  text,
  p_new_subject text
) RETURNS TABLE (account_id uuid, status text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_op  record;
  v_acc record;
BEGIN
  SELECT * INTO v_op FROM app.operator_from_session(p_session);
  SELECT * INTO v_acc FROM app.lock_owner_account(p_account);
  IF v_acc.issuer IS NOT NULL THEN
    RAISE EXCEPTION 'account is already linked' USING ERRCODE = 'PTC01';
  END IF;
  PERFORM 1 FROM app.accounts a WHERE a.issuer = p_new_issuer AND a.subject = p_new_subject;
  IF FOUND THEN
    RAISE EXCEPTION 'identity is already bound to an account' USING ERRCODE = 'PTB01';
  END IF;

  UPDATE app.accounts a SET issuer = p_new_issuer, subject = p_new_subject, updated_at = now()
  WHERE a.id = p_account;
  PERFORM app.revoke_account_sessions(p_account, 'identity_linked');

  PERFORM app.write_operator_audit(p_operation, v_op.account_id, v_op.session_id,
    'account.identity.link', p_reason, NULL, p_account,
    jsonb_build_object('issuer', p_new_issuer, 'subject', p_new_subject));
  RETURN QUERY SELECT p_account, v_acc.status;
END
$$;

-- B-02: resolves an uncertain outcome. The audit row is written in the same transaction as the
-- change, so it exists if and only if the operation committed.
CREATE FUNCTION app.operator_operation_outcome(p_session bytea, p_operation uuid)
  RETURNS TABLE (applied boolean, action text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
BEGIN
  PERFORM 1 FROM app.operator_from_session(p_session);
  RETURN QUERY
    SELECT EXISTS (SELECT 1 FROM app.operator_audit o WHERE o.operation_id = p_operation),
           (SELECT o.action FROM app.operator_audit o WHERE o.operation_id = p_operation);
END
$$;

------------------------------------------------------------------------------------------------
-- Ownership and grants
------------------------------------------------------------------------------------------------

-- Belt and braces on top of the 0005 default privileges (while app_owner still owns them).
REVOKE ALL ON FUNCTION app.revoke_account_sessions(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.operator_from_session(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.write_operator_audit(uuid, uuid, uuid, text, text, uuid, uuid, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_tenant_owned(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.owns_active_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lock_owner_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.session_create(bytea, bytea, timestamptz, text, text, text, boolean,
  timestamptz, text, text, integer, timestamptz, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.session_validate(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.session_revoke(bytea) FROM PUBLIC;


GRANT EXECUTE ON FUNCTION app.session_create(bytea, bytea, timestamptz, text, text, text, boolean,
  timestamptz, text, text, integer, timestamptz, bytea) TO app_runtime;
GRANT EXECUTE ON FUNCTION app.session_validate(bytea, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app.session_revoke(bytea) TO app_runtime;

GRANT EXECUTE ON FUNCTION app.operator_provision_tenant(bytea, uuid, text, text, text, text, text)
  TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_set_tenant_status(bytea, uuid, text, text, text, text)
  TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_get_tenant(bytea, text) TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_get_account(bytea, uuid) TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_set_account_status(bytea, uuid, text, uuid, text, text)
  TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_revoke_owner_membership(bytea, uuid, text, text, uuid)
  TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_transfer_ownership(bytea, uuid, text, text, uuid, text, text)
  TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_unlink_account_identity(bytea, uuid, text, uuid, text, text)
  TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_link_account_identity(bytea, uuid, text, uuid, text, text)
  TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_operation_outcome(bytea, uuid) TO app_operator;

-- Ownership moves to the definer last: the grants above carry over with it.
ALTER FUNCTION app.revoke_account_sessions(uuid, text) OWNER TO app_definer;
ALTER FUNCTION app.operator_from_session(bytea) OWNER TO app_definer;
ALTER FUNCTION app.write_operator_audit(uuid, uuid, uuid, text, text, uuid, uuid, jsonb)
  OWNER TO app_definer;
ALTER FUNCTION app.assert_tenant_owned(uuid) OWNER TO app_definer;
ALTER FUNCTION app.owns_active_tenant(uuid) OWNER TO app_definer;
ALTER FUNCTION app.lock_owner_account(uuid) OWNER TO app_definer;
ALTER FUNCTION app.session_create(bytea, bytea, timestamptz, text, text, text, boolean,
  timestamptz, text, text, integer, timestamptz, bytea) OWNER TO app_definer;
ALTER FUNCTION app.session_validate(bytea, text) OWNER TO app_definer;
ALTER FUNCTION app.session_revoke(bytea) OWNER TO app_definer;
ALTER FUNCTION app.operator_provision_tenant(bytea, uuid, text, text, text, text, text)
  OWNER TO app_definer;
ALTER FUNCTION app.operator_set_tenant_status(bytea, uuid, text, text, text, text)
  OWNER TO app_definer;
ALTER FUNCTION app.operator_get_tenant(bytea, text) OWNER TO app_definer;
ALTER FUNCTION app.operator_get_account(bytea, uuid) OWNER TO app_definer;
ALTER FUNCTION app.operator_set_account_status(bytea, uuid, text, uuid, text, text)
  OWNER TO app_definer;
ALTER FUNCTION app.operator_revoke_owner_membership(bytea, uuid, text, text, uuid)
  OWNER TO app_definer;
ALTER FUNCTION app.operator_transfer_ownership(bytea, uuid, text, text, uuid, text, text)
  OWNER TO app_definer;
ALTER FUNCTION app.operator_unlink_account_identity(bytea, uuid, text, uuid, text, text)
  OWNER TO app_definer;
ALTER FUNCTION app.operator_link_account_identity(bytea, uuid, text, uuid, text, text)
  OWNER TO app_definer;
ALTER FUNCTION app.operator_operation_outcome(bytea, uuid) OWNER TO app_definer;
