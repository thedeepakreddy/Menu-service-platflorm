-- 0004 — Operator tenant provisioning and lifecycle (Phase 2, M2.4; decisions D-027, D-028).
--
-- Cross-tenant operator actions go only through these SECURITY DEFINER functions (owned by
-- app_owner, executable ONLY by app_operator; no BYPASSRLS anywhere). Each call is one
-- transaction: it either fully applies and writes an operator_audit row, or changes nothing.
-- The API additionally logs every operator action before calling, because an audit row rolls
-- back with a failed transaction (D-028).
--
-- Error codes (SQLSTATE) mapped by the API:
--   PTN01 tenant not found          PTC01 status conflict (stale expected status)
--   PTI01 invalid status transition PTK01 identity already bound to another account kind
--   23505 unique violation (slug taken)   23514 check violation (invalid input)
--
-- Lifecycle (D-027): active <-> suspended; active|suspended -> retired; retired is terminal.

CREATE FUNCTION app.operator_provision_tenant(
  p_operator_id   text,
  p_reason        text,
  p_slug          text,
  p_display_name  text,
  p_owner_issuer  text,
  p_owner_subject text
) RETURNS TABLE (tenant_id uuid, slug text, display_name text, status text)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_tenant  uuid;
  v_account uuid;
  v_kind    text;
BEGIN
  -- The owner identity must not already belong to an operator account (trust domains, D-025).
  SELECT a.id, a.kind INTO v_account, v_kind
  FROM app.accounts a WHERE a.issuer = p_owner_issuer AND a.subject = p_owner_subject;
  IF v_account IS NOT NULL AND v_kind <> 'owner' THEN
    RAISE EXCEPTION 'identity is bound to another account kind' USING ERRCODE = 'PTK01';
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

  INSERT INTO app.operator_audit (operator_id, action, reason, target_tenant)
  VALUES (p_operator_id, 'tenant.provision', p_reason, v_tenant);

  RETURN QUERY
    SELECT t.id, t.slug, t.display_name, t.status FROM app.tenants t WHERE t.id = v_tenant;
END
$$;

CREATE FUNCTION app.operator_set_tenant_status(
  p_operator_id     text,
  p_reason          text,
  p_slug            text,
  p_expected_status text,
  p_new_status      text
) RETURNS TABLE (tenant_id uuid, slug text, display_name text, status text)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
#variable_conflict use_column
DECLARE
  v_tenant  uuid;
  v_current text;
BEGIN
  IF NOT (
       (p_expected_status = 'active'    AND p_new_status IN ('suspended', 'retired'))
    OR (p_expected_status = 'suspended' AND p_new_status IN ('active', 'retired'))
  ) THEN
    RAISE EXCEPTION 'invalid tenant status transition' USING ERRCODE = 'PTI01';
  END IF;

  -- Row lock: concurrent changes to the same tenant are serialised; the loser sees the new state.
  SELECT t.id, t.status INTO v_tenant, v_current
  FROM app.tenants t WHERE t.slug = p_slug
  FOR UPDATE;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'PTN01';
  END IF;
  IF v_current <> p_expected_status THEN
    RAISE EXCEPTION 'tenant status changed concurrently' USING ERRCODE = 'PTC01';
  END IF;

  UPDATE app.tenants t SET status = p_new_status, updated_at = now() WHERE t.id = v_tenant;

  INSERT INTO app.operator_audit (operator_id, action, reason, target_tenant)
  VALUES (p_operator_id, 'tenant.status.' || p_expected_status || '_to_' || p_new_status, p_reason, v_tenant);

  RETURN QUERY
    SELECT t.id, t.slug, t.display_name, t.status FROM app.tenants t WHERE t.id = v_tenant;
END
$$;

REVOKE ALL ON FUNCTION app.operator_provision_tenant(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.operator_set_tenant_status(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.operator_provision_tenant(text, text, text, text, text, text) TO app_operator;
GRANT EXECUTE ON FUNCTION app.operator_set_tenant_status(text, text, text, text, text) TO app_operator;
