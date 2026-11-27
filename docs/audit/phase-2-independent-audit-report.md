# Phase 2 — Independent Security, Architecture and Exit-Gate Audit

**Status:** audit report, NOT committed. Phase 2 is **not** formally closed by this document.
**Audited commit:** `4656ab39f573188a2eb8e1b4205273cb0f893fa3` on `claude/phase-1-audit-closure-x347eo`.
**Date:** 2026-11-27. **Verdict:** **FAIL** (exit gate not met as written). The tenant-isolation
foundation is sound and the remediation needed is bounded. See §9.

## 1. Scope, method and independence

- **Scope:** Phase 2 (Tenant & Identity), M2.1–M2.6, decisions D-022 – D-033, the exit gate in
  Document 05 and `docs/architecture/phase-2-plan.md`, and CI.
- **Workspace:**
  - Disposable clones under the session scratchpad (`p2audit/master`, plus one clone per
    sub-audit).
  - Throwaway PostgreSQL 16 clusters on loopback with synthetic credentials and data only.
  - The original working tree and branch were not modified. Nothing was committed or pushed, and
    no provider accounts were touched.
- **Method:**
  - Five parallel sub-audits:
    - A: tenant isolation and RLS.
    - B: operator lifecycle and the database layer.
    - C: OIDC, D-033 and sessions.
    - D: rate limiting and abuse.
    - E: spec, decision and exit-gate conformance.
  - The lead auditor reproduced the gates and checked CI (area F).
  - Every High finding, and every surprising one, was re-checked by the lead auditor (see the
    "Confirmed by" column).
- **Independence limitation (material):**
  - The same AI system, in the same session, implemented Phase 2. Sub-agents started cold, but this
    is not organisational independence.
  - The owner should treat this report as a rigorous self-audit, and should consider a human or
    third-party review before production.
- **Mutations:** every mutation and probe was confirmed to apply before its result was interpreted
  (for example, role membership verified in `pg_auth_members`, counts taken before and after).

## 2. Reproduction of gates (run in this session, fresh install)

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | 375 packages, 0 reused; PDF hashes unchanged |
| `pnpm format:check` | pass |
| `pnpm lint` | pass (0 warnings) |
| `pnpm typecheck` | pass |
| `pnpm test` | 331 passed (contracts 31, web 41, api 166, tests 93) |
| `pnpm arch` | pass (136 modules, 350 dependencies, 0 violations) |
| `pnpm build` | pass |
| `pnpm test:db` | 105 passed (6 files), real PostgreSQL 16 |
| `pnpm test:e2e` | 10 passed |
| `pnpm audit` / `pnpm audit --prod` | no known vulnerabilities |

**CI:**

- Run #20 (`46008869486`, 1b124ba): success. The log shows 105 database tests in 6 files.
- Run #21 (`46009136692`, 4656ab3): success.
- The workflow diff since c788b0e is sound: actions are SHA-pinned, permissions are unchanged and
  `test:db` is not cached.

**History:**

- All reported commits are ancestors of HEAD, and only `docs/STATUS.md` changed after 1b124ba.
- No history was rewritten. Amended commits were never pushed in a way that rewrites published
  history.

## 3. Findings register

Severity: Critical / High / Medium / Low / Info. **P2** = blocks Phase-2 acceptance; **Prod** =
blocks production. Duplicates found by more than one area are merged, and the merged IDs are
listed.

### High

| ID | Component / location | Finding and evidence | Root cause | Remediation | P2 | Prod | Conf. | Confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **C-01** | API `identity/guards.ts:39-51`, `identity-verifier.ts:50-56`, `main.ts:56-78` | **An ID token alone satisfies both the bearer and the MFA proof.** With an operator API audience that also appears in the ID token's `aud` (multi-aud, the natural ZITADEL project-aud setup), sending the same ID token as `Authorization: Bearer` and `X-Authentication-Proof` returned **200** on `GET /operator/session`. After logout the ID token is also exposed in the RP-logout URL (`id_token_hint`, C-06). | jose `aud` is an "includes" check. There is no token-type check (`typ`, `nonce`, `auth_time`), no rule that bearer ≠ proof, and no binding between them (C-02). | The access verifier rejects tokens that carry `nonce`, or whose `aud` contains the proof audience. The guard rejects bearer === proof. Bind the proof with `azp` and `at_hash` (C-02). Add regression tests. | **Yes**: D-033's "two credentials" is not met | Yes | High (code); Medium (real ZITADEL `aud` shape) | Agent C dynamic repro; lead: code read confirms no discrimination |
| **A-01** (= B-06) | API `infrastructure/database/database.ts:92-112` (`assertSafeRuntimeRole`) | **The startup safety check accepts roles that defeat RLS.** A role that is a member of `app_owner` passes the check. Lead repro: with 2 seeded tenants, `app_runtime` with no context saw **0**, while the `app_owner` member with no context saw **2**. Agent A showed that a tenant-A owner is authorised for tenant B through the app's own `withTenant` + memberships query. Membership of a superuser (via `SET ROLE`) and a session-default `app.tenant_id` (A-07) also pass. | A denylist of the role's own attributes. It ignores role membership, `CREATEROLE`, function and schema ownership and session defaults. | Allowlist check: refuse any role membership (`pg_auth_members` / `pg_has_role`), `rolcreaterole`, any ownership in `app` (`pg_class`, `pg_proc`, `pg_namespace`), and a non-empty `app.tenant_id` at startup. Apply the same check to the operator pool. | Recommended (D-028 presents this check as the safety net) | Yes | High | Agent A, Agent B, lead (2 vs 0 rows) |
| **E-01** | Exit gate / Doc 05; STATUS exit-gate table | **Owner account lifecycle is missing.** Revoke, deactivate, transfer and re-link of an owner account are not implemented. The exit-gate assessment substituted tenant lifecycle (suspend/retire) for it. | Gate interpreted against the plan rather than the Doc 05 wording. | Implement it, or obtain an explicit, recorded owner deferral. | **Yes** (unless the owner defers it) | Yes | High | Agent E; lead read STATUS and Doc 05 mapping |

### Medium

| ID | Component / location | Finding and evidence | Remediation | P2 | Prod | Conf. |
| --- | --- | --- | --- | --- | --- | --- |
| **D-01** | `infrastructure/rate-limit/*` | **The operator budget is 60/min, not 30/min.** The guard is instantiated per module. Lead repro: `GET /operator/session` ×32 gave 30×401 then 2×429, and `POST /operator/tenants` ×32 gave the same. The budgets are per module, not per instance. This contradicts the M2.5 claim and D-031, and the test covered only one route. | One shared limiter provider per group; a test across routes. | Yes (contradicts the recorded decision) | Yes | High (lead) |
| **A-06 / B-01** | `database.ts:55-64` | **A dropped connection crashes the API.** There is no `pool.on('error')` and no per-client listener. Lead repro: terminating an idle runtime backend gave `Unhandled 'error' event … BoundPool … 57P01`, exit 1. Agent A reproduced it mid-transaction. | Pool and client error listeners that log without the connection string; a test. | Recommended | Yes | High (lead) |
| **C-02** | `guards.ts:44-51` | **The proof and the access token are bound only by iss+sub.** A proof from another session or client (different `sid`, `azp`) upgraded a non-MFA access token → 200. | Require proof `azp` = operator web client; check `at_hash`; optionally require the same `sid`. | Condition | Yes | High |
| **C-03 / E-04** | `apps/web/src/auth/handlers.ts:133-172` | **Unauthenticated token-endpoint amplification.** With one login cookie and state, 500 forged callbacks caused 500 provider token requests in about 2 s (248/s). This exceeds ZITADEL Cloud's 50 req/s per IP, and the vendor record says that triggers a 1-minute ban: a platform-wide login outage. The `/auth` routes have no rate limit. | Per-IP and global limits on `/auth/*`; a cap on outbound token requests; a single-use login transaction; pre-validate the code format. | Condition | Yes | High |
| **E-03** | D-033 vs the owner's M2.6 instruction | The owner asked for "server-side sessions". D-033 implemented an encrypted stateless cookie, so there is no server-side revocation (C-05: the cookie can be replayed after logout). | Owner ruling: accept D-033 as an interim decision with a date, or require a revocable store. | **Owner ruling needed** | Yes | High |
| **A-02** | `0001_tenancy_foundation.sql` owner policies | `*_owner_all USING (true)`: every `app_owner` path (definer functions, views, role members) sees all tenants. A view created by `app_owner` and granted to the runtime leaked 2 rows in tenant B's context, and the catalog test misses views. `app_owner` can `TRUNCATE` or `ALTER … NO FORCE` the audit table (= B-04). | `security_invoker` on views and relkind `v`/`m` in the catalog test; a separate definer role with narrow policies; append-only audit (revoke TRUNCATE, ship logs). | No | Before tenant data tables | High |
| **A-03** | `database.db.test.ts:128-144` | The policy catalog test (a `LIKE '%current_tenant_id()%'` match) accepts `… OR true`. | Exact-expression or RESTRICTIVE backstop policy test. | No | Yes | High |
| **A-04** | migrations; `pg_default_acl` empty | New functions default to PUBLIC EXECUTE. A test definer function without REVOKE was executable by both runtime and operator. | `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC`; a catalog test over all `app` functions. | No | Yes | High |
| **A-05** | `migrate.ts:45-100` | The runner does not check who runs it: run as superuser it succeeded, and the objects became superuser-owned. It also accepts out-of-order migrations, and a `COMMIT` inside a file leaves a half-applied table with RLS off. | Assert `current_user = app_owner` and not superuser; reject out-of-order migrations and transaction-control statements. | No | Yes (identity check) | High |
| **B-02** | `operator-tenants.service.ts` | A connection drop after commit is logged as "rejected" although the database applied the change. | Log "outcome unknown"; reconcile against the audit table. | No | Yes | High |
| **B-03** | operator functions | `operator_id` is asserted by the caller (the API passes it in), not derived from a database identity. | Accept for now with a recorded rationale, or use per-operator database identities or signed context. | No | Recommended | High |
| **D-02** | API body parsing | The body is parsed before the guards: 100 KB of nested JSON costs about 6 ms per request, even when rate-limited. | Limit before parsing; a smaller body limit on these routes. | No | Yes | Medium |
| **D-03** | `rate-limiter.ts` | The key table can be locked. Each refused new key costs an O(n) eviction (about 0.47 ms), and 50k addresses are cheap to get from an IPv6 /64. | Bounded LRU / O(1) eviction; aggregate IPv6 to /64. | No | Yes | Medium |
| **D-04 / D-05** | rate-limit key | The key is the exact socket address: one budget per IPv6 /128, and behind a proxy or the BFF every user shares one key. Spoofed forwarding headers are correctly ignored. | Trusted-proxy configuration; per-principal keys; an edge limiter. | No | Yes | High |
| **E-02** | M2.4 / 0003 comment | Invitation was not built, and SEQ-1 is unapproved. The 0003 comment says accounts are created by "invitation acceptance (M2.4)", which is false. | Correct the comment; owner decision on invitations. | Condition | Yes | High |
| **E-05** | operator accounts | There is no operator account provisioning path. | A documented, audited bootstrap procedure. | Condition | Yes | High |
| **E-06** | docs | Stale docs: STATUS row 2, the D-024–D-031 header, S-02 rows still OPEN, D-025 "vendor open", no Phase 2 implementation-ledger rows, and the gate assessed against the plan. C-09: D-033 says the login cookie is "path-scoped", but it uses `Path=/`. | Documentation correction. | Yes (closure hygiene) | No | High |

### Low

| ID | Summary |
| --- | --- |
| B-05 | A request already in flight during suspension still completes with 200 and data. |
| B-07 | Database-level validation is weaker than the API's (reserved slugs, issuer format, whitespace-only reason). |
| B-08 | The API accepts urlencoded bodies, and an issuer with userinfo or http. A NUL character causes a 500 (22021). Control characters are not rejected. |
| B-09 | Concurrent provisioning of the same slug can return the wrong 409 variant. |
| B-10 | The operator log has no requestId. Rejections before the database are not logged. The redacted reason differs from what is stored. |
| A-07 | A session-default `app.tenant_id` (URL options or ALTER ROLE) passes the startup check; covered by the A-01 fix. |
| A-08 | The source scan for `set_config` can be evaded (`set_config/**/(`, quoted names, `SET ROLE`). |
| A-09 | No `statement_timeout`, `idle_in_transaction_session_timeout` or `lock_timeout`. Pool exhaustion fails closed. |
| C-04 | A JWKS connection failure gives a 500 instead of 401 or 503. |
| C-05 | A stateless session can be replayed after logout (D-033 residual; see E-03). |
| C-06 | The logout URL carries the ID token. An expired session skips provider logout, so the IdP SSO session survives. |
| C-07 | Little room in the cookie size (measured 2.9–3.5 KB against a 3.8 KB cap). Overflow gives a generic 400 with no log line. |
| C-08 | The API allows an MFA max age up to 86400, but the web side is fixed at 3600. Staging and production do not require the proof audience. Without the proof, the access-token path checks `amr` but never `auth_time` freshness. |
| D-06 | A fixed window allows double bursts; uses the wall clock; fixed `Retry-After` on capacity refusal. |
| D-07 | Log amplification under attack. |
| D-08 | No server request or header timeouts (slow clients). |
| E-08 | Owner MFA is not re-evaluated. D-031 "account where present" keying is not implemented. |
| E-09 | Status vocabulary is inconsistent across docs and code. |

### Info

- A-10: `find_account` lets the runtime check whether an account exists. This is by design.
- B-11: NULL status values are safe only by accident.
- C-10: there is no entropy check on `WEB_SESSION_SECRET`, and bytes beyond 32 are dropped.
- C-11: owner and operator share one issuer. Separation relies on `aud`, account kind and
  `UNIQUE(issuer, subject)`; the cross-kind test passes.
- D-09: N instances allow N × the limit.
- E-10: one owner per tenant is not enforced.
- E-11: `apiAuthHeaders` is unused, and provisioning does not check the owner issuer against the
  configured one.

## 4. D-033 deep review

- **Works:**
  - On every operator route, the server checks `amr ∋ mfa` and `auth_time` within the max age
    (with 30 s skew).
  - Header edge cases are handled: duplicates, case, and size (431).
  - Proofs are never logged.
  - The BFF validates state, nonce, PKCE S256, `azp` and `max_age`.
- **Does not hold:**
  - The proof is not cryptographically bound to the access token (C-02).
  - With a multi-aud ID token, one credential satisfies both roles (C-01).
  - The proof can be replayed for up to the max age and survives logout (C-05, C-06).
- **Verdict:** the design intent is reasonable, but the implementation is **not production-ready**
  and does not meet D-033's own two-credential premise.
- **Minimal correction:**
  1. Token-type discrimination and bearer ≠ proof.
  2. Proof `azp` = web client.
  3. `at_hash` binding, after confirming that ZITADEL emits it.
  4. Regression tests.

## 5. Tenant isolation

**With the roles exactly as provisioned, no bypass was found.** Evidence:

- FORCE RLS on all four tables; minimal grants.
- Definer functions pin `search_path` and use qualified names, with tight EXECUTE grants.
- Context is cleaned up on every error, cancel and savepoint path.
- 1,000 interleaved jobs over a pool of 5: 2,178 checks, 0 wrong-tenant results, 0 leaks.
- Every runtime `sql` template is parameterised.

The weaknesses are in the **safety nets**:

- the startup check (A-01, High);
- `USING (true)` owner policies (A-02);
- catalog tests that would miss realistic regressions (A-03, A-04);
- the migrator's identity check (A-05).

## 6. Rate limiting, sessions and the browser gap

- **Rate limiting** works only for a single instance with direct client connections (D-01 to D-09).
  Production needs an edge limiter, proxy-aware and per-principal keys, and a shared store.
- **Sessions:**
  - Encrypted `__Host-` cookies; tokens are never exposed to JavaScript.
  - Logout is POST-only with an Origin check.
  - There is no server-side revocation (E-03, C-05).
- **Browser gap:**
  - Agent C ran a one-off Chromium login against `next start` and a TLS test provider:
    - login succeeded across sites (SameSite=Lax);
    - cookie attributes were correct and `document.cookie` was empty;
    - a cross-site logout was refused (403).
  - This is **not CI evidence**. Firefox, Safari, a reverse proxy and real ZITADEL remain
    unverified. Add a Playwright browser-login e2e test.

## 7. Vendor (ZITADEL Cloud) limitations

- EU residency is technical only: the DPA permits processing outside the EU/EEA.
- Plans, prices, certifications and the sub-processor list are UNCONFIRMED.
- The per-IP rate limit and ban interact with C-03.
- Real token shapes (multi-aud ID token, `at_hash`, `typ`) were not verified, and these decide
  C-01 and C-02.
- Nothing was tested against a real tenant, so production use stays gated on the eight
  contractual items in `zitadel-cloud-verification.md`.

## 8. Residual risks

- Same-system authorship (see §1).
- Single-instance assumptions throughout (rate limiter, sessions).
- The audit trail can be erased by `app_owner`.
- Only the Chromium browser flow was exercised, and not in CI.
- The production database provisioning (roles, TEMP and `public` grants) is not in the repo and
  was not audited.

## 9. Exit-gate assessment and verdict

**Verdict: FAIL.**

Phase 2 must not be accepted as it stands. Reasons:

1. **E-01:** a Doc 05 exit-gate item (owner account lifecycle) is not implemented, and no owner
   deferral is recorded.
2. **C-01:** the operator MFA control does not meet its own decision (D-033) in the configuration
   that decision targets.
3. **D-01:** contradicts the recorded D-031 budget.
4. **E-03:** the owner instruction "server-side sessions" was reinterpreted without an owner
   ruling.

**What passed:**

- All gates reproduce green, and CI is genuinely green.
- RLS isolation holds under the provisioned roles.
- Architecture boundaries hold.
- No provider-specific code was found, and there was no scope creep.

**Path to PASS WITH CONDITIONS** (bounded work):

- Fix C-01, C-02, A-01, D-01 and B-01/A-06, with regression tests.
- Obtain owner rulings on E-01 (implement or defer) and E-03.
- Correct the docs (E-06, E-02 comment, C-09).
- Record the Medium and Low items as tracked production conditions.

## 10. Owner acceptance checklist

- [ ] Ruling on E-01: implement owner account lifecycle in Phase 2, or defer with a recorded decision.
- [ ] Ruling on E-03: accept stateless sessions as interim (with an end date), or require a revocable store.
- [ ] Approve remediation of C-01, C-02, A-01, D-01 and A-06/B-01.
- [ ] Decide on invitations (E-02 / SEQ-1) and operator account provisioning (E-05).
- [ ] Accept, or schedule, the production blockers: C-03, A-02–A-05, B-02–B-04, D-02–D-05.
- [ ] Obtain the ZITADEL contractual confirmations (§7), and confirm the real ID-token `aud` and `at_hash` behaviour.
- [ ] Consider an independent human or third-party review before production (§1).
