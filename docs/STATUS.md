# Phase Status Ledger

Implementation status is established only by inspected repository state and executed tests
(Doc 05 §1, §3). Planning documents are not evidence. Phase order is governed by Document 05
([D-001](DECISIONS.md#d-001)).

_Last updated: 2026-11-27_

## Phase ledger

| Phase | Title                                    | Status                                                                                                                                                                                | Gate evidence                                     |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0     | Reconnaissance & specification anchoring | verified — accepted by owner 2026-11-27                                                                                                                                               | Commit `b963239`; baseline below                  |
| 1     | Foundation                               | **CLOSED** 2026-11-27. Closure verification commit `c917c43` (clean room + CI #11 success). Independent audit PASS WITH CONDITIONS; conditions remediated; owner decisions reconciled | See "Phase 1 formal closure"                      |
| 2     | Tenant & identity                        | **authorized** (owner, 2026-11-27); Phase 1 gate satisfied. Starting with the G-03 – G-08 entry decisions                                                                             | Phase 1 closure; [G-03–G-08, G-36, G-38](GAPS.md) |
| 3     | Customer platform foundation             | not started                                                                                                                                                                           | —                                                 |
| 4     | Menu domain                              | not started                                                                                                                                                                           | —                                                 |
| 5     | Customer experience                      | not started                                                                                                                                                                           | —                                                 |
| 6     | Owner workspace                          | not started                                                                                                                                                                           | —                                                 |
| 7     | QR & promotions                          | not started                                                                                                                                                                           | —                                                 |
| 8     | Publishing & analytics                   | not started                                                                                                                                                                           | —                                                 |
| 9     | Progressive AI & integrations            | not started                                                                                                                                                                           | —                                                 |
| 10    | Release hardening                        | not started                                                                                                                                                                           | —                                                 |

## Phase 0 baseline (inspected 2026-11-27)

| Item                                               | Observed state                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Repository                                         | `Menu-service-platflorm`                                                     |
| Branch                                             | `claude/new-session-7xxuoq`, created from `main` at `075182c Initial commit` |
| Working tree before Phase 0 docs                   | Clean                                                                        |
| Tracked files before Phase 0 docs                  | `README.md` only (contains only the repository name)                         |
| Application code / entry points                    | None                                                                         |
| Package manifests, lockfiles, dependencies         | None                                                                         |
| Tests, test tooling                                | None                                                                         |
| CI configuration                                   | None                                                                         |
| Infrastructure, Docker, IaC                        | None                                                                         |
| Database, migrations, schema                       | None                                                                         |
| Authentication / authorization                     | None                                                                         |
| Agent instruction files (`CLAUDE.md`, `AGENTS.md`) | None                                                                         |
| Build/test baseline                                | Not applicable — nothing to build or test                                    |

**Conclusion:** This is a greenfield repository. No requirement in Documents 01–05 is implemented.

## Implementation ledger

Requirements are mapped to code paths, tests and evidence as they are implemented. Status
becomes `verified` only after owner gate acceptance. Phase 1 rows were accepted on 2026-11-27.

| Requirement / ref                                            | Phase | Code paths                                                                                                                                                                                                                                                                                                  | Tests                                                                                                                                      | Status                                                                                                                                                                     |
| ------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doc 05 §13 P1: project structure / workspaces (P-101, P-109) | 1     | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/`, `packages/`, `tests/`                                                                                                                                                                                                                         | all gates                                                                                                                                  | verified                                                                                                                                                                   |
| Doc 05 §13 P1: type standards (P-103)                        | 1     | `packages/config/tsconfig/*`, `tsconfig.base.json`                                                                                                                                                                                                                                                          | `pnpm typecheck`                                                                                                                           | verified                                                                                                                                                                   |
| Doc 05 §13 P1: validation standards (Zod)                    | 1     | `packages/contracts/src/*`                                                                                                                                                                                                                                                                                  | `packages/contracts/src/contracts.test.ts`                                                                                                 | verified                                                                                                                                                                   |
| Doc 05 §13 P1: environments (P-107)                          | 1     | `apps/api/src/env.ts`, `apps/web/src/env.ts`, `apps/web/next.config.ts`, `apps/*/.env.example`                                                                                                                                                                                                              | `apps/*/src/env.test.ts`, `tests/startup/env-rejection.test.ts`                                                                            | verified                                                                                                                                                                   |
| Doc 05 §13 P1: API conventions, error handling (P-108)       | 1     | `packages/contracts/src/errors.ts`, `apps/api/src/all-exceptions.filter.ts`, `apps/api/src/request-id.ts`                                                                                                                                                                                                   | `apps/api/src/app.test.ts`, `request-id.test.ts`, `tests/e2e/smoke.spec.ts`                                                                | verified                                                                                                                                                                   |
| Doc 05 §13 P1: API skeleton                                  | 1     | `apps/api/src/{main,create-app,app.module}.ts`, `apps/api/src/modules/health/*`                                                                                                                                                                                                                             | `apps/api/src/app.test.ts`, `di.test.ts`, e2e                                                                                              | verified                                                                                                                                                                   |
| Doc 05 §13 P1: frontend skeleton                             | 1     | `apps/web/src/app/*`, `apps/web/next.config.ts`                                                                                                                                                                                                                                                             | e2e (desktop + mobile)                                                                                                                     | verified                                                                                                                                                                   |
| Doc 05 §13 P1: testing foundations (P-105)                   | 1     | `*/vitest.config.ts`, `tests/e2e/playwright.config.ts`                                                                                                                                                                                                                                                      | `pnpm test`, `pnpm test:e2e`                                                                                                               | verified                                                                                                                                                                   |
| Doc 05 §13 P1: lint/format (P-104)                           | 1     | `eslint.config.mjs`, `packages/config/eslint.js`, `.prettierrc`                                                                                                                                                                                                                                             | `pnpm lint`, `pnpm format:check`                                                                                                           | verified                                                                                                                                                                   |
| Doc 02 §3: boundary enforcement in CI (P-104)                | 1     | `tests/architecture/*`                                                                                                                                                                                                                                                                                      | `tests/architecture/boundaries.test.ts`, `pnpm arch`                                                                                       | verified at acceptance; defective (audit H-01, M-01–M-03), remediated; undeclared-dependency bypass (independent audit F-02) remediated `2f15e8f`; approved (D-010, D-021) |
| Doc 05 §13 P1: CI (P-106)                                    | 1     | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                                  | GitHub Actions run                                                                                                                         | verified (CI run #1)                                                                                                                                                       |
| Doc 05 §5: durable context (P-110)                           | 1     | `CLAUDE.md`, `docs/*`                                                                                                                                                                                                                                                                                       | —                                                                                                                                          | verified                                                                                                                                                                   |
| Security foundations (Phase 1 baseline: D-019, D-020)        | 1     | `apps/api/src/security/`, `apps/api/src/logging/`, `apps/api/src/env.ts`, `apps/api/src/all-exceptions.filter.ts`, `apps/web/src/security-headers.ts`, `apps/web/next.config.ts`, earlier controls (x-powered-by off, generic errors, request-id sanitising, D-005, SHA-pinned Actions, read-only CI token) | `security-baseline.test.ts`, `logging/*.test.ts`, `all-exceptions.filter.test.ts`, `env.test.ts`, `security-headers.test.ts`, startup, e2e | implemented; independent audit F-01, F-04, F-05, F-07 remediated (`fc1e157`, `3f8d21f`); approved (D-019, D-020)                                                           |

## Phase 1 gate evidence

### Local run (2026-11-27, container, from a clean tree)

All `node_modules`, `dist`, `.next` and Turborepo caches were deleted first. Toolchain: Node
v24.22.3, pnpm 12.22.0. Environment: `APP_ENV=test`, `TURBO_TELEMETRY_DISABLED=1`.

| #   | Command                          | Result                                                                         |
| --- | -------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `pnpm install --frozen-lockfile` | exit 0                                                                         |
| 2   | `pnpm format:check`              | exit 0: "All matched files use Prettier code style!"                           |
| 3   | `pnpm lint`                      | exit 0: packages built, then `eslint . --max-warnings=0` reported no problems  |
| 4   | `pnpm typecheck`                 | exit 0: 7/7 turbo tasks                                                        |
| 5   | `pnpm test`                      | exit 0: contracts 12, web 3, api 25, tests 14 = **54 tests passed**            |
| 6   | `pnpm arch`                      | exit 0: "no dependency violations found (55 modules, 59 dependencies cruised)" |
| 7   | `pnpm build`                     | exit 0: 3/3 tasks; Next.js routes `/`, `/_not-found` static                    |
| 8   | `pnpm test:e2e`                  | exit 0: **6 passed** (3 tests × chromium-desktop, chromium-mobile)             |

### Deliberate boundary violation (real source tree)

1. Added `apps/web/src/__violation_cross_app.ts` (imports `apps/api/src/env.ts`) and
   `apps/api/src/modules/__probe/probe.ts` (imports `health/health.controller.ts`, bypassing
   `index.ts`).
2. `pnpm arch` exited 1: `error no-cross-app-imports …` and `error api-module-encapsulation …`,
   "2 dependency violations". The Vitest boundary test also failed, listing both.
3. Removed both files. `pnpm arch` exited 0 and `git status` showed no leftover files. This was
   repeated on the final code for `no-cross-app-imports`, with the same result.
4. _[Corrected 2026-11-27, audit L-03: the configuration then had **9** rules, of which 7 had
   negative fixtures. The two uncovered rules included `no-dev-deps-in-production-code`, which did
   not work (H-01). Superseded by the per-rule fixtures of the Phase 1 audit remediation.]_
   Permanent negative coverage: `tests/architecture/fixtures/violations/` proves that each of the 7
   rules rejects a violation. Running it initially caught a broken fixture path, which shows the
   assertions are not vacuous.

### Invalid configuration rejected (built artifacts)

| Case                                            | Result                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| API, no variables                               | exit 1; `APP_ENV`, `API_HOST`, `API_PORT` "is required"                                                 |
| API, `APP_ENV=sk-live-SECRET`, `API_PORT=99999` | exit 1; "APP_ENV is invalid (invalid_value)", "API_PORT is invalid (too_big)"; the value is not printed |
| Web `next start`, invalid `APP_ENV`             | exit 1; "APP_ENV is invalid"; the value is not printed                                                  |
| Web `next build`, no `APP_ENV`                  | exit 1; "APP_ENV is required"                                                                           |

The same cases are automated in `tests/startup/env-rejection.test.ts`.

### Defects found and fixed during verification

- Zod 4 reports an absent enum as `invalid_value`, so "required" was misreported. The fix checks
  presence on the raw source.
- Turborepo strict env mode hid `APP_ENV` from tasks. It is now declared in `turbo.json` (D-008).
- The relative `extends` path broke under Vite/Oxc. The base tsconfig moved into `packages/config`.
- From a clean tree, type-aware lint failed because the `@platform/contracts` declarations did not
  exist yet. `pnpm lint` now builds `packages/*` first.
- `CLAUDE.md` initially claimed that Vitest lacks decorator metadata. A probe showed this was
  false; the claim was removed and `apps/api/src/di.test.ts` now guards the behaviour.
- Lint relaxations were removed in favour of code fixes (see D-007).

### CI (GitHub Actions)

| Item                 | Value                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run                  | CI #1, run id `45929039778`, job `140277112902` (`ubuntu-latest`)                                                                                                                                                                                                              |
| Commit               | `f383bc09b9099445f399a5d7f5645d54f9bd4835` on `claude/new-session-7xxuoq`                                                                                                                                                                                                      |
| Conclusion           | **success** (started 2026-11-27T02:33:36Z, completed 02:34:38Z)                                                                                                                                                                                                                |
| Toolchain (from log) | Node v24.22.3, pnpm 12.22.0; "Lockfile is up to date" with `--frozen-lockfile`                                                                                                                                                                                                 |
| Steps                | install, format, lint, typecheck, test (contracts 12, web 3, api 25, tests 14), arch (55 modules, 59 dependencies, no violations), build, Playwright Chromium install (v1243, matching D-006), e2e **6 passed**. The upload-report step was skipped (it runs only on failure). |
| Note                 | The Build step was a Turborepo cache hit, because typecheck had already built all packages earlier in the same job (`^build` dependency). The build itself ran and succeeded inside the typecheck step.                                                                        |

Later documentation-only commits on the same branch:

| Run                   | Commit                     | Conclusion                                                                                                                                                                             |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI #2 (`45929507482`) | `70694d2` (STATUS.md only) | **cancelled**: superseded by run #3 under the workflow's `cancel-in-progress` concurrency rule, a few seconds after it started. Not a failure, and it produced no verification result. |
| CI #3 (`45929527945`) | `3a9009e` (STATUS.md only) | **success**                                                                                                                                                                            |

## Phase 1 acceptance

| Item                          | Record                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision                      | Phase 1 **ACCEPTED** by the owner on 2026-11-27, "based on the verification evidence you supplied"                                                                                                                                                                          |
| Accepted decisions            | P-101 – P-110 (verified); D-004, D-006, D-008, D-009 (approved); D-007 (approved, scoped to the NestJS decorated-class exception only); D-005 (approved **provisionally**, with conditions; review by the Phase 10 gate at the latest) — see [`DECISIONS.md`](DECISIONS.md) |
| Unresolved                    | Everything in [`GAPS.md`](GAPS.md) marked `open` remains open, including G-01 (incomplete Doc 02), G-03–G-13 and G-29–G-35. Acceptance of Phase 1 does not resolve any of them.                                                                                             |
| Independent audit             | **Pending.** The owner has requested an independent audit of the Phase 1 implementation by a second reviewer ("Account 2") before Phase 2. Review packet: [`audit/phase-1-review-packet.md`](audit/phase-1-review-packet.md).                                               |
| Code changes after acceptance | None. Only documentation changed after `f383bc0`. No further code changes without explicit owner authorization.                                                                                                                                                             |
| Phase 2                       | Not authorized.                                                                                                                                                                                                                                                             |

## Commit history rewrite (2026-11-27)

**Authorization:** owner instruction (never put session links on GitHub; attribute commits as
"Built by Deepak, assisted by Claude.") and explicit owner approval ("Yes") to rewrite the existing
commit messages and force-push `claude/new-session-7xxuoq`.

**What changed:** only the commit messages of the six commits after `075182c`. `Claude-Session:`
links and agent `Co-Authored-By:` trailers were removed, and the attribution line was added.
`075182c Initial commit` is untouched. **No file content changed**: each rewritten commit has the
same git tree hash as its original.

| Original commit                            | Rewritten commit                           | Tree (identical)                           | Subject                                         |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------- |
| `5d7c2cb477a928a5695361316371126839280527` | `b963239f09c1260314589861941ace50e9f28f1f` | `5946ec290347472475f719b0177f99e1c1ed61d2` | Phase 0: specifications and governance docs     |
| `e0fd9eb43863dd25c816290b079ca16af550b104` | `f383bc09b9099445f399a5d7f5645d54f9bd4835` | `3cdbc960eff86ca152f56c03ef80998863570eb8` | Phase 1: foundation scaffold (**audited code**) |
| `10199e813cb9045a4219c3d682811c800723cffe` | `70694d2372ff6e6cd887945026ba55fc34d70728` | `472c4b744d804c4aafeb3bb311e79e1f33a34478` | Phase 1: record CI evidence                     |
| `0787737da3044cb0727ed5924766d84e78073bbd` | `3a9009ec6e4704996103a8972f8b7a9334580ff1` | `37c5f0caeb8ee7484d49649d9fe7a2658fd49149` | Phase 1: ledger row fix                         |
| `57c7430280046ee4455550100d49eabdd26c8521` | `afc1b98abecf2a0c3b85f4b3570182137f4dfc29` | `008cbfef70109db6fbe5d8a6de0854df32a950d8` | Phase 1: acceptance records and audit packet    |
| `8c118e8a2c7cf3f6288b878c32001ac9c20c53dd` | `3b328786a11a650054511ee89ce2941070f6701c` | `0d10724e004cf9d3b5168218d87995f41846fa84` | Docs: attribution convention                    |

**Effect on evidence:** CI runs #1 (`45929039778`), #2 and #3 ran on the **original** commit IDs.
In GitHub Actions they are listed under those IDs, which are no longer on the branch. Because the
trees are identical, run #1's result applies to the same code as `f383bc0`; this can be checked with
`git rev-parse f383bc0^{tree}` → `3cdbc960…`. CI runs again on the rewritten branch head when it is
pushed.

## Phase 1 audit remediation (2026-11-27)

**Authorization:** owner message "Phase 1 Remediation — Independent Audit Findings". This is
recorded separately from the Phase 1 acceptance above, which is unchanged. **Status:**
implemented and verified as below — **awaiting the owner's review and acceptance.** Phase 2
remains **not authorized**.

| Item               | Value                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Audit              | PASS WITH CONDITIONS on `f383bc0`. Findings register: [`audit/phase-1-audit-findings.md`](audit/phase-1-audit-findings.md)              |
| Starting commit    | `47559ad7b2cffcb86b92d56bb35697383f549c71`                                                                                              |
| Remediation commit | `3343393e20d5c1d97749532cc77000d4dcc78654` (code, tests, fixtures, config, docs)                                                        |
| Scope              | H-01, M-01, M-02, M-03, L-01, L-03, L-06, L-07, L-10; G-08 re-scoped; G-36 – G-41 added. No files under `apps/` or `packages/` changed. |
| Decisions          | D-010 – D-015 (implemented, awaiting owner review; D-011's type-only scope is proposed)                                                 |

### Clean-room verification of `3343393`

A fresh clone of the commit was verified with an empty pnpm store (all 356 packages downloaded
from the registry, 0 reused), an empty Corepack cache (pnpm 12.22.0 freshly downloaded and
hash-checked), Node v24.22.3, `APP_ENV=test` and `TURBO_TELEMETRY_DISABLED=1`. Playwright used
the browsers preinstalled in the container (Chromium v1243).

| #   | Command                                              | Result                                                                                                |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `pnpm install --frozen-lockfile --store-dir <empty>` | exit 0                                                                                                |
| 2   | `pnpm format:check`                                  | exit 0                                                                                                |
| 3   | `pnpm lint`                                          | exit 0                                                                                                |
| 4   | `pnpm typecheck`                                     | exit 0                                                                                                |
| 5   | `pnpm test`                                          | exit 0: contracts 12, web 3, api 25, tests 58 (architecture 41, policy 12, startup 5) = **98 passed** |
| 6   | `pnpm arch`                                          | exit 0: no violations (59 modules, 75 dependencies; before remediation 55 / 59)                       |
| 7   | `pnpm build`                                         | exit 0                                                                                                |
| 8   | `pnpm test:e2e`                                      | exit 0: **6 passed**                                                                                  |
| 9   | `pnpm audit` / `pnpm audit --prod`                   | "No known vulnerabilities found" (both)                                                               |
| 10  | API `node dist/main.js` without env                  | exit 1; `APP_ENV`, `API_HOST`, `API_PORT` "is required"                                               |
| 11  | API with `APP_ENV=sk-live-SECRET`, `API_PORT=99999`  | exit 1; "invalid (invalid_value)", "invalid (too_big)"; the value is not printed                      |
| 12  | `next build` without `APP_ENV`                       | exit 1; "APP_ENV is required"                                                                         |
| 13  | `pnpm install --frozen-lockfile` on Node 22.23.5     | exit 1; `ERR_PNPM_UNSUPPORTED_ENGINE` (L-01)                                                          |
| 14  | `git status` after all of the above                  | clean                                                                                                 |

### Audit bypass probes re-run on the clean clone

| Probe (audit)                                    | Before            | After                                                        |
| ------------------------------------------------ | ----------------- | ------------------------------------------------------------ |
| E1 web imports `apps/api/dist`                   | not reported      | `no-workspace-build-output-imports` + `no-cross-app-imports` |
| E1b web imports `packages/contracts/dist`        | passed every gate | `no-workspace-build-output-imports`                          |
| E4 API root file imports module internals        | not reported      | `api-module-entry-only`                                      |
| E5 runtime code imports `vitest` (devDependency) | not reported      | `no-dev-deps-in-production-code`                             |
| E10 contracts imports `node:http`                | not reported      | `contracts-allowlist`                                        |
| E7 computed `require()` path                     | not reported      | still not reported: a static-analysis limit (L-04, open)     |

### Architecture regression suite (`tests/architecture/boundaries.test.ts`, 41 tests)

- **Inventory:** the configured rules, the fixture directories and the expectations must match
  exactly (12 rules).
- **For each of the 12 rules:** (a) the rule's fixture files are in the cruised graph; (b) every
  violation belongs to that rule and comes from exactly the expected files; (c) with the rule
  removed, the fixture produces no violations.
- **Valid fixture:** all allowed patterns produce no violations, and every dependency resolves.
- **Real repository:** no violations; the sources are cruised and the fixtures are not.
- **Graph integrity (H-01):** named edges are present with their real types (`next`, `vitest`
  npm-dev, `zod`, `@nestjs/common`, `@platform/contracts` → `dist` as a non-local import), and
  no source edge is missing compared with an unexcluded baseline.

**Mutation checks** (the config was changed temporarily and restored byte-identical afterwards):

| Mutation                                                  | Result                                                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Restore the original unanchored `dist/` exclusion (H-01)  | 7 tests fail (both graph-integrity tests, the valid fixture, and the contracts-allowlist, no-dev-deps, web-no-db and build-output rules) |
| Weaken contracts-allowlist back to the framework denylist | 1 test fails (contracts-allowlist)                                                                                                       |
| Delete `api-module-entry-only`                            | 1 test fails (inventory)                                                                                                                 |
| Restrict the build-output rule to npm (non-local) imports | 1 test fails (build-output rule)                                                                                                         |
| Lower `minimumReleaseAge` to 1440                         | supply-chain policy test fails                                                                                                           |

### Corrections to earlier records

- **L-10 (audit claim):** pnpm 12.22.0 does re-verify the lockfile against `minimumReleaseAge` on
  `--frozen-lockfile` installs (reproduced: `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). The audit
  statement was incorrect; see D-015.
- **L-01:** `engines` was not enforced at Phase 1 acceptance; it is now (D-013).
- **L-03:** at acceptance, 7 of 9 rules had negative fixtures, not "each" rule. Now all 12 rules
  have them.

### Not done or not reproduced

- GitHub Actions on the remediation commit: see the CI run recorded after the push.
- L-02, L-04, L-05, L-08 and L-09 are open (out of scope). I-02 and I-03 await owner decisions.
- M-04 and M-05 were recorded as Phase 2 prerequisites (G-38) and not implemented.

## Phase 1 residual remediation (2026-11-27)

**Authorization:** owner message "Phase 1 Audit Residual Remediation — R-01 and R-02". Recorded
separately from the Phase 1 acceptance and from the first audit remediation above. **Status:**
implemented and verified as below — **awaiting owner review and independent audit.** Phase 2
remains **not authorized**.

| Item                        | Value                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Starting commit             | `9a800bcc6afaccbc8dc8b5f6d0c5bbdf3a65559b`                                                                                                                               |
| Residual remediation commit | `36a8c7241059db0a5db580b734a2b00f882a4c7e` (tests, fixtures, config, docs)                                                                                               |
| Scope                       | R-01, R-02 (mandatory); R-04, R-06 (optional, implemented narrowly); R-09 governance corrections. No files under `apps/`, `packages/` or `docs/specifications/` changed. |
| Decisions                   | D-016 – D-018, and a D-010 correction (awaiting owner review)                                                                                                            |
| Left open                   | R-03, R-05, R-10 (not authorized); R-07, R-08 informational; L-02, L-04, L-05, L-08, L-09, I-02, I-03 unchanged                                                          |

### Before and after (reproduced)

| Reproduction                                                                                    | Before (`9a800bc`, scratch clone)                                                                                        | After (`36a8c72`, clean-room clone)                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| R-01: `packages/contracts/src/helper.test.ts` imports `node:http`; `laundered.ts` re-exports it | `pnpm arch` exit 0; `tsc -p tsconfig.build.json` exit 0, emitting `helper.test.js` (imports `node:http`) into the output | `pnpm arch` exit 1: `no-runtime-imports-of-test-files: packages/contracts/src/laundered.ts → packages/contracts/src/helper.test.ts` |
| R-02: `apps/api/src/modules/registry.ts` imports `./health/health.controller.js`                | `pnpm arch` exit 0                                                                                                       | `pnpm arch` exit 1: `api-module-entry-only: apps/api/src/modules/registry.ts → apps/api/src/modules/health/health.controller.ts`    |
| R-02 counterpart: `registry.ts` re-exports `./health/index.js` (public entry)                   | —                                                                                                                        | `pnpm arch` exit 0 (allowed)                                                                                                        |

### Clean-room verification of `36a8c72`

Fresh clone; empty pnpm store (356 packages downloaded, 0 reused) and empty Corepack cache; Node
v24.22.3; `APP_ENV=test`. Playwright used the browsers preinstalled in the container.

| #   | Command                                              | Result                                                                                                                 |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm install --frozen-lockfile --store-dir <empty>` | exit 0; "Lockfile passes supply-chain policies"                                                                        |
| 2   | `pnpm format:check`                                  | exit 0                                                                                                                 |
| 3   | `pnpm lint`                                          | exit 0                                                                                                                 |
| 4   | `pnpm typecheck`                                     | exit 0                                                                                                                 |
| 5   | `pnpm test`                                          | exit 0: contracts 12, web 3, api 25, tests 74 (architecture 45, build-output 4, policy 20, startup 5) = **114 passed** |
| 6   | `pnpm arch`                                          | exit 0: no violations (66 modules, 89 dependencies; all of `tests/` now scanned)                                       |
| 7   | `pnpm build`                                         | exit 0                                                                                                                 |
| 8   | `pnpm test:e2e`                                      | exit 0: **6 passed**                                                                                                   |
| 9   | `pnpm audit` / `pnpm audit --prod`                   | "No known vulnerabilities found" (both)                                                                                |
| 10  | Frozen install on Node 22.23.5                       | exit 1: `ERR_PNPM_UNSUPPORTED_ENGINE`                                                                                  |
| 11  | `git status` after all checks and reproductions      | clean                                                                                                                  |

### Regression tests and mutation checks

- **Fixtures:** `rules/no-runtime-imports-of-test-files/` covers re-export, value, type-only,
  dynamic and `typeof import()` forms, plus `*.spec.*`, `__tests__/` and `.tsx`.
  `rules/api-module-entry-only/` gains a registry file and a re-exporting barrel directly under
  `src/modules/`. `valid/` gains a public-entry `modules/index.ts` barrel and test-to-test imports,
  and still produces no violations.
- **Real graph:** a reachability test asserts that no non-test workspace file reaches a test file
  through any chain of imports. `build-output.test.ts` asserts that no test file exists in
  `packages/contracts/dist` or `apps/api/dist`; a planted `leak.test.js` made it fail.
- **R-04:** the scanned `tests/` modules are exactly the eight source files; fixtures,
  `node_modules` and reports are not scanned.
- **R-06:** 8 new policy tests. Planting `--config.minimumReleaseAge=0` in the real `ci.yml` made
  the repository test fail and name `.github/workflows/ci.yml:43`.

Each mutation was applied temporarily and restored byte-identical:

| Mutation                                           | Result                                         |
| -------------------------------------------------- | ---------------------------------------------- |
| Delete `no-runtime-imports-of-test-files`          | 1 test fails (rule inventory)                  |
| Revert the R-02 exemption to all of `src/modules/` | 1 test fails (`api-module-entry-only` fixture) |
| Narrow the test-file pattern to `.test.ts` only    | 1 test fails (R-01 fixture)                    |
| Limit the R-01 rule to `packages/`                 | 1 test fails (R-01 fixture)                    |

### Not done or not reproduced

- GitHub Actions on the residual-remediation commit: see the CI run recorded after the push.
- R-03, R-05 and R-10 remain open (not authorized).

## Phase 1 completion work (2026-11-27)

**Authorization:** owner message "PHASE 1 — COMPLETE REMAINING WORK, CLOSEOUT PREPARATION &
FINAL VERIFICATION". **Status:** implemented and **self-verified** (an internal adversarial
review by the implementing session, not an independent audit). **Closure: CONDITIONALLY READY** —
owner decisions and an independent audit remain; see
[`audit/phase-1-closure-package.md`](audit/phase-1-closure-package.md). Phase 2 remains **not
authorized**.

| Item                                              | Value                                                          |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Starting commit                                   | `a0c9534b101bf878becdad1e7f5422601a3e4e0b`                     |
| Security and logging baseline (G-36, G-38, L-05)  | `18a1a08`                                                      |
| Architecture enforcement (N-01, N-02)             | `162f480`                                                      |
| Governance, S-02, closure package, audit hand-off | `561790e`                                                      |
| Redaction hardening after adversarial review      | `19e73ab77c01d305c30a2780d8d1dbef228399d2` (final code commit) |
| Decisions                                         | D-019 – D-021 (awaiting owner review)                          |
| Specification PDFs                                | unchanged (SHA-256 verified)                                   |

### Clean-room verification of `19e73ab`

Fresh clone; empty pnpm store (356 downloaded, 0 reused) and empty Corepack cache; Node v24.22.3;
`APP_ENV=test`. Playwright used the Chromium already installed in the container (not a fresh
download).

| #   | Check                                                                                                     | Result                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm install --frozen-lockfile --store-dir <empty>`                                                      | exit 0                                                                                                                                                                                                                                      |
| 2   | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                                                        | exit 0                                                                                                                                                                                                                                      |
| 3   | `pnpm test`                                                                                               | **187 passed**: contracts 12, web 8, api 85, tests 82 (architecture 54, build-output 4, policy 20, startup 8) — includes CORS, headers, logging, redaction, filter-guard, N-01, N-02 and policy tests                                       |
| 4   | `pnpm arch`                                                                                               | no violations (77 modules, 124 dependencies)                                                                                                                                                                                                |
| 5   | `pnpm build`                                                                                              | exit 0                                                                                                                                                                                                                                      |
| 6   | `pnpm test:e2e`                                                                                           | **10 passed** (adds API and web security-header checks and the CORS default)                                                                                                                                                                |
| 7   | `pnpm audit` / `pnpm audit --prod`                                                                        | no known vulnerabilities                                                                                                                                                                                                                    |
| 8   | Frozen install on Node 22.23.5                                                                            | exit 1, `ERR_PNPM_UNSUPPORTED_ENGINE`                                                                                                                                                                                                       |
| 9   | Built API via `main.ts`, with `APP_ENV=production` and `API_CORS_ALLOWED_ORIGINS=https://allowed.example` | Allowed-origin preflight: `204` with the origin echoed and no credentials header. Other origin: no CORS headers. HSTS present. Every stdout line is valid JSON. **0** occurrences of the bearer, cookie, query-token and e-mail values sent |
| 10  | N-01 reproduction (`apps/web/lib/h.ts` imports `vitest`, used from `src/`)                                | rejected: `no-dev-deps-in-production-code`                                                                                                                                                                                                  |
| 11  | `git status` afterwards                                                                                   | clean                                                                                                                                                                                                                                       |

### Mutation checks (each restored byte-identical; all caught)

| Mutation                                             | Tests failing               |
| ---------------------------------------------------- | --------------------------- |
| N-01: revert the devDependency scope to `src/`       | 1                           |
| N-01: also exempt `next.config.*`                    | 1                           |
| N-01: drop the tooling-config laundering guard       | 1                           |
| H-01: add an unanchored `node_modules/` exclusion    | 6 (anchoring and integrity) |
| N-02: revert the `pnpm arch` scan list               | 1                           |
| N-02: drop `packages` from the `pnpm arch` scan list | 1                           |
| N-02: CI stops running `pnpm arch`                   | 1                           |
| Drop `X-Frame-Options`                               | 1                           |
| CORS `credentials: true`                             | 1                           |
| CORS reflects any origin                             | 4                           |
| Accept a wildcard origin                             | 3                           |
| Allow http origins in production                     | 2                           |
| Stop redacting the `authorization` key               | 1                           |
| Stop redacting URL credentials                       | 4                           |
| Log the full URL with query string                   | 1                           |
| Log request headers                                  | 1                           |
| Stop redacting e-mail (clean-room clone)             | 1                           |
| Case-sensitive `Bearer` (clean-room clone)           | 1                           |
| Exact-name key matching (clean-room clone)           | 2                           |

### Internal adversarial review

Probes of the new redaction found six cases it missed: lowercase `bearer`, JSON-quoted tokens,
PEM keys, AWS key ids, e-mail addresses, and sensitive key variants such as `x-auth-token`. They
were fixed in `19e73ab`, with regression tests. Phone numbers, names and generic high-entropy
strings remain documented limitations.

### Not done or not reproduced

- GitHub Actions on these commits: _recorded later (F-08):_ CI #9, run `45945535843`, on
  `c788b0e` (the head that contained all four completion commits): **success**, all 14 steps
  executed. The intermediate commits `18a1a08`, `162f480`, `561790e` and `19e73ab` were pushed
  together and have no CI runs of their own; their content is covered by run #9 on the head.
- _At the time of writing_, no independent audit had been performed; see
  [`audit/phase-1-independent-audit-handoff.md`](audit/phase-1-independent-audit-handoff.md).
- G-03 – G-08, S-02, D-010 – D-021, I-02 and I-03 await owner decisions; no approval was assumed.

## Phase 1 independent-audit remediation (2026-11-27)

**Authorization:** owner message "MASTER EXECUTION PROMPT — PHASE 1 REMEDIATION, FORMAL CLOSURE &
PHASE 2 IMPLEMENTATION" (Parts IV – VII). **Input:** the independent audit of `c788b0e`
([`audit/phase-1-independent-audit-report.md`](audit/phase-1-independent-audit-report.md)),
verdict PASS WITH CONDITIONS. **Branch:** `claude/phase-1-audit-closure-x347eo`, fast-forwarded
from `c788b0e` (no history rewritten). Phase 2 had not started.

| Commit    | Scope                                                                                       |
| --------- | ------------------------------------------------------------------------------------------- |
| `fc1e157` | F-01 bounded, linear redaction; F-05 patterns; F-07 logger reserved fields and BigInt       |
| `2f15e8f` | F-02 `no-undeclared-dependencies` rule and fixture; every rule must be `error`              |
| `3f8d21f` | F-04 web HSTS decided at runtime (`apps/web/src/proxy.ts`); startup test against the build  |
| `1588494` | F-10 CI gates cannot be swallowed                                                           |
| `919542f` | F-03 (D-022), F-06 (S-02 v2), F-08 governance reconciliation, owner decisions, D-023 (I-03) |

### Before and after (reproduced on the same machine)

| Probe                                                                         | Before (`c788b0e`) | After                                                                  |
| ----------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `redactString('a.'.repeat(8000))` (16 KB)                                     | 414 ms             | 0.1 ms                                                                 |
| One request with a 15.8 KB `a.a.a…` path                                      | 364 ms             | 2 ms                                                                   |
| `/health` latency with 8 such requests in flight                              | 3,019 ms           | 9 ms                                                                   |
| Synthetic secrets in a 500 error / path (`DB_PASSWORD=`, `API_TOKEN=`)        | leaked             | redacted                                                               |
| `apps/api` imports root devDependency `prettier`; `apps/web` imports `eslint` | passed every gate  | `pnpm arch` and the real-tree test fail (`no-undeclared-dependencies`) |
| Web built as `test`, started as `production`                                  | no HSTS            | HSTS on `/` and 404; none as `test`/`development`                      |

### Mutation checks (each reverted; all caught)

| Mutation                                                                 | Result                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Restore the old `\b…+` anchoring of the e-mail rule                      | 4 linearity tests fail (~25 s each vs a 250 ms bound) |
| `no-undeclared-dependencies` matches only `npm-unknown`                  | 1 fixture test fails                                  |
| … scoped to `apps/` only                                                 | 1 fixture test fails                                  |
| … exempts type-only imports                                              | 1 fixture test fails                                  |
| … severity `warn`                                                        | not caught before; now the severity guard fails       |
| Proxy stops setting HSTS                                                 | 2 startup tests fail (production, staging)            |
| `continue-on-error` on arch / `pnpm test \|\| true` / typecheck replaced | 1 test fails each                                     |

### Owner decisions reconciled

D-010 – D-021, S-02 (v2), I-02 (accepted), I-03 (D-023) and D-005 (retained, provisional) per
Part VI; D-022 records the Doc 05 §11/§13 interpretation (F-03). Conditions and evidence:
[`DECISIONS.md`](DECISIONS.md) → "Independent-audit remediation and owner decision
reconciliation". Residuals: [`audit/phase-1-audit-findings.md`](audit/phase-1-audit-findings.md).

### Reporting note (F-11)

`pnpm test:e2e` reports **5 tests × 2 browser projects** (desktop and mobile Chromium). The three
API checks run in both projects but exercise the API, not the browser. The `pnpm build` step in
CI is a Turborepo cache hit because `lint`/`typecheck` already built every package (`^build`);
the build itself still runs and must succeed.

## Phase 1 formal closure (2026-11-27)

**Phase 1 — Foundation is CLOSED.** Closure verification commit:
**`c917c435b58cd92014b85ef344adbda84ffff2c2`** on `claude/phase-1-audit-closure-x347eo`.
This record is a documentation-only commit on top of it.

### Closure gate (owner execution prompt, Part VII)

| #   | Condition                              | Evidence                                                                                    |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | F-01 remediated and verified           | `fc1e157`; linearity tests; before/after probe (above)                                      |
| 2   | F-02 remediated and verified           | `2f15e8f`; fixture; original bypass now fails `pnpm arch`                                   |
| 3   | F-03 resolved and recorded             | [D-022](DECISIONS.md#d-022); S-02 §3                                                        |
| 4   | D-019 reconciled and verified          | `3f8d21f`; `tests/startup/web-runtime-headers.test.ts`                                      |
| 5   | D-020 reconciled and verified          | `fc1e157`; security baseline §1                                                             |
| 6   | D-021 reconciled and verified          | `2f15e8f`, `1588494`                                                                        |
| 7   | S-02 reconciled                        | S-02 v2 (labels, consistency review); G-03 – G-08 open                                      |
| 8   | Governance records accurate            | `919542f` (STATUS, DECISIONS, GAPS, findings register, closure package)                     |
| 9   | Verification gates pass                | Clean-room table below                                                                      |
| 10  | CI passes for the closure commit       | CI #11 below                                                                                |
| 11  | No unexplained CRITICAL/HIGH findings  | None open                                                                                   |
| 12  | MEDIUM findings remediated or accepted | F-01, F-02 remediated; F-03 resolved                                                        |
| 13  | Residual risks documented              | [`audit/phase-1-audit-findings.md`](audit/phase-1-audit-findings.md); GAPS G-41             |
| 14  | Phase boundary intact                  | No tenant, identity, database, menu, owner or customer feature code; runtime deps unchanged |
| 15  | Closure record cites exact evidence    | This section                                                                                |

### Clean-room verification of `c917c43`

Fresh clone, empty pnpm store (356 downloaded, 0 reused), empty Corepack cache (pnpm 12.22.0
downloaded and hash-checked), Node v24.22.3, `APP_ENV=test`, `TURBO_TELEMETRY_DISABLED=1`.
Playwright used the container's preinstalled Chromium 1243.

| #   | Command                                                              | Result                                                 |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `pnpm install --frozen-lockfile --store-dir <empty>`                 | exit 0                                                 |
| 2   | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                   | exit 0                                                 |
| 3   | `pnpm test`                                                          | **238 passed**: contracts 12, web 9, api 125, tests 92 |
| 4   | `pnpm arch`                                                          | no violations (80 modules, 132 dependencies)           |
| 5   | `pnpm build`                                                         | exit 0                                                 |
| 6   | `pnpm test:e2e`                                                      | **10 passed** (5 tests × 2 browser projects)           |
| 7   | `pnpm audit`, `pnpm audit --prod`                                    | no known vulnerabilities                               |
| 8   | Frozen install on Node 22.23.5 (`919542f`, same lockfile and config) | `ERR_PNPM_UNSUPPORTED_ENGINE`                          |
| 9   | `git status` afterwards                                              | clean                                                  |

Also verified during the remediation: the security and redaction probes (before/after table
above), CORS and header behaviour (`security-baseline.test.ts`), runtime HSTS against the built
web app, and every mutation listed above.

### CI

| Run                 | Commit    | Conclusion                                                                                                                |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| #10 (`45950197753`) | `919542f` | **failure** in Typecheck: a latent race between the web typecheck and the web build (see `c917c43`). Recorded, not hidden |
| #11 (`45950544931`) | `c917c43` | **success**: all 14 steps passed, including typecheck, tests (incl. the runtime-HSTS startup test), arch and e2e          |

### What closure does not mean

Closure does not resolve G-03 – G-13 or any residual in the findings register. It does not
certify complete redaction (pattern-based; limits in the security baseline §1) or any tenant
isolation (none exists yet; it is the Phase 2 gate, D-022). Phase 2 is authorized by the owner,
conditional on this gate; it starts with the G-03 – G-08 entry decisions.

## Phase 2 — Tenant & identity: progress ledger

**Authorization:** owner, 2026-11-27, conditional on the Phase 1 gate (satisfied). Plan:
[`architecture/phase-2-plan.md`](architecture/phase-2-plan.md). Decisions: D-024 – D-031.
**Status: IN PROGRESS — not complete.** M2.0 – M2.3 done and CI-verified; M2.4 and M2.5 not started; M2.6 blocked on the identity-provider vendor (owner decision, D-025). The Phase 2 exit gate is **not** met.

| Milestone                                | Status                     | Commit / evidence                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2.0 Entry decisions and plan            | done                       | `aa7edec`; spike evidence in `architecture/spikes/`                                                                                                                                                                                                                                         |
| M2.1 Database foundation and isolation   | done; CI verified          | `eaee6e6`, CI #13 (`45952082792`) success: Kysely/pg, migrations, RLS + FORCE, `withTenant()`, startup role check, `pnpm test:db` in CI                                                                                                                                                     |
| M2.2 Tenant resolution and context       | done; CI verified          | `53b79c9`, CI #14 (`45952364343`) success: slug contract, `app.resolve_active_tenant`, `GET /public/tenants/:slug`; 13 real-PostgreSQL tests                                                                                                                                                |
| M2.3 Identity and authorization boundary | done; CI verified          | `e5933cc`, CI #15 (`45952916611`) success: jose verifier (RS256/ES256 only, iss/aud/exp/nbf/iat), separate owner/operator trust domains, operator MFA, `app.find_account` (no auto-creation), owner access only via an active membership read under RLS; 15 real-PostgreSQL + 11 unit tests |
| M2.4 Provisioning and lifecycle          | not started                | —                                                                                                                                                                                                                                                                                           |
| M2.5 Abuse controls                      | not started                | —                                                                                                                                                                                                                                                                                           |
| M2.6 Web BFF session                     | **blocked** — D-025 vendor | owner decision required                                                                                                                                                                                                                                                                     |

### M2.1 verification (local, Node 24.22.3, PostgreSQL 16.15 loopback cluster, scram-sha-256)

| Command                                                           | Result                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`, `lint`, `typecheck`, `test`, `arch`, `build` | exit 0                                                                                                                                             |
| `pnpm test:db`                                                    | **31 passed**: migrations, RLS catalog, role safety, isolation, fail-closed, pool reuse, 200-way concurrency, source scan, built-API startup check |
| `pnpm test:e2e` (migrated e2e DB)                                 | **10 passed**                                                                                                                                      |

Mutations (each reverted; all caught): dropping `FORCE` on `memberships` (catalog test);
`WITH CHECK (true)` on `memberships` (policy test); session-level `set_config(..., false)` in
`withTenant()` (3 tests: the leak was observed — 2 rows of another tenant's data on a reused
connection); no `TEST_DATABASE_ADMIN_URL` (suite fails with a clear message, exit 1).

### M2.2 verification (local)

`format:check`, `lint`, `typecheck`, `test` (266 passed), `arch` (101 modules, 201 deps),
`build`, `test:db` (**44 passed**) — all exit 0. Mutations caught: removing the `status = 'active'`
filter (3 tests: suspended/retired visible); removing the pinned `search_path` (1 test).

### M2.3 verification (local)

All gates exit 0: `test` 283 passed, `test:db` **59 passed**, e2e 10 passed, `pnpm audit --prod`
clean (jose 6.2.18, MIT). Mutations caught: guard accepting any verified token without an account
(2 tests); owner access without the membership check (2 tests: another owner's tenant and a
revoked membership reachable); operator MFA requirement removed (1 test). Identity-provider
**vendor still undecided** (D-025): verification uses local test issuers with real ES256/RS256
signatures.
