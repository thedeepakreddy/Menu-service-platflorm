-- 0002 — Public tenant resolution (Phase 2, M2.2; decision D-027).
--
-- The runtime role can see only the tenant in its current context (0001 policy tenants_own_row).
-- Resolving a public URL slug to a tenant is a cross-tenant lookup, so it goes through this one
-- narrow SECURITY DEFINER function, which:
--   * returns at most one row, and only for an ACTIVE tenant: unknown, suspended and retired
--     tenants are indistinguishable to the caller (Doc 03 §3, §20: tenant-safe fallback);
--   * returns only the id (for server-side context; never sent to clients) and public fields;
--   * pins search_path so a caller cannot redirect `app.tenants` to an object of its own;
--   * is executable only by app_runtime.

CREATE FUNCTION app.resolve_active_tenant(p_slug text)
  RETURNS TABLE (id uuid, slug text, display_name text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT t.id, t.slug, t.display_name
    FROM app.tenants t
    WHERE t.slug = p_slug AND t.status = 'active'
  $$;

REVOKE ALL ON FUNCTION app.resolve_active_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_active_tenant(text) TO app_runtime;
