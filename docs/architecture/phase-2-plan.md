# Phase 2 — Tenant & Identity: implementation plan

**Authority:** Doc 05 §11, §13 (Phase 2); owner authorization 2026-11-27, conditional on the
Phase 1 closure gate (satisfied: STATUS.md → "Phase 1 formal closure"). Decisions D-022 and
D-024 – D-031. Phase 2 also carries the verification that Doc 05 §11 originally put in the Phase 1
gate: **tenant model and authentication boundary** (D-022).

## Scope (Doc 05 §13 Phase 2)

"Define and verify tenant resolution and owner account lifecycle, server-side tenant context,
permissions, tenant-owned resource policies and isolation tests. Implement shared-database
approach with appropriate isolation controls and tenant-safe cache/job boundaries. Exit:
isolation/authentication/authorization negative tests and lifecycle verification." The §11 exit
gate adds the **onboarding foundation** (SEQ-1: tenant and owner provisioning only, no owner UI
flow).

**Out of scope:** any menu, content, media, QR, offers, publishing, analytics, AI, customer or
owner UI (Phases 3–9); ordering, payments, POS, staff roles (excluded from MVP).

## Milestones

| #    | Milestone                                          | Decisions           | Acceptance criteria                                                                                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2.1 | Database foundation and isolation                  | D-024, D-028, D-029 | Kysely/pg; validated `API_DATABASE_URL`; SQL migration runner (as `app_owner`); schema with tenants, accounts, memberships, operator audit; RLS + FORCE on every tenant-owned table; `withTenant()`; real-PostgreSQL negative tests (cross-tenant, no/empty/bad context, pool reuse, concurrency, privileges, policy catalog); CI runs them |
| M2.2 | Tenant resolution and context                      | D-027, D-031        | Slug contract; public resolution of active tenants only, tenant-safe 404; `TenantContext` passed only into `withTenant()`; rate-limited; tests including spoofed/unknown/suspended tenants                                                                                                                                                  |
| M2.3 | Identity and authorization boundary                | D-025, D-030        | `jose` verifier (alg allowlist, iss/aud/exp/nbf); separate owner and operator trust domains; account mapping by `(issuer, subject)`; membership check before any tenant data; negative tests (no token, bad signature, wrong issuer/audience, expired, owner token on operator route, owner of A on tenant B)                               |
| M2.4 | Provisioning and lifecycle (onboarding foundation) | D-027, D-028        | Operator-only, audited `SECURITY DEFINER` paths: provision tenant with an owner invitation; activate, suspend, reactivate; lifecycle tests (suspended tenant invisible publicly, owner access denied)                                                                                                                                       |
| M2.5 | Abuse controls                                     | D-031               | In-process rate limiter on resolution and identity-relevant endpoints; `429` envelope with `Retry-After`; bounded key table; tests                                                                                                                                                                                                          |
| M2.6 | Web BFF session                                    | D-025, D-030        | **Blocked on the D-025 vendor choice.** OIDC code flow + PKCE in `apps/web`, encrypted HttpOnly session cookie, CSRF/Origin checks, logout                                                                                                                                                                                                  |

## Phase 2 exit gate (definition of done)

1. M2.1 – M2.5 done with tests; M2.6 done or explicitly deferred by the owner.
2. Negative isolation, authentication and authorization tests pass against real PostgreSQL in CI.
3. Tenant lifecycle verified (provision → active → suspended → reactivated).
4. Every tenant-owned table passes the RLS catalog test.
5. Full gate set and CI green on the gate commit; governance records updated; no unexplained
   HIGH/CRITICAL findings.

## Risk register

| Risk                                           | Mitigation                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Tenant context leaks across pooled connections | Transaction-local context only; source scan test forbids session-level `SET`; pool-reuse test |
| A new table without RLS                        | Catalog test fails CI                                                                         |
| Owner bypass through table ownership           | `FORCE` on every table; runtime role owns nothing                                             |
| Operator over-privilege                        | No BYPASSRLS; narrow `SECURITY DEFINER` functions; audit                                      |
| Token confusion between owner and operator     | Separate issuer/audience configuration; negative tests                                        |
| Vendor not chosen (M2.6 blocked)               | Provider port; local test issuer; owner decision requested                                    |
| CI PostgreSQL availability                     | Use the runner's preinstalled PostgreSQL; a failing database step fails CI (never skips)      |
