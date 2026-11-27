-- 0007 — The definer role can no longer create objects (independent review R2-07; D-035).
--
-- 0005 gave app_definer CREATE on schema app because ALTER FUNCTION ... OWNER TO requires the new
-- owner to have CREATE on the schema. That also let the migration role SET ROLE app_definer and
-- create a view or function that runs with the definer's cross-tenant policies (a variant of
-- audit findings A-02/A-04). Ownership hand-over is finished, so the right is revoked; a future
-- migration that hands a new function to app_definer grants CREATE and revokes it again in the
-- same file (the catalog test fails if app_definer keeps it). Without CREATE on any schema
-- (public's CREATE is revoked from PUBLIC by provisioning) the definer can create no function
-- or view at all, so it needs no default privileges of its own (and the migration role could not
-- set them: it does not inherit app_definer).

REVOKE CREATE ON SCHEMA app FROM app_definer;
