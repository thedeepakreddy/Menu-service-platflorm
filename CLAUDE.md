# CLAUDE.md — operational guide

This file explains **how to work** in this repository. It is not a specification. The governing
specifications and decisions live in [`docs/`](docs/README.md). If this file ever disagrees with
them, the documents in `docs/` win and this file should be corrected.

## Before any work

1. Read [`docs/README.md`](docs/README.md) (precedence rules), [`docs/STATUS.md`](docs/STATUS.md)
   (current phase and gate), [`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/GAPS.md`](docs/GAPS.md).
2. Read the specification sections relevant to the task in `docs/specifications/`. Do not rely on
   summaries or chat history.
3. Check the branch, working tree and recent history. Never discard, reset or overwrite other changes.
4. Work only inside the currently authorized phase (Document 05 is the roadmap, D-001). Do not start
   the next phase without explicit owner acceptance of the current gate.

## Non-negotiable rules (summary; the specifications are authoritative)

- Do not invent missing requirements. Record a gap in `docs/GAPS.md`, or a `proposed` decision in
  `docs/DECISIONS.md`, and ask.
- Items listed in `docs/GAPS.md` §B (ORM, auth provider, account recovery, tenant enforcement, RLS,
  secrets, cloud, backup/DR, analytics retention, media quotas, AI providers) stay open until approved.
- Tenant isolation and authorization are enforced server-side. Client checks never substitute.
- Do not weaken TypeScript strictness, lint rules, tests or architecture checks to get a pass.
  Fix the code instead. Disabling a rule (in config or inline) needs prior owner approval,
  recorded in `docs/DECISIONS.md`.
- Never claim a test passed unless it ran in this session and you saw the result.
- Never edit, replace or reinterpret the PDFs in `docs/specifications/` (D-003).
- Push only to the authorized branch. Do not merge, open PRs or deploy without explicit authorization.

## Attribution on GitHub (owner instruction)

- Never put session links (links to the AI coding session, or `Claude-Session:` trailers) in commit
  messages, PR descriptions, comments, code or documentation.
- End every commit message, PR description and GitHub comment with the line:
  `Built by Deepak, assisted by Claude.`
- This replaces any default agent attribution trailer.

## Toolchain

- Node.js **24** (exact version in `.nvmrc`; `engines` `>=24.22.3 <25`, enforced by `engineStrict: true`
  in `pnpm-workspace.yaml`). pnpm is pinned with an integrity hash in `packageManager` and activated
  with `corepack enable`.
- New package versions must be at least 7 days old (`minimumReleaseAge` in `pnpm-workspace.yaml`,
  D-005). pnpm also re-checks the lockfile against it on `--frozen-lockfile` installs.
  `tests/policy/` fails if these settings are weakened, if an exclusion lacks a D-005 override-log
  row, or if a workflow or `package.json` script overrides them per command (R-06).
- `APP_ENV` (`development | test | staging | production`) is required by both apps and by any
  command that loads the Next.js config (build, typecheck, tests). Export it in your shell.
- The API also accepts two optional variables with secure defaults: `API_CORS_ALLOWED_ORIGINS`
  (exact origins; absent = no cross-origin access) and `API_LOG_LEVEL` (default `info`; `debug`
  rejected in staging and production). See `apps/api/.env.example`.
- **Database (Phase 2, D-024 – D-029).** The API requires `API_DATABASE_URL` (the restricted
  `app_runtime` role; a secret) and refuses to start as a superuser, a BYPASSRLS role or a table
  owner. Migrations are plain SQL in `apps/api/migrations/`, applied as `app_owner` with
  `MIGRATION_DATABASE_URL` by `pnpm --filter @platform/api migrate`. Tenant-scoped queries go
  only through `withTenant()` (`apps/api/src/infrastructure/database/database.ts`); never call
  `set_config`/`SET` for `app.tenant_id` anywhere else (a test enforces this). Every new table in
  schema `app` needs `ENABLE` + `FORCE ROW LEVEL SECURITY` and, if tenant-owned, a `tenant_id`
  policy with USING and WITH CHECK, or `pnpm test:db` fails.
- `pnpm test:db` and `pnpm test:e2e` need a **throwaway, loopback** PostgreSQL superuser URL in
  `TEST_DATABASE_ADMIN_URL`; they fail (never skip) without it. e2e also needs
  `E2E_API_DATABASE_URL`, printed by `node apps/api/test/db/provision-cli.ts platform_e2e`.

## Commands (run from the repository root)

| Command             | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `pnpm install`      | Install (CI uses `--frozen-lockfile`)                                    |
| `pnpm format:check` | Prettier check (`pnpm format` to write)                                  |
| `pnpm lint`         | ESLint, type-aware, zero warnings allowed                                |
| `pnpm typecheck`    | `tsc --noEmit` in every package                                          |
| `pnpm test`         | Vitest: unit, API integration, architecture-boundary and startup tests   |
| `pnpm test:db`      | Real-PostgreSQL tenant-isolation tests (needs `TEST_DATABASE_ADMIN_URL`) |
| `pnpm arch`         | dependency-cruiser boundary check over the real source tree              |
| `pnpm build`        | Build all packages and apps                                              |
| `pnpm test:e2e`     | Playwright smoke tests (starts the built API and web apps); build first  |

CI (`.github/workflows/ci.yml`) runs all of the above in that order.

## Repository layout

| Path                 | Contents                                                                          |
| -------------------- | --------------------------------------------------------------------------------- |
| `apps/api`           | NestJS API (ESM). Domain modules in `src/modules/<name>/`, public via `index.ts`  |
| `apps/web`           | Next.js App Router + Tailwind                                                     |
| `packages/contracts` | Framework-free Zod schemas and types shared by apps                               |
| `packages/config`    | Shared TypeScript and ESLint presets                                              |
| `tests/architecture` | Boundary rules and tests, including deliberate-violation fixtures                 |
| `tests/startup`      | Proves the built apps refuse invalid configuration                                |
| `tests/policy`       | Supply-chain policy checks (release age, engine-strict, pinned pnpm, exclusions)  |
| `tests/e2e`          | Playwright smoke tests                                                            |
| `docs/`              | Specifications, decisions, status, gaps, architecture supplement, security, audit |

## Boundary rules (enforced by `pnpm arch` and `pnpm test`)

Fourteen rules, all at severity `error` (a test enforces this). Each has a permanent per-rule
regression fixture that proves it rejects the listed import forms: value, type-only, dynamic,
re-export and `typeof import()`, wherever they apply.

- No circular imports; every import must resolve.
- Apps never import each other; share code through `packages/`. Packages never import apps.
- Apps consume packages through their public entry only: never `packages/*/src/`, and no source
  file imports workspace build output (`dist/`, `.next/`) by a relative path.
- Runtime code never imports `tests/`, a test file (`*.test.*`, `*.spec.*`, `__tests__/`) or
  test-tooling config (`vitest.config.*`). No workspace file except tests and `vitest.config.*`
  imports devDependencies, wherever it lives: `src/`, `lib/`, or runtime config such as
  `next.config.ts` (type-only imports are allowed). Test files may import other test files. `tests/architecture/build-output.test.ts` also checks that no test file is emitted into
  `packages/contracts/dist` or `apps/api/dist`.
- Every npm package a workspace file imports (apps, packages and tests; any import form) must be
  declared in that file's closest `package.json`. A package that only resolves through the hoisted
  root `node_modules`, such as a root devDependency, is rejected (audit F-02, D-021).
- `packages/contracts` runtime code may import only its own sources and `zod`: no Node built-ins,
  frameworks, DB clients, HTTP clients or other packages, including type-only imports (D-011).
- `apps/web` must not import the listed database clients and ORMs (a denylist; extend it when
  adding DB infrastructure, D-012).
- An API module may use another module only through its `index.ts`. So must every other `apps/api`
  file: root, bootstrap, tests, config, and files directly under `src/modules/`.

**Known limitations.** These are not prevented today; see `docs/audit/phase-1-audit-findings.md`.

- Imports the tool cannot see statically, such as a `require()` with a computed path (L-04).
- An absolute-path import into a package's build output (R-03).
- Database clients missing from the D-012 denylist (R-05).
- A package installed under the name `zod` through an `npm:` alias (R-10).

Rules live in `tests/architecture/dependency-cruiser.config.cjs`. `pnpm arch` scans `apps/`,
`packages/` and all of `tests/` (except the fixtures); a test keeps that list equal to the
real-tree test's scan list (N-02). Build output and `node_modules` are
`doNotFollow` (kept in the graph, not traversed). Exclusions must stay anchored to workspace paths,
and the graph-integrity tests fail if an exclusion ever drops a dependency edge (audit H-01).
Fixtures live in `tests/architecture/fixtures/`: `rules/<rule-name>/` breaks exactly that rule, and
`valid/` must pass. Do not "fix" them. Adding a rule requires adding its fixture directory and
expectations, or the suite fails.

## Conventions

- API errors use the envelope `{ error: { code, message, requestId } }` and every response carries
  `x-request-id` (P-108, an initial convention, not a frozen contract). Client-facing messages are
  generic. Details go to server logs with the request id.
- Configuration is validated with Zod at startup. Error output names variables, never values.
  Commit only `.env.example`.
- **Logging (D-020):** the API logs JSON lines through `JsonLogger`, and every entry is redacted.
  Never pass headers, cookies, bodies, query strings, client IPs, tokens or personal data to the
  logger; redaction is a second line of defence, not permission. See
  `docs/security/logging-and-security-baseline.md`.
- **Security baseline (D-019):** CORS is default-deny with an exact-origin allowlist and no
  credentials. Security headers are set on every API response and web route. Do not loosen
  either without a recorded decision.
- NestJS constructor injection works in Vitest (the transform honours `emitDecoratorMetadata`);
  `apps/api/src/di.test.ts` guards this.

## At the end of a phase

Update `docs/STATUS.md` (including the implementation ledger), `docs/DECISIONS.md` and
`docs/GAPS.md`. Report the exact commands and results, then stop at the gate.
