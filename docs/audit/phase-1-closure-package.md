# Phase 1 Closure Package

**Prepared:** 2026-11-27, by the implementing Claude session. **Status:** closure-readiness
assessment — **not a closure**. Phase 1 can be formally closed only by the owner. Phase 2 is
**not authorized**.

The exact commits, verification results and mutation evidence are recorded in
[`../STATUS.md`](../STATUS.md) → "Phase 1 completion work". The independent-audit hand-off is
[`phase-1-independent-audit-handoff.md`](phase-1-independent-audit-handoff.md).

## 1. Closure-readiness assessment

| Criterion (owner assignment §18)                  | Status                                       | Evidence / remaining action                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 scope satisfied (Doc 05 §13 work package) | Met                                          | Implementation ledger in STATUS.md; all gates pass from a clean clone                                                                                                                                                           |
| Mandatory Phase 1 gaps resolved                   | **Conditional**                              | G-01: supplement S-02 drafted, **owner approval required**. G-36 and G-38: Phase 1 baseline implemented and verified; their remainder is Phase 2 scope. G-03 – G-08: Phase 2 entry decisions, not Phase 1 deliverables (see §3) |
| Architecture requirements verified                | Met (self-verified)                          | 13 rules, per-rule fixtures, graph integrity, CLI scope, mutation tests                                                                                                                                                         |
| Security requirements verified                    | Met for the Phase 1 baseline (self-verified) | D-019, D-020; tests and mutation results in STATUS.md                                                                                                                                                                           |
| N-01, N-02 resolved                               | Met (self-verified)                          | D-021; fixtures and mutation tests                                                                                                                                                                                              |
| Residual findings documented                      | Met                                          | §4 below; `phase-1-audit-findings.md`                                                                                                                                                                                           |
| Required owner decisions approved                 | **Not met**                                  | §2: D-010 – D-021 (D-011 type-only scope), S-02, I-02, I-03                                                                                                                                                                     |
| Specifications consistent                         | Met (no contradiction found)                 | S-02 §3; originals unchanged (checksums verified)                                                                                                                                                                               |
| Verification suite passes                         | Met                                          | Clean-room results in STATUS.md                                                                                                                                                                                                 |
| Repository clean                                  | Met                                          | Recorded in STATUS.md                                                                                                                                                                                                           |
| Closure package complete                          | Met                                          | This document and the hand-off                                                                                                                                                                                                  |
| Independent audit                                 | **Not met**                                  | All audits so far are self-audits by the implementing session; an auditor who did not implement the work is required, unless the owner records an exception                                                                     |

**Assessment: CONDITIONALLY READY — owner decisions and an independent audit remain.**

## 2. Owner decisions required for Phase 1 closure

| ID    | Decision                                                                                                                                  | Current status                            | Recommendation                                                                                                                     | Consequence of approving                                                                        | Alternative                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D-010 | Boundary graph keeps build output in the graph (`doNotFollow`); anchored exclusions; build-output and module-entry rules                  | Implemented, awaiting review              | **Approve**                                                                                                                        | Locks the corrected enforcement model                                                           | —                                                                     |
| D-011 | `packages/contracts` may depend only on its own sources and zod, **including type-only imports**                                          | Implemented; **type-only scope proposed** | **Approve the strict scope**                                                                                                       | Contracts stay framework-free for browser and server; shared types must be written in contracts | Allow type-only imports from an explicit list (weaker; needs a list)  |
| D-012 | Web may not import listed DB clients/ORMs (denylist)                                                                                      | Implemented, awaiting review              | Approve; extend the list with the database choice (G-40)                                                                           | —                                                                                               | An allowlist of web runtime dependencies (stricter, more maintenance) |
| D-013 | `engineStrict: true`                                                                                                                      | Implemented, awaiting review              | Approve                                                                                                                            | Installs on the wrong Node version fail                                                         | —                                                                     |
| D-014 | `packageManager` pinned with an integrity hash                                                                                            | Implemented, awaiting review              | Approve                                                                                                                            | pnpm upgrades require updating the hash                                                         | —                                                                     |
| D-015 | Supply-chain policy test                                                                                                                  | Implemented, awaiting review              | Approve                                                                                                                            | —                                                                                               | —                                                                     |
| D-016 | Runtime code must not import test files                                                                                                   | Implemented, awaiting review              | Approve                                                                                                                            | —                                                                                               | —                                                                     |
| D-017 | Boundary scan covers all of `tests/`                                                                                                      | Implemented, awaiting review              | Approve                                                                                                                            | —                                                                                               | —                                                                     |
| D-018 | Per-command supply-chain overrides rejected                                                                                               | Implemented, awaiting review              | Approve                                                                                                                            | —                                                                                               | —                                                                     |
| D-019 | Security baseline: CORS default-deny with an exact-origin allowlist, no credentials; API/web security headers; HSTS in staging/production | Implemented, awaiting review              | Approve                                                                                                                            | Cross-origin browser access needs explicit configuration                                        | —                                                                     |
| D-020 | Structured JSON logging, redaction, `API_LOG_LEVEL`, no debug in production; 4xx logged at info                                           | Implemented, awaiting review              | Approve                                                                                                                            | Log consumers must parse JSON lines                                                             | —                                                                     |
| D-021 | devDependency rule covers every workspace file except tests and `vitest.config.*`; CLI scope test                                         | Implemented, awaiting review              | Approve                                                                                                                            | Runtime code outside `src/` is also policed                                                     | Exempt more config files (weaker)                                     |
| S-02  | Architecture supplement (G-01)                                                                                                            | Proposed                                  | **Approve as the Phase 1 architecture baseline**, or provide the full Doc 02                                                       | Closes G-01; OPEN rows remain decisions                                                         | Supply the complete Doc 02                                            |
| I-02  | Old commit `e0fd9eb` (message contains a session link) still fetchable by id; CI runs #1–#4 store old messages                            | Owner decision pending                    | **Accept as residual.** Deleting runs #1–#4 removes the run #1 audit evidence. Purging unreferenced objects needs GitHub Support   | —                                                                                               | Delete the runs and/or ask GitHub Support to purge                    |
| I-03  | Commit author/committer is "Claude" on all non-initial commits                                                                            | Owner decision pending                    | Decide the future author identity. Rewriting existing history is **not recommended** (it would invalidate all recorded commit ids) | —                                                                                               | Configure the owner's identity for future commits                     |
| D-005 | 7-day release age                                                                                                                         | Approved **provisionally**                | Keep provisional; review by Phase 10 as recorded                                                                                   | —                                                                                               | —                                                                     |

**Impact of delay:** Phase 1 stays open. No Phase 1 work is blocked.

## 3. Gap dispositions and decision packages (G-03 – G-08, G-36, G-38)

G-03 – G-08 are product and architecture choices that the owner explicitly reserved ("do not
silently lock": ORM, authentication provider, account recovery, tenant enforcement, RLS strategy
and secrets). Implementing any of them requires Phase 2 work (database, identity, tenancy), which
is not authorized. They are **Phase 2 entry decisions**: they do not block Phase 1 closure, but
they block Phase 2 start. Each package below is a recommendation only.

### G-03 — ORM and migration tooling

- **Problem:** no data-access layer has been chosen. Doc 01 §9 names Prisma as a _proposed_
  baseline, with SQL first-class for RLS, constraints and migrations.
- **Options:**
  - (A) Prisma for the schema and queries, with hand-written SQL migrations for RLS policies.
  - (B) A SQL-first query builder such as Kysely or Drizzle, with SQL migrations.
  - (C) Raw SQL with a thin repository layer.
- **Key risk:** RLS needs the tenant id set per transaction (for example `SET LOCAL`); the chosen
  tool must run every tenant query inside such a transaction on one connection.
- **Recommendation (proposed):** a Phase 2 opening spike that proves per-transaction tenant
  context and RLS enforcement against real PostgreSQL. Adopt (A) if the spike passes; otherwise
  (B).
- **Delay impact:** blocks every Phase 2 schema and data task.

### G-04 — Authentication provider

- **Problem:** owner and operator identity are needed (Doc 04 §3). Each tenant has one owner
  account; operators are separately governed.
- **Options:**
  - (A) A managed OIDC identity provider behind an internal identity port.
  - (B) Self-hosted OIDC, such as Keycloak.
  - (C) In-application sessions with a maintained authentication library and argon2id password
    hashing.
- **Recommendation (proposed):** (A), with separate owner and operator realms or clients and MFA
  required for operators. It reduces in-house handling of credentials and recovery, and the port
  keeps provider independence (Doc 01 §13).
- **Delay impact:** blocks Phase 2 identity.

### G-05 — Account recovery

- **Depends on:** G-04.
- **Recommendation (proposed):** recovery through the provider's verified-e-mail flow, with
  re-verification and audit for operators. No SMS-only recovery. Recovery events are logged
  without secrets (D-020).
- **Delay impact:** blocks owner onboarding (Phase 2 foundation, Phase 6 flow).

### G-06 — Tenant enforcement architecture

- **Problem:** tenant resolution (domain, subdomain, path, QR), propagation and membership.
- **Recommendation (proposed):**
  - A server-only resolver produces an immutable `TenantContext` per request: for public
    traffic, from a verified host or path; for owner traffic, from the authenticated membership,
    never from the URL alone.
  - It propagates through request-scoped async context and explicit job payloads.
  - QR codes encode opaque identifiers.
  - Path-based tenant URLs for the MVP, with verified custom domains later (G-21).
- **Delay impact:** blocks all of Phase 2.

### G-07 — RLS policy strategy and privileged access

- **Recommendation (proposed):**
  - Every tenant-owned table gets `tenant_id` and an RLS policy based on
    `current_setting('app.tenant_id')`.
  - The application database role has no `BYPASSRLS` and does not own the tables.
  - Operator access uses a separate, audited role or path.
  - The Phase 2 gate requires negative isolation tests against real PostgreSQL.
- **Delay impact:** blocks Phase 2 data work.

### G-08 — Secrets management (re-scoped to Phase 2 by M-06)

- **Current state:** no secrets exist. Configuration is validated, errors never echo values, and
  logs are redacted (D-020).
- **Recommendation (proposed):**
  - Secrets are injected only at runtime through the environment, from the chosen platform's
    secret store (tied to G-09). They are never committed.
  - They are declared in the env schema as secret-typed fields, which are never logged.
  - CI secrets live in GitHub environment secrets, scoped to deployment jobs only.
  - Rotation procedure defined before production.
- **Delay impact:** blocks Phase 2 database and identity credentials.

### G-36 — CORS policy

- **Phase 1:** a default-deny policy with a validated exact-origin allowlist and no credentials
  is implemented and verified (D-019).
- **Remains open for Phase 2:** the credential and cookie model with authentication, the
  production origin values, and additional methods.
- **Status:** partially resolved.

### G-38 — Phase 2 security baseline

- **Implemented in Phase 1:** structured logging, redaction and no logging of credentials or
  payloads (D-020); API security headers and the web headers baseline (D-019); a deliberate CORS
  policy (D-019).
- **Remains Phase 2 scope:** rate limiting on authentication endpoints (G-34), secure secrets
  handling (G-08), the web CSP (G-31, Phase 3) and the CORS credential model (G-36).
- **Status:** partially resolved.

## 4. Residual findings disposition

| ID   | Severity | Status                                                                                     | Phase 1 closure impact | Target                                                 |
| ---- | -------- | ------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------ |
| N-01 | LOW      | Remediated (D-021), self-verified                                                          | None once reviewed     | —                                                      |
| N-02 | LOW      | Remediated (D-021), self-verified                                                          | None once reviewed     | —                                                      |
| L-05 | LOW      | Remediated (filter guards), self-verified                                                  | None                   | —                                                      |
| R-03 | LOW      | Open — absolute-path imports into build output. Not portable; fails in CI on other paths   | None                   | Any time: lint rule against absolute import specifiers |
| R-05 | LOW      | Open — DB-client denylist incomplete                                                       | None                   | Phase 2, together with the database choice (G-40)      |
| R-10 | INFO     | Open — install-path allowlist; an alias installed as `zod` would pass                      | None                   | Manifest review; optional lockfile check               |
| R-07 | INFO     | Accepted — non-`exclude` options are guarded by fixtures and named edges                   | None                   | —                                                      |
| R-08 | INFO     | Accepted — test code may import internals                                                  | None                   | —                                                      |
| L-02 | LOW      | Open — client request id trusted as a correlation hint; documented in the logging baseline | None                   | Phase 2, with audit logging                            |
| L-04 | LOW      | Open — computed `require()` paths not analysable                                           | None                   | Static-analysis limit                                  |
| L-08 | LOW      | Open — fixed e2e ports; `test:e2e` needs a prior build                                     | None                   | Optional                                               |
| L-09 | LOW      | Open — `NODE_ENV` unset for the API                                                        | None                   | Phase 10 (deployment)                                  |

## 5. Proposed Phase 2 entry checklist (proposal only — no Phase 2 work authorized)

1. The owner formally closes Phase 1 (§1 and §2), after an independent audit or a recorded
   exception.
2. The owner decides G-03 – G-08 (§3) and G-01 (S-02), and resolves the full Doc 02 question.
3. Phase 2 scope explicitly includes G-38's remainder: auth-endpoint rate limiting, secrets
   handling and the CORS credential model.
4. A real-PostgreSQL test environment is available to CI, for the isolation tests Doc 05 §9
   requires.
5. A Phase 2 plan is presented and approved under Doc 05 §4 before any change.
