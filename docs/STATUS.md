# Phase Status Ledger

Implementation status is established only by inspected repository state and executed tests
(Doc 05 §1, §3). Planning documents are not evidence. Phase order is governed by Document 05
([D-001](DECISIONS.md#d-001)).

_Last updated: 2026-11-27_

## Phase ledger

| Phase | Title                                    | Status                                  | Gate evidence                                                             |
| ----- | ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| 0     | Reconnaissance & specification anchoring | verified — accepted by owner 2026-11-27 | Commit `5d7c2cb`; baseline below                                          |
| 1     | Foundation                               | implemented — awaiting gate acceptance  | Local gates and CI run #1 (`e0fd9eb`) passed; see "Phase 1 gate evidence" |
| 2     | Tenant & identity                        | not started                             | Blocked on [G-01, G-03–G-07](GAPS.md) decisions                           |
| 3     | Customer platform foundation             | not started                             | —                                                                         |
| 4     | Menu domain                              | not started                             | —                                                                         |
| 5     | Customer experience                      | not started                             | —                                                                         |
| 6     | Owner workspace                          | not started                             | —                                                                         |
| 7     | QR & promotions                          | not started                             | —                                                                         |
| 8     | Publishing & analytics                   | not started                             | —                                                                         |
| 9     | Progressive AI & integrations            | not started                             | —                                                                         |
| 10    | Release hardening                        | not started                             | —                                                                         |

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
becomes `verified` only after owner gate acceptance.

| Requirement / ref                                            | Phase | Code paths                                                                                                                                                                        | Tests                                                                       | Status                                        |
| ------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| Doc 05 §13 P1: project structure / workspaces (P-101, P-109) | 1     | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/`, `packages/`, `tests/`                                                                                               | all gates                                                                   | implemented                                   |
| Doc 05 §13 P1: type standards (P-103)                        | 1     | `packages/config/tsconfig/*`, `tsconfig.base.json`                                                                                                                                | `pnpm typecheck`                                                            | implemented                                   |
| Doc 05 §13 P1: validation standards (Zod)                    | 1     | `packages/contracts/src/*`                                                                                                                                                        | `packages/contracts/src/contracts.test.ts`                                  | implemented                                   |
| Doc 05 §13 P1: environments (P-107)                          | 1     | `apps/api/src/env.ts`, `apps/web/src/env.ts`, `apps/web/next.config.ts`, `apps/*/.env.example`                                                                                    | `apps/*/src/env.test.ts`, `tests/startup/env-rejection.test.ts`             | implemented                                   |
| Doc 05 §13 P1: API conventions, error handling (P-108)       | 1     | `packages/contracts/src/errors.ts`, `apps/api/src/all-exceptions.filter.ts`, `apps/api/src/request-id.ts`                                                                         | `apps/api/src/app.test.ts`, `request-id.test.ts`, `tests/e2e/smoke.spec.ts` | implemented                                   |
| Doc 05 §13 P1: API skeleton                                  | 1     | `apps/api/src/{main,create-app,app.module}.ts`, `apps/api/src/modules/health/*`                                                                                                   | `apps/api/src/app.test.ts`, `di.test.ts`, e2e                               | implemented                                   |
| Doc 05 §13 P1: frontend skeleton                             | 1     | `apps/web/src/app/*`, `apps/web/next.config.ts`                                                                                                                                   | e2e (desktop + mobile)                                                      | implemented                                   |
| Doc 05 §13 P1: testing foundations (P-105)                   | 1     | `*/vitest.config.ts`, `tests/e2e/playwright.config.ts`                                                                                                                            | `pnpm test`, `pnpm test:e2e`                                                | implemented                                   |
| Doc 05 §13 P1: lint/format (P-104)                           | 1     | `eslint.config.mjs`, `packages/config/eslint.js`, `.prettierrc`                                                                                                                   | `pnpm lint`, `pnpm format:check`                                            | implemented                                   |
| Doc 02 §3: boundary enforcement in CI (P-104)                | 1     | `tests/architecture/*`                                                                                                                                                            | `tests/architecture/boundaries.test.ts`, `pnpm arch`                        | implemented                                   |
| Doc 05 §13 P1: CI (P-106)                                    | 1     | `.github/workflows/ci.yml`                                                                                                                                                        | GitHub Actions run                                                          | implemented — CI evidence below               |
| Doc 05 §5: durable context (P-110)                           | 1     | `CLAUDE.md`, `docs/*`                                                                                                                                                             | —                                                                           | implemented                                   |
| Security foundations (Phase 1 subset)                        | 1     | `x-powered-by` disabled (API and web), generic error messages, request-id sanitising, no secrets in env errors, 7-day release age (D-005), SHA-pinned Actions, read-only CI token | `app.test.ts`, `env.test.ts`, e2e                                           | implemented; the rest is tracked in G-31–G-34 |

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
4. Permanent negative coverage: `tests/architecture/fixtures/violations/` proves that each of the 7
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
| Commit               | `e0fd9eb43863dd25c816290b079ca16af550b104` on `claude/new-session-7xxuoq`                                                                                                                                                                                                      |
| Conclusion           | **success** (started 2026-11-27T02:33:36Z, completed 02:34:38Z)                                                                                                                                                                                                                |
| Toolchain (from log) | Node v24.22.3, pnpm 12.22.0; "Lockfile is up to date" with `--frozen-lockfile`                                                                                                                                                                                                 |
| Steps                | install, format, lint, typecheck, test (contracts 12, web 3, api 25, tests 14), arch (55 modules, 59 dependencies, no violations), build, Playwright Chromium install (v1243, matching D-006), e2e **6 passed**. The upload-report step was skipped (it runs only on failure). |
| Note                 | The Build step was a Turborepo cache hit, because typecheck had already built all packages earlier in the same job (`^build` dependency). The build itself ran and succeeded inside the typecheck step.                                                                        |
