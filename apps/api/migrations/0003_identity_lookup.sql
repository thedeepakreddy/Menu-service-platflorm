-- 0003 — Identity lookup (Phase 2, M2.3; decisions D-025, D-027, D-028).
--
-- The runtime role has no access to app.accounts. After the API has verified an identity token,
-- it maps the token's (issuer, subject) to a platform account through this function. It never
-- creates accounts: accounts are created by provisioning and invitation acceptance (M2.4), so an
-- unknown identity simply has no access. The kind must match: an owner identity is never
-- returned as an operator and vice versa.

CREATE FUNCTION app.find_account(p_issuer text, p_subject text, p_kind text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT a.id FROM app.accounts a
    WHERE a.issuer = p_issuer AND a.subject = p_subject AND a.kind = p_kind
  $$;

REVOKE ALL ON FUNCTION app.find_account(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_account(text, text, text) TO app_runtime;
