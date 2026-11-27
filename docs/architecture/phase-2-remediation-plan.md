# Phase 2 audit remediation: plan

**Authority:** owner message "Phase 2 Audit Remediation — Owner Authorization & Controlled
Engineering Execution" (2026-11-27). Its binding decisions:

- E-01: implement the owner account lifecycle now.
- E-03: revocable server-side sessions.
- C-01, C-02, A-01, D-01 and B-01: remediation required.

The owner also authorized C-03, A-02 – A-05, B-02 – B-04 and the rate-limit topology work.

**Input:** [`../audit/phase-2-independent-audit-report.md`](../audit/phase-2-independent-audit-report.md),
preserved verbatim (SHA-256 `5a9102f8…2651`).

**Scope:** Phase 2 remediation only. No Phase 3 work, no unrelated features, no merge, PR or
deploy.

**Finding IDs:** this plan uses the audit report's IDs. The owner message numbers the database
items differently:

| Owner message                      | Audit report | Topic                                                |
| ---------------------------------- | ------------ | ---------------------------------------------------- |
| A-03 "function permissions"        | A-04         | Function permissions                                 |
| A-04 "migration runner identity"   | A-05         | Migration runner identity                            |
| A-05 "policy and permission tests" | A-03         | Policy and permission tests (plus all catalog tests) |

All five are remediated, so nothing is lost in the renumbering.

## Target design (summary; decisions D-034 – D-038)

1. **Database roles (D-035).**
   - A new `NOLOGIN` role, `app_definer`, owns every `SECURITY DEFINER` function. It holds the
     only cross-tenant policies, and only for the commands those functions need: no `DELETE` on
     tenant data, no `UPDATE`/`DELETE`/`TRUNCATE` on the audit table.
   - `app_owner` (migrations) keeps DDL authority but loses every row policy. Under `FORCE` it
     sees no rows.
   - Tenant-owned tables get a `RESTRICTIVE` tenant policy as a backstop.
   - Functions are created without `PUBLIC` `EXECUTE` by default.
   - The audit table refuses `UPDATE`, `DELETE` and `TRUNCATE` by trigger.
2. **Startup role check (D-035).** An allowlist of effective privileges, fail-closed:
   - no role membership of any kind, direct or indirect;
   - no superuser, `BYPASSRLS`, `CREATEROLE`, `CREATEDB` or replication;
   - no ownership of anything in the schema or of the database;
   - no `CREATE`/`TEMP`;
   - table and function privileges equal to the expected set for that pool;
   - no preset tenant context; `session_user = current_user`.
3. **Server-side sessions (D-034).** Sessions live in PostgreSQL (`app.sessions`).
   - The browser holds only an opaque 256-bit random token in a `__Host-` cookie. The database
     stores only its SHA-256 hash.
   - The API validates the session on every request, so revocation is immediate and consistent
     across instances.
   - Sessions have idle and absolute expiry.
   - Sessions are revoked on logout, on account lifecycle events, ownership transfer, membership
     revocation and tenant suspension or retirement.
   - A new session is issued at every login (fixation protection), and the previous one is
     revoked.
4. **Authentication contract (D-034, replaces the D-033 proof header).** The web BFF completes
   OIDC, then sends the ID token and the access token **once**, server-to-server and
   authenticated by a BFF credential, to `POST /auth/sessions`. The API verifies:
   - **ID token:** issuer; `aud` contains the web client; `azp` equals the web client; `nonce`
     present; issued no more than 5 minutes ago; `at_hash` matches the access token. Operators
     only: `amr` contains `mfa` and `auth_time` is within the maximum age.
   - **Access token:** a JWT; issuer; `aud` contains the API audience; `client_id` equals the web
     client; no `nonce`, `azp` or `at_hash`; same subject; not the same string as the ID token.
   - **ID token single use:** a consumed-token table records each ID token.

   After that, owner and operator routes accept only `Authorization: Session <token>` **plus** the
   BFF credential. Bearer JWTs and `X-Authentication-Proof` are no longer accepted.

5. **Operator identity (B-03).** Operator database functions take the session token hash and
   derive the operator account inside the database from a live, MFA-bearing operator session. The
   caller no longer supplies the operator identity.
6. **Owner account lifecycle (E-01, D-036).** Audited `SECURITY DEFINER` operator functions, all
   using compare-and-set on the expected state:
   - deactivate and reactivate an account;
   - revoke owner access;
   - unlink and re-link an identity;
   - transfer ownership;
   - read the tenant owner.

   Invariant: every **active** tenant has exactly one active owner membership whose account is
   active and linked. At most one active owner per tenant is enforced by a partial unique index.

7. **Operator outcome accuracy (B-02).** Every operator call carries an `operation_id`, which is
   unique in the audit table. If the outcome is unknown (connection lost), the API reconciles by
   looking up that id. A retry with the same id can never apply twice.
8. **Database failure handling (B-01).**
   - Pool and client error listeners.
   - Statement, lock and idle-in-transaction timeouts.
   - Connection-class errors map to `503`.
   - One bounded retry for idempotent reads only.
   - A readiness endpoint.
9. **Rate limiting (D-037, amends D-031).**
   - Express middleware that runs before body parsing.
   - One shared limiter per process, so budgets are per group, not per route or module.
   - O(1) eviction.
   - IPv6 keyed by `/64`.
   - An explicit trusted-proxy list (CIDRs) using the right-most untrusted `X-Forwarded-For`
     algorithm.
   - The BFF's forwarded client address is trusted only with a valid BFF credential.
   - Still instance-local. This is recorded honestly, with an edge limiter as a pre-production
     blocker.
10. **Web login abuse controls (D-038).**
    - Per-address and global limits on `/auth/*`.
    - A global cap on outbound token requests.
    - Single-use login transactions.
    - Code-format pre-checks before any provider call.
    - The ID token is no longer placed in the logout URL (`client_id` is used instead).

## Sequencing and dependencies

1. Database migrations and provisioning: the foundation for everything else.
2. Database runtime: startup check, failure handling, migrator.
3. API session and authentication (needs 1).
4. Operator lifecycle and reconciliation (needs 1 and 3).
5. Rate limiting (independent of 3 and 4, but touches `create-app.ts`).
6. Web BFF (needs 3).
7. Verification, governance documents, independent adversarial review.

**Conflict control.** Shared files (`create-app.ts`, `env.ts`, `main.ts`, migrations, contracts)
are edited by one agent only, sequentially. Reviewers work read-only in separate clones.

## Security-sensitive changes needing adversarial tests

- Each of the following has a test that **reproduces the original defect** and proves it is gone:
  - C-01: same-token acceptance and ID token as access token.
  - C-02: cross-session and cross-client tokens.
  - A-01: membership in `app_owner`, `SET ROLE` and a session-default tenant.
  - A-02: a view created by `app_owner`.
  - A-03: a sloppy policy.
  - A-04: a `PUBLIC` function.
  - A-05: running migrations as superuser or as runtime, out-of-order files, `COMMIT` inside a
    migration.
  - B-01: a backend killed mid-query.
  - B-02: a lost connection after commit.
  - B-04: `TRUNCATE` or `UPDATE` of the audit table.
  - C-03: callback flooding.
  - D-01: budgets across routes.
- Further tests:
  - Session revocation and reuse after every lifecycle event.
  - Ownership-transfer races and orphan prevention.
