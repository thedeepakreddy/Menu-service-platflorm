# Phase 2 — Audit remediation and closure candidate

**Status:** closure **candidate** for the owner's review. Phase 2 is **not** formally closed by this
document (owner instruction §12). Nothing has been merged, deployed, released or opened as a PR.

**Branch:** `claude/phase-1-audit-closure-x347eo`.
**Baseline (audited):** `4656ab3`.
**Remediation commits:** `12fc987`, `2c759bf`, `bd5accb`, `8184813`, `390060a`, plus the final
documentation commit (§6).

**Source audit:** [`phase-2-independent-audit-report.md`](phase-2-independent-audit-report.md),
preserved verbatim (SHA-256 `5a9102f86d48dc3328f9e435f95b8d6e49869ad2cb485cb9867f8c9557232651`).

**Independence:** the same AI system wrote the audit, the remediation and this report. A
separate reviewer agent, started cold in its own clone, re-tested the remediation (§24). That is
not organisational independence (see §21, R-01).

## 1. Executive summary

- **All six binding owner decisions are implemented and tested:**
  - E-01: owner account lifecycle.
  - E-03: revocable PostgreSQL sessions.
  - C-01/C-02: operator authentication redesign.
  - A-01: fail-closed role check.
  - D-01: shared rate-limit budgets.
  - B-01: survives a lost connection.
- **The additionally authorized items are implemented:** C-03, A-02 – A-05, B-02 – B-04, and the
  rate-limit topology.
- **Every original finding is in the register (§3):** each has a status and a classification,
  including the Low and Info items.
- **Gates and CI:** every gate passes locally on a fresh install, and CI passes on the remediation
  commits (§18).
- **Original defects:** each was reproduced by a test first (or shown, for C-01, by a
  precondition test), then shown gone.
- **Mutation testing:** 17 deliberate mutations were run. 16 are caught; 1 is an equivalent
  mutant (§17).
- **Proposed verdict:** **PASS WITH CONDITIONS** (§25). Every Doc 05 Phase 2 exit criterion is
  implemented and verified (§23). The conditions are pre-production blockers (§22), not Phase 2
  acceptance blockers.

## 2. Original audit verdict

**FAIL** (audit §9). The reasons were:

- E-01: owner account lifecycle missing.
- C-01: one ID token satisfied both operator credentials.
- D-01: operator budget was 60/min instead of the approved 30/min.
- E-03: "server-side sessions" was reinterpreted without an owner ruling.

## 3. Findings register: every original finding

**Classes:**

- **1** = Phase 2 acceptance blocker.
- **2** = pre-production blocker.
- **3** = accepted residual risk.

The class is the one that **remains after remediation**; "—" means fully remediated, nothing
remains. The audit's IDs are used. The owner message's A-03/A-04/A-05 map to the audit's
A-04/A-05/A-03 (see the plan).

| ID            | Sev.    | Finding                                                        | Remediation and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                              | Status                                     | Remaining class                                                                | Why it does / does not block Phase 2                                                                                       |
| ------------- | ------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **C-01**      | High    | One ID token accepted as bearer and proof                      | D-034: identity tokens verified once at login with role separation (`nonce`/`azp`/`at_hash` vs `client_id`, no ID-token claims in the access token, the two tokens never equal); Bearer and proof headers removed. Precondition reproduced: an aud-only check accepts the ID token. Regression tests: `login-verifier.test.ts`, `sessions.db.test.ts` "C-01 end to end"; mutation M-04                                                                                | Remediated                                 | —                                                                              | The defect is gone and covered by tests                                                                                    |
| **A-01**      | High    | Startup check misses memberships and indirect access           | D-035 allowlist check. Reproduced: an INHERIT member of `app_owner` reaches `app_definer` and reads all memberships; refused. Indirect, NOINHERIT, SET FALSE, superuser member, `pg_read_all_data`, CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS, extra or missing privilege, TEMP/CREATE, ownership, preset tenant (URL options, ALTER ROLE), `row_security=off`, swapped pools: all refused (`role-check.db.test.ts` 22; `startup.db.test.ts` 6); mutations M-05, M-06 | Remediated                                 | —                                                                              | —                                                                                                                          |
| **E-01**      | High    | Owner account lifecycle missing                                | D-036: deactivate/reactivate, revoke, unlink and two-step re-link, transfer; orphan and takeover prevention; compare-and-set; locks; session revocation; audit (`operator-lifecycle.db.test.ts` 29); mutation M-13                                                                                                                                                                                                                                                    | Remediated                                 | —                                                                              | Doc 05 exit criterion now met (§23)                                                                                        |
| **D-01**      | Medium  | Operator budget per controller (60/min)                        | D-037: one limiter per process, per-group key, path normalisation. Reproduced the audit's 32-request experiment: now 30 allowed, 2 refused (`rate-limit.db.test.ts`); mutation M-11                                                                                                                                                                                                                                                                                   | Remediated                                 | —                                                                              | D-031's 30/min restored; D-031 amended transparently (D-037)                                                               |
| **A-06/B-01** | Medium  | Lost connection crashes the API                                | Pool and client error listeners, statement/lock/idle-in-transaction timeouts, 503 mapping, bounded read retry, `/health/ready`. Tested on the **built** API: killing every backend leaves it serving (`db-failure.db.test.ts` 6); mutations M-01, M-16                                                                                                                                                                                                                | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-02**      | Medium  | Proof bound to access token by iss+sub only                    | `at_hash` required; `azp` and `client_id` = web client; same `sub`/`iss`; cross-session, cross-client and azp-only tests; mutations M-02, M-03                                                                                                                                                                                                                                                                                                                        | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-03/E-04** | Medium  | Forged-callback amplification; no `/auth` limits               | D-038. Reproduced: one login cookie replayed 500× now reaches the provider once (was 500); per-client and global limits; token-request cap; discovery backoff; mutation M-12                                                                                                                                                                                                                                                                                          | Remediated (per instance)                  | 2 (PP-04 multi-instance)                                                       | Per-instance controls are sufficient for Phase 2; distributed limits are a deployment requirement                          |
| **E-03**      | Medium  | "Server-side sessions" reinterpreted                           | Owner ruling applied: PostgreSQL sessions (D-034); replay after logout refused on two API instances; rotation; idle and absolute expiry; browser e2e shows revocation                                                                                                                                                                                                                                                                                                 | Remediated                                 | —                                                                              | —                                                                                                                          |
| **A-02**      | Medium  | Owner `USING(true)` policies; views leak                       | D-035: `app_definer` owns functions and policies; `app_owner` has no row access; a view created by `app_owner` leaks 0 rows; catalog test requires `security_invoker`                                                                                                                                                                                                                                                                                                 | Remediated                                 | 3 (R-03: migration role is DDL authority)                                      | DDL authority is inherent; mitigated by catalog test and migration identity                                                |
| **A-03**      | Medium  | Policy test accepts `OR true`                                  | Restrictive backstops; canonical-expression catalog check; adversarial test shows `OR true` is neutralised and flagged; mutation M-07                                                                                                                                                                                                                                                                                                                                 | Remediated                                 | —                                                                              | —                                                                                                                          |
| **A-04**      | Medium  | New functions default to PUBLIC EXECUTE                        | Default privileges revoke PUBLIC; reviewed grant list per function; adversarial test; mutation M-09                                                                                                                                                                                                                                                                                                                                                                   | Remediated                                 | —                                                                              | —                                                                                                                          |
| **A-05**      | Medium  | Migration runner identity, order, COMMIT                       | Identity (must own the database; not superuser/BYPASSRLS/CREATEROLE; no role switch), out-of-order refused, transaction control refused (E-strings and `set_config('role')` too, review R2-05), guard and role check after each file (`migrate.db.test.ts` 16); mutation M-10                                                                                                                                                                                         | Remediated                                 | —                                                                              | —                                                                                                                          |
| **B-02**      | Medium  | "Rejected" logged when applied                                 | Operation ids (unique), reconciliation through the audit row, `GET /operator/operations/:id`, duplicate-id retry cannot apply twice; lost-reply test shows `applied` → 503, never "rejected"                                                                                                                                                                                                                                                                          | Remediated                                 | —                                                                              | —                                                                                                                          |
| **B-03**      | Medium  | Caller-asserted operator id                                    | Operator functions take the session token hash and derive the account inside the database; forged, owner or revoked session hashes refused even with the operator credential                                                                                                                                                                                                                                                                                          | Remediated                                 | 3 (R-04: runtime + operator credentials together could mint and use a session) | Requires two separate credentials; documented in D-034                                                                     |
| **B-04**      | Medium  | Audit table erasable                                           | Owner privileges revoked; triggers refuse UPDATE/DELETE/TRUNCATE even for a superuser; definer has no UPDATE; catalog check; mutation M-08                                                                                                                                                                                                                                                                                                                            | Remediated                                 | 2 (PP-05: ship logs; owner DDL could drop triggers)                            | The in-database trail is protected from every application path; true append-only needs external log shipping               |
| **D-02**      | Medium  | Body parsed before limits                                      | Middleware before body parsing; JSON only, 32 KB; a 20,000-byte nested body is refused with 429 unparsed                                                                                                                                                                                                                                                                                                                                                              | Remediated                                 | —                                                                              | —                                                                                                                          |
| **D-03**      | Medium  | O(n) eviction; table lockable                                  | O(1) amortised eviction (10,000 refusals on a full 50k table < 500 ms; was about 5 s); IPv6 /64 keys reduce key rotation                                                                                                                                                                                                                                                                                                                                              | Remediated                                 | 3 (fail-closed capacity remains a deliberate design)                           | —                                                                                                                          |
| **D-04/D-05** | Medium  | Socket-address keys; proxy and BFF share keys                  | Trusted-proxy model (right-most untrusted), BFF-forwarded address only with credential, IPv6 /64; spoofing tests                                                                                                                                                                                                                                                                                                                                                      | Remediated                                 | 2 (PP-04 edge limiter)                                                         | Model implemented and tested; production topology unknown (G-09)                                                           |
| **E-02**      | Medium  | Invitation not built; false 0003 comment                       | Provisioning creates the owner account directly (onboarding foundation). Invitation (SEQ-1) remains unapproved and out of scope. 0003's comment is history (forward-only migrations; `find_account` dropped in 0006, whose header is accurate)                                                                                                                                                                                                                        | Partially (documented)                     | 3                                                                              | Doc 05 requires an onboarding **foundation**; provisioning plus lifecycle meets it. Invitations are a Phase 6 product flow |
| **E-05**      | Medium  | No operator account provisioning                               | Not built (out of the remediation's authorization). Operators are created by audited environment provisioning                                                                                                                                                                                                                                                                                                                                                         | Open                                       | 2 (PP-09)                                                                      | Phase 2 needs operator authentication/authorization, which is verified; onboarding operators is an operational process     |
| **E-06**      | Medium  | Stale docs                                                     | STATUS, DECISIONS, GAPS, CLAUDE.md updated; D-033 marked superseded; exit gate reassessed against Doc 05 wording (§23)                                                                                                                                                                                                                                                                                                                                                | Remediated                                 | —                                                                              | —                                                                                                                          |
| **B-05**      | Low-Med | In-flight request during suspension                            | Suspension now revokes the owner's sessions; a request already past validation can still finish (milliseconds)                                                                                                                                                                                                                                                                                                                                                        | Mitigated                                  | 3                                                                              | Inherent to any check-then-act without locking reads                                                                       |
| **B-06**      | Low-Med | = A-01                                                         | See A-01                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-04**      | Low     | JWKS outage → 500                                              | `ProviderUnavailableError` → 503                                                                                                                                                                                                                                                                                                                                                                                                                                      | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-05**      | Low     | Session replay after logout                                    | Server-side revocation; test on two instances and in the browser                                                                                                                                                                                                                                                                                                                                                                                                      | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-06**      | Low     | ID token in logout URL; expired session skips provider logout  | `client_id` instead of `id_token_hint`; logout revokes and ends the provider session for any well-formed cookie                                                                                                                                                                                                                                                                                                                                                       | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-07**      | Low     | Cookie size headroom                                           | The cookie is now 52 bytes (opaque token)                                                                                                                                                                                                                                                                                                                                                                                                                             | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-08**      | Low     | MFA max age 86400 vs 3600; proof optional                      | Max 3600 on both sides; the proof concept is removed; MFA is always checked for operators at login                                                                                                                                                                                                                                                                                                                                                                    | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-09**      | Info    | "Path-scoped" login cookie (doc)                               | D-034 describes `__Host-`, Path=/ correctly                                                                                                                                                                                                                                                                                                                                                                                                                           | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-10**      | Info    | No entropy check on the web secret                             | Exactly 32 decoded bytes, 43 characters; passphrases refused                                                                                                                                                                                                                                                                                                                                                                                                          | Remediated                                 | —                                                                              | —                                                                                                                          |
| **C-11**      | Info    | Owner and operator share one issuer                            | Separation by client (`azp`/`client_id`), audience, account kind and `UNIQUE(issuer, subject)`; owner↔operator cross tests                                                                                                                                                                                                                                                                                                                                            | Accepted                                   | 3                                                                              | Inherent to D-032's single instance; enforced in code                                                                      |
| **B-07**      | Low     | Weaker database validation                                     | Reserved slugs, display name, https issuer, subject and reason checks in the database                                                                                                                                                                                                                                                                                                                                                                                 | Remediated                                 | —                                                                              | —                                                                                                                          |
| **B-08**      | Low     | urlencoded, http/userinfo issuer, NUL → 500                    | JSON only; issuer https without userinfo/query/fragment; control characters refused → 400                                                                                                                                                                                                                                                                                                                                                                             | Remediated                                 | —                                                                              | —                                                                                                                          |
| **B-09**      | Low     | Concurrent provisioning gives the wrong 409                    | Both are 409 CONFLICT by contract; no data inconsistency                                                                                                                                                                                                                                                                                                                                                                                                              | Accepted                                   | 3                                                                              | Cosmetic                                                                                                                   |
| **B-10**      | Low     | Operator log lacks requestId; redacted reason differs          | requestId and operationId in every attempt and result log; the database row is authoritative for applied operations                                                                                                                                                                                                                                                                                                                                                   | Remediated (redaction difference accepted) | 3                                                                              | —                                                                                                                          |
| **A-07**      | Low     | Preset tenant context passes                                   | Refused at startup (URL options, ALTER ROLE … IN DATABASE)                                                                                                                                                                                                                                                                                                                                                                                                            | Remediated                                 | —                                                                              | —                                                                                                                          |
| **A-08**      | Low     | `set_config` scan evadable                                     | Scan matches the bare name, strips comments, allowlists exactly two calls, also forbids `SET ROLE`/`SESSION AUTHORIZATION`; catalog check forbids them in function bodies                                                                                                                                                                                                                                                                                             | Remediated                                 | 3 (a static scan cannot see computed SQL)                                      | —                                                                                                                          |
| **A-09**      | Low     | No timeouts                                                    | statement 10 s, lock 5 s, idle-in-transaction 15 s                                                                                                                                                                                                                                                                                                                                                                                                                    | Remediated                                 | —                                                                              | —                                                                                                                          |
| **D-06**      | Low     | Fixed window, wall clock, fixed capacity Retry-After           | Capacity Retry-After now from the oldest window; fixed window and wall clock kept (documented)                                                                                                                                                                                                                                                                                                                                                                        | Partially                                  | 3                                                                              | Acceptable precision for abuse control                                                                                     |
| **D-07**      | Low     | Log amplification                                              | One `rate_limited` line per refusal, bounded fields; no address                                                                                                                                                                                                                                                                                                                                                                                                       | Accepted                                   | 3                                                                              | Log-volume limits belong to the log pipeline (G-32)                                                                        |
| **D-08**      | Low     | No server timeouts (slow clients)                              | Not changed                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Open                                       | 2 (PP-06: reverse-proxy or server timeouts)                                    | Deployment-level control                                                                                                   |
| **E-08**      | Low     | Owner MFA not re-evaluated; "account where present" keying     | Owner MFA is a provider policy (D-025); per-account keys not added (limits run before authentication)                                                                                                                                                                                                                                                                                                                                                                 | Accepted                                   | 3                                                                              | —                                                                                                                          |
| **E-09**      | Low     | Status vocabulary                                              | Tenant `active/suspended/retired`, account `active/deactivated`, membership `active/revoked` documented in D-036                                                                                                                                                                                                                                                                                                                                                      | Remediated                                 | —                                                                              | —                                                                                                                          |
| **A-10**      | Info    | `find_account` lets the runtime test whether an account exists | Function dropped; `session_create` requires a verified login                                                                                                                                                                                                                                                                                                                                                                                                          | Remediated                                 | —                                                                              | —                                                                                                                          |
| **B-11**      | Info    | NULL statuses safe by accident                                 | All status columns NOT NULL with CHECK                                                                                                                                                                                                                                                                                                                                                                                                                                | Remediated                                 | —                                                                              | —                                                                                                                          |
| **D-09**      | Info    | N instances = N × limit                                        | Documented in D-037                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Accepted                                   | 2 (PP-04)                                                                      | —                                                                                                                          |
| **E-10**      | Info    | One owner per tenant not enforced                              | Partial unique index; test                                                                                                                                                                                                                                                                                                                                                                                                                                            | Remediated                                 | —                                                                              | —                                                                                                                          |
| **E-11**      | Info    | `apiAuthHeaders` unused; issuer not matched                    | Helper removed; owner identities must match the configured owner issuer (422)                                                                                                                                                                                                                                                                                                                                                                                         | Remediated                                 | —                                                                              | —                                                                                                                          |
| **E-07**      | Low-Med | Audit integrity (independence)                                 | Separate cold-start reviewer (§24)                                                                                                                                                                                                                                                                                                                                                                                                                                    | Partially                                  | 3 (R-01)                                                                       | Organisational independence cannot be produced by the same system                                                          |

New findings from the remediation review are in §24.

## 4. Finding-by-finding remediation

Detail is in the register (§3) and in decisions D-034 – D-038 (`docs/DECISIONS.md`), which
record the design, evidence and limitations of each change.

## 5. Changed files (remediation commits)

| Area               | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations         | `apps/api/migrations/0005_definer_role_and_hardening.sql`, `0006_owner_lifecycle_and_sessions.sql`                                                                                                                                                                                                                                                                                                                                                                                            |
| Database runtime   | `infrastructure/database/{database.ts,database.module.ts,migrate.ts,role-policy.ts}`                                                                                                                                                                                                                                                                                                                                                                                                          |
| Tenancy boundaries | `infrastructure/tenancy/tenant-boundaries.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Rate limiting      | `infrastructure/rate-limit/{rate-limit.ts,rate-limiter.ts,client-address.ts}`; `rate-limit.module.ts` deleted                                                                                                                                                                                                                                                                                                                                                                                 |
| Identity           | `modules/identity/{login-verifier.ts,session.service.ts,sessions.controller.ts,guards.ts,identity.module.ts,index.ts}`; `identity-verifier.ts` and `identity.service.ts` deleted                                                                                                                                                                                                                                                                                                              |
| Operator           | `modules/operator-tenants/{operator-tenants.service.ts,operator-tenants.controller.ts,operator-tenants.module.ts}`                                                                                                                                                                                                                                                                                                                                                                            |
| App wiring         | `create-app.ts`, `main.ts`, `env.ts`, `all-exceptions.filter.ts`, `tenancy.service.ts`, controllers                                                                                                                                                                                                                                                                                                                                                                                           |
| Contracts          | `packages/contracts/src/{session.ts,tenant.ts,index.ts}`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Web                | `apps/web/src/auth/{handlers.ts,session.ts,config.ts,api-client.ts,abuse.ts}`, `src/env.ts`, `package.json`, `test/oidc-provider.ts`, `test/oidc-provider-cli.mjs`                                                                                                                                                                                                                                                                                                                            |
| Tests              | API: `login-verifier.test.ts`, `sessions.db.test.ts`, `operator-lifecycle.db.test.ts`, `catalog.db.test.ts`, `role-check.db.test.ts`, `migrate.db.test.ts`, `db-failure.db.test.ts`, `client-address.test.ts`, `tenant-boundaries.db.test.ts`; updated tenancy, database, rate-limit, env, startup tests; `test/db/{fixtures,app,provision,provision-cli}.ts`; `test/identity/test-issuer.ts`. Web: `handlers.test.ts`, `env.test.ts`. E2E: `tests/e2e/login.spec.ts`, `playwright.config.ts` |
| CI / config        | `.github/workflows/ci.yml` (e2e seed), `.prettierignore` (verbatim audit report), `.env.example` × 2, `pnpm-lock.yaml` (workspace link only)                                                                                                                                                                                                                                                                                                                                                  |
| Docs               | `CLAUDE.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, `docs/GAPS.md`, this report, `docs/architecture/phase-2-remediation-plan.md`, `docs/architecture/spikes/zitadel-token-contract.md`, `docs/audit/phase-2-independent-audit-report.md` (verbatim copy)                                                                                                                                                                                                                                      |

## 6. Commits

| Commit    | Content                                                               |
| --------- | --------------------------------------------------------------------- |
| `12fc987` | API and database: hardening, sessions, owner lifecycle, rate limiting |
| `2c759bf` | Web BFF on server-side sessions, login abuse controls, browser e2e    |
| `bd5accb` | Deterministic ports in process-spawning tests                         |
| `8184813` | Test fixes from CI (superuser attribute) and mutation testing (azp)   |
| `390060a` | Tenant-safe cache/job boundary; D-034 – D-038; CLAUDE.md              |
| final     | STATUS/GAPS ledger, this report, review results (see `git log`)       |

No history was rewritten. All commits are on the authorized branch only.

## 7. Architectural changes

- **Authentication model.** The API changes from a stateless resource server (Bearer JWT per
  request) to session validation (D-034). Tokens are verified once.
- **The web app** keeps no identity tokens. It talks to the API server to server with a shared
  credential.
- **Database.** A fourth role (`app_definer`) and two tables (`sessions`, `consumed_id_tokens`);
  owner lifecycle columns.
- **Rate limiting** moved from guards to middleware.

No new external packages: the web app now depends on the workspace `@platform/contracts`.
Architecture boundaries hold: 153 modules, 0 violations.

## 8. Security changes

See §3. Summary:

- Token role separation and binding.
- Revocable sessions.
- MFA as a session property, with a database constraint.
- Fail-closed effective-privilege role check.
- Definer isolation and restrictive backstops.
- No PUBLIC EXECUTE.
- Append-only audit.
- Migration identity checks.
- Session-derived operator identity.
- Operation-id reconciliation.
- Pre-parse limits with a trusted-proxy model.
- Login abuse controls.
- Strict header and cookie parsing.
- No ID token in URLs.
- Stricter input validation in both the API and the database.

## 9. Owner lifecycle implementation

D-036: functions in migration `0006`; API endpoints:

- `GET /operator/tenants/:slug`
- `POST /operator/tenants/:slug/owner/{revoke,transfer}`
- `GET /operator/accounts/:id`
- `POST /operator/accounts/:id/{status,identity/unlink,identity/link}`
- `GET /operator/operations/:id`

Tests cover:

- Orphan prevention (deactivate, revoke, reactivate an ownerless tenant).
- Takeover prevention (stale compare-and-set, operator identity, deactivated account, identity
  already bound, foreign issuer).
- Races: 4 concurrent transfers (exactly one wins); 5 rounds of deactivate vs reactivate.
- Session invalidation after each operation.
- Audit rows and the database unique index.

## 10. Session architecture

D-034 §3–7. Storage is PostgreSQL `app.sessions`: hash only, RLS FORCE, reachable only through
definer functions.

**Lifecycle:**

- **Login:** create, rotating the previous session.
- **Every request:** validate, with idle renewal.
- **End:** logout, lifecycle events, or idle or absolute expiry.

**Tests:**

- `sessions.db.test.ts`: 25.
- Web `handlers.test.ts`: rotation, logout, cookie parsing.
- Browser `login.spec.ts`: cookie attributes, HttpOnly, revocation after logout.

**Limitation:** the provider SSO session can outlive a local revocation (back-channel logout is
PP-07).

## 11. Operator authentication redesign

D-034 §1–4 and the MFA semantics paragraph. Verified protocol behaviour comes from ZITADEL source
code (`zitadel-token-contract.md`), confirmed in code, not on a live tenant (PP-03).

The C-01 reproduction is part of the suite:

- the precondition test (an aud-only check accepts the ID token);
- same-token, ID-token-as-access-token and ID-token-claims-in-access-token tests, all refused;
- the D-033 headers refused end to end.

## 12. Database role enforcement

D-035 and `role-policy.ts`. The startup check runs for both pools in `main.ts`, and the built API
refuses to start when it fails (`startup.db.test.ts`).

## 13. Rate limiting redesign

D-037 (API) and D-038 (web). Limits are instance-local, and this is recorded as a pre-production
blocker. Distributed rate limiting is **not** claimed.

## 14. Database failure recovery

| Behaviour                     | How                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Unexpected connection loss    | Logged by code only; never crashes                                               |
| Pool failure                  | Connect timeout 5 s → 503                                                        |
| Recovery and reconnection     | Pool replaces dead connections                                                   |
| Bounded retries               | One retry, idempotent reads only                                                 |
| Retry safety                  | Mutations never retried; reconciled instead                                      |
| Duplicate mutation prevention | Unique operation id                                                              |
| Health and readiness          | `/health` (liveness) and `/health/ready` (503 while the database is unreachable) |
| Degradation                   | 503 envelope                                                                     |
| Safe errors                   | No connection strings in logs (stderr checked in tests)                          |

## 15. Database policy and function permission changes

D-035; migration 0005 and the 0006 grant section; the catalog check list.

## 16. Operator audit integrity

The audit record now contains:

- operation id (unique);
- operator account and session, derived in the database;
- action and reason;
- target tenant and account;
- details (previous owner or identity).

It is append-only for every role, and outcomes are reconciled against it.

**Limitations:** the DDL authority (R-03) and log shipping (PP-05).

## 17. Verification evidence

**Mutation checks.** For each, the change was confirmed applied, the targeted test was run, and
the file was restored byte-identical (git-clean afterwards):

| ID   | Mutation                                                                                  | Result                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-01 | Remove pool and client error listeners                                                    | Built API crashed (57P01 unhandled): **caught**                                                                                                                                 |
| M-02 | Skip `at_hash` binding                                                                    | 2 tests fail: **caught**                                                                                                                                                        |
| M-03 | Skip `azp` check                                                                          | Survived at first; added an azp-only test; now 1 fails: **caught**                                                                                                              |
| M-04 | Skip the operator MFA requirement                                                         | 3 fail: **caught**                                                                                                                                                              |
| M-05 | Skip the membership check                                                                 | 9 fail: **caught**                                                                                                                                                              |
| M-06 | Skip the exact-privilege allowlist                                                        | 2 fail: **caught**                                                                                                                                                              |
| M-07 | Restrictive backstop made permissive                                                      | 2 fail: **caught**                                                                                                                                                              |
| M-08 | Drop the TRUNCATE trigger                                                                 | 3 fail: **caught**                                                                                                                                                              |
| M-09 | Drop the default-privilege revoke                                                         | 3 fail: **caught**                                                                                                                                                              |
| M-10 | Skip the migration identity check                                                         | 6 fail: **caught**                                                                                                                                                              |
| M-11 | Per-route rate-limit key                                                                  | 2 fail: **caught**                                                                                                                                                              |
| M-12 | Skip the single-use login transaction                                                     | 1 fails: **caught**                                                                                                                                                             |
| M-13 | Skip orphan prevention on deactivation                                                    | 1 fails: **caught**                                                                                                                                                             |
| M-14 | Accept revoked sessions                                                                   | 2 fail: **caught**                                                                                                                                                              |
| M-15 | Drop the `kind`/`mfa` filter in `operator_from_session`                                   | **Survived: equivalent mutant.** An operator session without MFA cannot exist (CHECK), and the account-kind filter alone refuses owner sessions; documented as defence in depth |
| M-16 | Pool error listener renamed                                                               | 3 unhandled errors: **caught**                                                                                                                                                  |
| M-17 | Global login limit checked before the per-client limit (the code the review found, R2-02) | 2 fail: **caught**                                                                                                                                                              |

## 18. CI results

- **#22** (`bd5accb`): failure. A test assumed the CI superuser has the BYPASSRLS attribute; it
  does not. The test was fixed in `8184813`; no product change.
- **#23** (`8184813`, run 46061170703, job 140715516556): **success**. Every step passed. The log
  shows 12 Playwright tests passed, including the browser login on chromium-desktop and
  chromium-mobile.
- Later commits: see STATUS.md "Phase 2 remediation" (CI for the final commit is recorded there).

## 19. Test results

See STATUS.md "Phase 2 remediation → final verification" for the exact commands and counts at the
final commit.

## 20. Remaining findings

Open items with their classification:

- E-05 (class 2, PP-09).
- D-08 (class 2, PP-06).
- Partially remediated or accepted (class 3): E-02, D-06, D-07, E-08, B-05, B-09, B-10, C-11, A-08,
  D-03.
- New review findings: §24.

## 21. Accepted residual risks

| ID   | Risk                                                                                     | Why accepted                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| R-01 | Same-system authorship of audit, remediation and review                                  | Mitigated by a separate cold-start reviewer; a human or third-party review is recommended before production (PP-10) |
| R-02 | ZITADEL token shapes verified in source code, not on a live tenant                       | No account may be created (owner constraint); PP-03                                                                 |
| R-03 | `app_owner` (DDL) can alter policies or triggers, or assume `app_definer`                | Inherent to a migration role; catalog test, migration identity and review                                           |
| R-04 | `app_runtime` + `app_operator` credentials together can mint and use an operator session | Two separately held secrets; the database cannot verify JWTs itself                                                 |
| R-05 | Instance-local limits and single-use set                                                 | Phase 2 runs as one instance; PP-04                                                                                 |
| R-06 | Provider SSO session can outlive a local revocation                                      | Local session revoked immediately; PP-07                                                                            |
| R-07 | In-flight request during revocation completes                                            | Milliseconds; inherent                                                                                              |
| R-08 | Static shared BFF credential                                                             | Rotation by restart; mTLS later                                                                                     |

## 22. Pre-production blockers

| ID    | Item                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PP-01 | D-032's eight ZITADEL contractual conditions (EU processing, sub-processors, plan, retention, key rotation, rate-limit raise, SOC 2/ISO, MFA/passkeys on plan) |
| PP-02 | ZITADEL configuration: JWT access tokens; Force MFA for operators; self-registration and e-mail auto-linking off; exact redirect URIs; Development mode off    |
| PP-03 | Re-verify token shapes (aud, azp, at_hash, client_id, amr, auth_time) against the real instance                                                                |
| PP-04 | Edge or shared-store rate limiting and a single-use login store before more than one API or web instance; trusted-proxy configuration                          |
| PP-05 | Ship the operator audit log to an append-only store of record (G-32)                                                                                           |
| PP-06 | Server and proxy timeouts (header, body, idle), D-08                                                                                                           |
| PP-07 | Back-channel logout (provider → session revocation) or an accepted SSO lifetime                                                                                |
| PP-08 | Production database provisioning that creates `app_definer` and the other roles exactly as `provision.ts` does, with the startup check as the gate (G-09)      |
| PP-09 | Audited operator-account provisioning procedure (E-05)                                                                                                         |
| PP-10 | Independent human or third-party security review                                                                                                               |
| PP-11 | BFF credential generation and rotation in the secret store (D-029)                                                                                             |

## 23. Phase 2 exit-gate matrix (against Doc 05 §11 and §13)

**Doc 05 §13 Phase 2:** "Define and verify tenant resolution and owner account lifecycle,
server-side tenant context, permissions, tenant-owned resource policies and isolation tests.
Implement shared-database approach with appropriate isolation controls and tenant-safe cache/job
boundaries. Exit: isolation/authentication/authorization negative tests and lifecycle
verification."

**§11 table:** "Isolation/auth negative tests; onboarding foundation".

| #   | Original requirement                                         | Implementation                                                                                                 | Evidence / tests                                               | Result                                 | Remaining limitations                                      | Acceptance |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ---------- |
| 1   | Tenant resolution                                            | `resolve_active_tenant` (definer), slug contract, tenant-safe 404                                              | `tenancy.db.test.ts`; e2e                                      | Pass                                   | —                                                          | Met        |
| 2   | **Owner account lifecycle** (missed by the first assessment) | D-036 operations                                                                                               | `operator-lifecycle.db.test.ts` (29); M-13                     | Pass                                   | Invitations not built (E-02, SEQ-1)                        | Met        |
| 3   | Server-side tenant context                                   | `withTenant()` only; transaction-local; source scan                                                            | `database.db.test.ts` (pool reuse, 200 concurrent, no context) | Pass                                   | Static scan limits (A-08)                                  | Met        |
| 4   | Permissions (membership/permission policies)                 | Owner membership checked per request inside RLS; operator kind and MFA session; account status                 | Sessions, tenancy and lifecycle tests                          | Pass                                   | One role in MVP (Doc 01 §5)                                | Met        |
| 5   | Tenant-owned resource policies                               | FORCE RLS, canonical policies, restrictive backstops, definer-only cross-tenant                                | `catalog.db.test.ts` (16); M-07                                | Pass                                   | R-03                                                       | Met        |
| 6   | Isolation tests                                              | Cross-tenant read/write/move, no/empty/bad context, pool reuse, concurrency, view and policy adversarial tests | DB suites                                                      | Pass                                   | —                                                          | Met        |
| 7   | Shared database with isolation controls                      | D-028/D-035 roles; startup allowlist                                                                           | `role-check.db.test.ts` (22), `startup.db.test.ts`             | Pass                                   | PP-08                                                      | Met        |
| 8   | Tenant-safe cache/job boundaries                             | `tenantCacheKey`, `runTenantJob` (no cache or queue exists, G-19)                                              | `tenant-boundaries.db.test.ts` (7)                             | Pass                                   | Applies when infrastructure is added                       | Met        |
| 9   | Authentication negative tests                                | Login verification (28), sessions (25), web (52), browser e2e                                                  | Unit, DB, e2e                                                  | Pass                                   | PP-03 real provider                                        | Met        |
| 10  | Authorization negative tests                                 | Owner A on tenant B, kinds crossing, operator-only functions, revoked or deactivated principals                | DB suites                                                      | Pass                                   | —                                                          | Met        |
| 11  | Lifecycle verification                                       | Tenant (provision → suspend → reactivate → retire) and owner account lifecycle                                 | Lifecycle suite                                                | Pass                                   | —                                                          | Met        |
| 12  | Onboarding foundation                                        | Operator provisioning of tenant plus owner identity; owner can log in                                          | Lifecycle suite; browser e2e (seeded owner logs in)            | Pass                                   | Invitation flow is Phase 6 product work (SEQ-1 unapproved) | Met        |
| 13  | Plan gate: CI green, governance updated, no unexplained HIGH | CI #23 success; decisions and ledgers updated                                                                  | §18                                                            | Pass (see STATUS for the final commit) | —                                                          | Met        |

## 24. Independent review results

**Reviewer.** A separate agent, started cold with no access to this session's reasoning, worked
in its own clone of `8184813` against its own PostgreSQL cluster (port 55460) and wrote its own
probes. Report: session scratchpad `review/REVIEW.md`; summarised here.

**Gates it reproduced (fresh frozen install):**

- format, lint, typecheck, arch (0 violations), build: pass.
- `test`: 387.
- `test:db`: 157 (10 files).
- `test:e2e`: 12.

**Original defects re-tested with its own probes.** No longer reproduce:

- C-01 (same token for both roles, or an ID token as the access token: 401; Bearer and the proof
  header refused).
- C-02.
- A-01: a member of `app_owner`, `pg_read_all_data` through a NOLOGIN intermediate,
  `ALTER DATABASE … SET app.tenant_id`, `row_security=off` in the URL: all refused.
- A-03, B-01, D-01 (21 path spellings tried), D-03, D-04/D-05, C-05/C-06, E-01 (invariant held
  under sequences and races), E-03.

Partly reproduced at `8184813`, and now handled:

| ID                                            | Review finding                                                                                              | Sev.                       | Action (after `8184813`)                                                                                                                                                                                                                          | Remaining class                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R2-02                                         | Global login limit consumed before the per-client check: one IP could lock everyone out                     | Medium, **blocks Phase 2** | **Fixed**: per-client first; refused requests never touch the global budget. The reproduction test (60 requests from one IP, then another IP still allowed) fails on the old code and passes now                                                  | —                                                                  |
| R2-17                                         | D-034 – D-038 and STATUS/GAPS missing at `8184813`                                                          | Info, **blocks Phase 2**   | **Fixed** in `390060a` and `88ef7b7` (after the reviewed commit)                                                                                                                                                                                  | —                                                                  |
| R2-01                                         | `app_runtime` alone can mint an MFA operator session; operator functions accept it                          | Medium                     | **Recorded accurately**: D-034 limitations; B-03 is "strengthened, not eliminated"; forging an operator action needs runtime **and** operator credentials                                                                                         | 3 (R-04)                                                           |
| R2-08                                         | `app_owner` erases the audit in three DDL statements (disable trigger, grant itself TRUNCATE, truncate)     | Low (understated claim)    | **Recorded accurately** in D-035; the catalog test already requires enabled triggers; log shipping remains PP-05                                                                                                                                  | 2 (PP-05)                                                          |
| R2-07 / A-02, A-04 via `SET ROLE app_definer` | The definer kept CREATE on `app`: a view or function created as the definer leaked                          | Low                        | **Fixed**: migration `0007` revokes CREATE; catalog check and a test that `CREATE VIEW/FUNCTION` as the definer is refused                                                                                                                        | —                                                                  |
| R2-05 / A-05                                  | `COMMIT` hidden after an `E'\''` string; role switch via `set_config('role', …)`                            | Low                        | **Fixed**: escape-string aware scanner; `set_config('role'/'session_authorization')` refused; the runner also checks `current_user = session_user` after each file; two new tests                                                                 | 3 (static analysis of SQL is never complete; review and CI remain) |
| R2-09 / C-04                                  | JWKS answering 500 or HTML gave 401                                                                         | Low                        | **Fixed**: generic JOSE / JWKSInvalid / timeout / refused connection → 503; 4 new tests                                                                                                                                                           | —                                                                  |
| R2-04                                         | Default proxy hops 0: the whole site shares one login budget; behind the BFF all browsers share API budgets | Medium                     | **Fixed in code for the web side**: unknown clients are no longer pooled into one per-client bucket; `WEB_TRUSTED_PROXY_HOPS` required in staging/production. API-side shared budget behind a BFF without a forwarded address is recorded (D-037) | 2 (PP-04)                                                          |
| R2-03                                         | Full key table refuses every new client in every group (about 12,500 /64s)                                  | Medium                     | **Recorded** in D-037 as a deliberate fail-closed choice that is also a denial-of-service lever                                                                                                                                                   | 2 (PP-04)                                                          |
| R2-10 / B-02                                  | Reconciliation can report "not applied" while the original commit is in flight                              | Low                        | **Label made honest**: `not_applied_when_checked`; the client re-checks via `GET /operator/operations/:id`; a duplicate id can never apply twice                                                                                                  | 3                                                                  |
| R2-06                                         | The stored hash is the credential at the database layer                                                     | Low                        | **Recorded** in D-034                                                                                                                                                                                                                             | 3                                                                  |
| R2-11                                         | Single-use login transactions per web instance                                                              | Low                        | Already recorded (D-038)                                                                                                                                                                                                                          | 2 (PP-04)                                                          |
| R2-12                                         | `/health/ready` unauthenticated, unlimited, queries the database                                            | Low                        | Recorded: expose only to the internal load balancer                                                                                                                                                                                               | 2 (PP-06)                                                          |
| R2-13                                         | Malformed `X-Forwarded-For` falls back to the proxy's address                                               | Info                       | Accepted: fail-safe direction (shared, not spoofed, budget)                                                                                                                                                                                       | 3                                                                  |
| R2-14                                         | NAT64 addresses collapse to one /64 key                                                                     | Info                       | Accepted                                                                                                                                                                                                                                          | 3                                                                  |
| R2-15                                         | Suspending one tenant revokes the owner's sessions for all their tenants                                    | Info                       | Accepted by design: sessions are account-wide; a re-login restores the other tenants                                                                                                                                                              | 3                                                                  |
| R2-16                                         | No way to deactivate an operator account                                                                    | Info                       | = E-05                                                                                                                                                                                                                                            | 2 (PP-09)                                                          |

**Not verified by the reviewer either:**

- real ZITADEL token shapes, and logout with `client_id` only;
- multiple web replicas;
- readiness under flood;
- D-02 timings;
- Firefox and Safari.

**After the fixes,** all gates were re-run (STATUS.md "Phase 2 audit remediation → final
verification").

## 25. Proposed final verdict

**PASS WITH CONDITIONS.** This is also the verdict the independent reviewer proposed, with
conditions that are now fulfilled.

**Why not FAIL:**

- Every Doc 05 Phase 2 exit criterion, including the owner account lifecycle the first
  assessment missed, is implemented and verified by tests that reproduce the original defects
  (§23).
- No Phase 2 acceptance blocker remains: R2-02 is fixed and R2-17 is resolved.

**Why not PASS:**

- The authentication contract is verified against ZITADEL's source code, not against a real
  tenant.
- Several controls are instance-local.
- The audit trail is not tamper-proof against the migration credential.
- The runtime credential can mint sessions.
- The same AI system wrote the audit, the remediation and the reviews.

These are recorded as pre-production blockers (§22) and accepted residual risks (§21). The
owner must accept them explicitly.

**Conditions for accepting Phase 2:**

1. The owner accepts the residual risks R-01 – R-08.
2. PP-01 – PP-11 stay open as production gates (Phase 10), and none is treated as satisfied by
   this phase.
3. Formal closure is recorded by the owner. This report does not close Phase 2.
