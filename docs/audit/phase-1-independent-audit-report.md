# Phase 1 Independent Audit Report

**Record.** This is the independent audit of Phase 1 requested in
[`phase-1-independent-audit-handoff.md`](phase-1-independent-audit-handoff.md), as delivered to the
owner on 2026-11-27. It is preserved here unchanged in substance (transcribed into Markdown) as the
input to the Phase 1 independent-audit remediation. Its findings and their dispositions are tracked
in [`phase-1-audit-findings.md`](phase-1-audit-findings.md); the remediation is recorded in
[`../STATUS.md`](../STATUS.md).

**Auditor.** A separate Claude Code session that had not implemented the Phase 1 work, operating
under a strict read-only mandate (scratch clone only; no commits, pushes or changes).

## A. Executive summary

**Verdict: PASS WITH CONDITIONS.** The foundation is real, small, and correctly scoped, and every
claimed gate reproduced. Three MEDIUM issues (two defects missed by the earlier self-audits and
one unrecorded specification conflict) needed fixing or explicit owner acceptance before formal
closure.

| Item           | Value                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository     | `thedeepakreddy/Menu-service-platflorm`                                                                                                    |
| Branch audited | `claude/new-session-7xxuoq` (matching the hand-off)                                                                                        |
| Commit audited | `c788b0e3fc96912a5062e06ac338cd2972a11aed` (17 commits); nothing committed after the closure evidence                                      |
| Method         | Disposable scratch clone, empty pnpm store, Node 24.22.3, pnpm 12.22.0; all five PDFs read in full; own probes and mutations, all reverted |
| Confidence     | High for build/test/CI claims (reproduced exactly); moderate-high for security and architecture (adversarial, not exhaustive)              |

Major findings:

- **F-01 (MEDIUM):** log redaction is quadratic. One unauthenticated request with a ~15.8 KB path
  blocked the event loop ~360 ms; eight concurrent requests raised `/health` latency from 1 ms to
  3,019 ms.
- **F-02 (MEDIUM):** runtime code can import a root devDependency (`prettier`, `eslint`) that its
  own `package.json` does not declare. It passed typecheck, lint, `pnpm arch` and all 54
  architecture tests, and was emitted into `dist`.
- **F-03 (MEDIUM, governance):** Doc 05 contradicts itself on the Phase 1 exit gate: §11 says
  "Build/test gate; tenant model and auth boundary verified"; §13 says "reproducible build/checks
  and foundation contracts". Only §13 was applied, the conflict was unrecorded, and S-02 stated
  "no contradiction found".

## B. Findings register (as delivered)

| ID   | Sev    | Title                                                                                   | Location                                                         | Blocks closure?          |
| ---- | ------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| F-01 | MEDIUM | Quadratic redaction regex allows unauthenticated event-loop DoS                         | `apps/api/src/logging/redact.ts:37,49`; `request-logging.ts:187` | Yes, unless accepted     |
| F-02 | MEDIUM | Undeclared devDependency imports (`npm-no-pkg`) bypass `no-dev-deps-in-production-code` | `tests/architecture/dependency-cruiser.config.cjs:166-178`       | Yes, unless accepted     |
| F-03 | MEDIUM | Doc 05 §11 vs §13 exit-gate conflict not recorded or resolved                           | Doc 05 §11 vs §13; S-02 §3                                       | Yes (owner decision)     |
| F-04 | LOW    | Web HSTS fixed by build-time `APP_ENV`, not runtime                                     | `apps/web/next.config.ts:41`                                     | No; fix before deploying |
| F-05 | LOW    | Redaction misses prefixed keys and other auth schemes; docs overstate it                | `redact.ts:24,33`                                                | No; correct the docs     |
| F-06 | LOW    | S-02 labels some inferred designs as BASELINE                                           | S-02 rows 6, 9, 17, 20                                           | Before approving S-02    |
| F-07 | LOW    | Log fields can be overwritten; a `bigint` makes the logger throw                        | `json-logger.ts:149,154`                                         | No                       |
| F-08 | LOW    | Stale or ambiguous governance entries                                                   | GAPS, STATUS                                                     | Doc fix                  |
| F-09 | INFO   | `pnpm_config_engine_strict=false` bypasses `engineStrict` locally                       | environment variable                                             | No (CI enforces)         |
| F-10 | INFO   | CI test only matches `run: pnpm arch`; `continue-on-error` / `\|\| true` not caught     | `boundaries.test.ts:230-233`                                     | No                       |
| F-11 | INFO   | "10 E2E" is 5 tests × 2 projects; build step is a cache hit                             | `tests/e2e/`                                                     | No                       |
| F-12 | INFO   | Startup failure prints raw Node error, not JSON; `.env` loaded silently if present      | `apps/api/package.json:8`, `main.ts`                             | No                       |
| F-13 | INFO   | `Vary: Origin` sent only for allowed origins (mitigated by `no-store`)                  | `security/cors.ts`                                               | No                       |

**F-05 evidence (synthetic values) that leaked unredacted:** `DB_PASSWORD=…`, `GITHUB_TOKEN=…`,
`AWS_SECRET_ACCESS_KEY=…`, `dbPassword=…`, `apiToken: …`, `Authorization: Token …` and `Digest …`,
`Bearer%20…`, double-escaped JSON, `X-Amz-Signature=`, `?code=`, PGP private keys, truncated PEM,
`sk_live_…`. Headers, cookies, query strings and bodies were never logged.

**F-08 items:** GAPS G-31/G-32 descriptions stale; G-38 "Nothing was implemented"; STATUS line 61
"defective… awaiting owner review"; CI run #9 not recorded; "ACCEPTED" next to "CONDITIONALLY
READY"; intermediate code commits `18a1a08`, `162f480`, `561790e`, `19e73ab` had no CI runs of
their own (only the head commit did).

**Earlier findings re-verified.** Resolved: H-01, R-01, R-02, R-04, R-06 (within D-018), N-02, L-05,
the L-10 correction, the earlier redaction fixes. Resolved for declared deps only: N-01 (F-02).
Still present, correctly classified: R-03, R-05, R-07, R-08, R-10, L-02, L-04, L-08, L-09.
Partially resolved: R-09 (F-08).

## C. Reproduced gates (commit `c788b0e`, Node 24.22.3, pnpm 12.22.0, `APP_ENV=test`)

| Gate                    | Result                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| Frozen install          | exit 0; 356 downloaded, 0 reused; lockfile passes supply-chain policies       |
| Format, lint, typecheck | exit 0                                                                        |
| Tests                   | 187 passed (contracts 12, web 8, API 85, tests 82)                            |
| Architecture            | no violations; 77 modules, 124 dependencies                                   |
| Build                   | exit 0 (cache hits from earlier steps)                                        |
| E2E                     | 10 passed                                                                     |
| Audit                   | no known vulnerabilities (both)                                               |
| Node 22 install         | `ERR_PNPM_UNSUPPORTED_ENGINE`                                                 |
| Release-age re-check    | `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on a frozen install (L-10 confirmed) |
| CI                      | run #9 (`45945535843`) success, all 14 steps executed on `c788b0e`            |

**Phase boundaries.** No unauthorized Phase 2 or later functionality.

## D. Recommendations on owner decisions (as delivered)

Approve D-010, D-013 – D-017; approve D-011's strict scope; approve D-012 as an interim denylist;
approve D-018 with its limits; approve D-019 after F-04; D-020 after F-01 and the F-05 doc
correction; D-021 after F-02; S-02 after F-06 and the F-03 record; accept I-02 as a residual;
choose a future author identity for I-03 without rewriting history; keep D-005 provisional.

## E. Closure checklist (as delivered)

1. Mandatory remediation: fix F-01 and F-02, or accept them in writing.
2. Owner decisions: record the F-03 interpretation; decide D-010 – D-021, S-02, I-02, I-03.
3. Residual-risk acceptance: F-04, F-05, F-07, R-03, R-05, R-10, L-02, L-04, L-08, L-09, F-09 – F-13.
4. Documentation reconciliation: D-020/D-021 claims and the security baseline (F-05, F-02); F-06
   in S-02; F-08 in GAPS and STATUS; record CI run #9.
5. Verification: full gates and CI on the remediation commit; regression tests for F-01 and F-02.
6. Formal closure: record closure in STATUS with approval evidence and the commit hash.

**Phase 2 readiness (as delivered).** Adequate base once G-03 – G-08, the F-03 decision and a
real-PostgreSQL CI environment are in place. The report did not authorize Phase 2.
