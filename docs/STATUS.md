# Phase Status Ledger

Implementation status is established only by inspected repository state and executed tests
(Doc 05 §1, §3). Planning documents are not evidence. Phase order is governed by Document 05
([D-001](DECISIONS.md#d-001)).

_Last updated: 2026-11-27_

## Phase ledger

| Phase | Title                                    | Status                                                                                                                                                                                                     | Gate evidence                                                                                   |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0     | Reconnaissance & specification anchoring | verified — accepted by owner 2026-11-27                                                                                                                                                                    | Commit `b963239`; baseline below                                                                |
| 1     | Foundation                               | **ACCEPTED** by owner 2026-11-27. Audit and remediation audit: PASS WITH CONDITIONS. Audit remediation and residual remediation (R-01, R-02) implemented — **awaiting owner review and independent audit** | Code `f383bc0`; remediation `3343393`; residual remediation: see "Phase 1 residual remediation" |
| 2     | Tenant & identity                        | not started — **not authorized**. Waiting for owner acceptance of the Phase 1 audit remediation, the G-01 and G-03 – G-08 decisions, and the G-36 and G-38 scope                                           | Blocked on [G-01, G-03–G-08, G-36, G-38](GAPS.md)                                               |
| 3     | Customer platform foundation             | not started                                                                                                                                                                                                | —                                                                                               |
| 4     | Menu domain                              | not started                                                                                                                                                                                                | —                                                                                               |
| 5     | Customer experience                      | not started                                                                                                                                                                                                | —                                                                                               |
| 6     | Owner workspace                          | not started                                                                                                                                                                                                | —                                                                                               |
| 7     | QR & promotions                          | not started                                                                                                                                                                                                | —                                                                                               |
| 8     | Publishing & analytics                   | not started                                                                                                                                                                                                | —                                                                                               |
| 9     | Progressive AI & integrations            | not started                                                                                                                                                                                                | —                                                                                               |
| 10    | Release hardening                        | not started                                                                                                                                                                                                | —                                                                                               |

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

| Requirement / ref                                            | Phase | Code paths                                                                                                                                                                        | Tests                                                                       | Status                                                                                            |
| ------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Doc 05 §13 P1: project structure / workspaces (P-101, P-109) | 1     | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/`, `packages/`, `tests/`                                                                                               | all gates                                                                   | verified                                                                                          |
| Doc 05 §13 P1: type standards (P-103)                        | 1     | `packages/config/tsconfig/*`, `tsconfig.base.json`                                                                                                                                | `pnpm typecheck`                                                            | verified                                                                                          |
| Doc 05 §13 P1: validation standards (Zod)                    | 1     | `packages/contracts/src/*`                                                                                                                                                        | `packages/contracts/src/contracts.test.ts`                                  | verified                                                                                          |
| Doc 05 §13 P1: environments (P-107)                          | 1     | `apps/api/src/env.ts`, `apps/web/src/env.ts`, `apps/web/next.config.ts`, `apps/*/.env.example`                                                                                    | `apps/*/src/env.test.ts`, `tests/startup/env-rejection.test.ts`             | verified                                                                                          |
| Doc 05 §13 P1: API conventions, error handling (P-108)       | 1     | `packages/contracts/src/errors.ts`, `apps/api/src/all-exceptions.filter.ts`, `apps/api/src/request-id.ts`                                                                         | `apps/api/src/app.test.ts`, `request-id.test.ts`, `tests/e2e/smoke.spec.ts` | verified                                                                                          |
| Doc 05 §13 P1: API skeleton                                  | 1     | `apps/api/src/{main,create-app,app.module}.ts`, `apps/api/src/modules/health/*`                                                                                                   | `apps/api/src/app.test.ts`, `di.test.ts`, e2e                               | verified                                                                                          |
| Doc 05 §13 P1: frontend skeleton                             | 1     | `apps/web/src/app/*`, `apps/web/next.config.ts`                                                                                                                                   | e2e (desktop + mobile)                                                      | verified                                                                                          |
| Doc 05 §13 P1: testing foundations (P-105)                   | 1     | `*/vitest.config.ts`, `tests/e2e/playwright.config.ts`                                                                                                                            | `pnpm test`, `pnpm test:e2e`                                                | verified                                                                                          |
| Doc 05 §13 P1: lint/format (P-104)                           | 1     | `eslint.config.mjs`, `packages/config/eslint.js`, `.prettierrc`                                                                                                                   | `pnpm lint`, `pnpm format:check`                                            | verified                                                                                          |
| Doc 02 §3: boundary enforcement in CI (P-104)                | 1     | `tests/architecture/*`                                                                                                                                                            | `tests/architecture/boundaries.test.ts`, `pnpm arch`                        | verified at acceptance; **defective** (audit H-01, M-01–M-03); remediated — awaiting owner review |
| Doc 05 §13 P1: CI (P-106)                                    | 1     | `.github/workflows/ci.yml`                                                                                                                                                        | GitHub Actions run                                                          | verified (CI run #1)                                                                              |
| Doc 05 §5: durable context (P-110)                           | 1     | `CLAUDE.md`, `docs/*`                                                                                                                                                             | —                                                                           | verified                                                                                          |
| Security foundations (Phase 1 subset)                        | 1     | `x-powered-by` disabled (API and web), generic error messages, request-id sanitising, no secrets in env errors, 7-day release age (D-005), SHA-pinned Actions, read-only CI token | `app.test.ts`, `env.test.ts`, e2e                                           | verified (Phase 1 subset); the rest is tracked in G-31–G-34                                       |

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
