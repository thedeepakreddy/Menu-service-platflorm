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

## Toolchain

- Node.js **24** (exact version in `.nvmrc`; `engines` enforces `>=24.22.3 <25`). pnpm is pinned via
  `packageManager` and activated with `corepack enable`.
- New package versions must be at least 7 days old (`minimumReleaseAge` in `pnpm-workspace.yaml`).
- `APP_ENV` (`development | test | staging | production`) is required by both apps and by any
  command that loads the Next.js config (build, typecheck, tests). Export it in your shell.

## Commands (run from the repository root)

| Command             | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `pnpm install`      | Install (CI uses `--frozen-lockfile`)                                   |
| `pnpm format:check` | Prettier check (`pnpm format` to write)                                 |
| `pnpm lint`         | ESLint, type-aware, zero warnings allowed                               |
| `pnpm typecheck`    | `tsc --noEmit` in every package                                         |
| `pnpm test`         | Vitest: unit, API integration, architecture-boundary and startup tests  |
| `pnpm arch`         | dependency-cruiser boundary check over the real source tree             |
| `pnpm build`        | Build all packages and apps                                             |
| `pnpm test:e2e`     | Playwright smoke tests (starts the built API and web apps); build first |

CI (`.github/workflows/ci.yml`) runs all of the above in that order.

## Repository layout

| Path                 | Contents                                                                         |
| -------------------- | -------------------------------------------------------------------------------- |
| `apps/api`           | NestJS API (ESM). Domain modules in `src/modules/<name>/`, public via `index.ts` |
| `apps/web`           | Next.js App Router + Tailwind                                                    |
| `packages/contracts` | Framework-free Zod schemas and types shared by apps                              |
| `packages/config`    | Shared TypeScript and ESLint presets                                             |
| `tests/architecture` | Boundary rules and tests, including deliberate-violation fixtures                |
| `tests/startup`      | Proves the built apps refuse invalid configuration                               |
| `tests/e2e`          | Playwright smoke tests                                                           |
| `docs/`              | Specifications, decisions, status, gaps                                          |

## Boundary rules (enforced by `pnpm arch` and `pnpm test`)

- Apps never import each other; share code through `packages/`.
- Packages never import apps. Apps consume packages via their public entry only.
- `packages/contracts` must not depend on React, Next.js, Express or NestJS.
- An API module may use another module only through that module's `index.ts`.
- No circular imports, no unresolvable imports, no devDependencies in runtime code.

Rules live in `tests/architecture/dependency-cruiser.config.cjs`. Fixtures in
`tests/architecture/fixtures/violations/` break the rules on purpose. Do not "fix" them.

## Conventions

- API errors use the envelope `{ error: { code, message, requestId } }` and every response carries
  `x-request-id` (P-108, an initial convention, not a frozen contract). Client-facing messages are
  generic. Details go to server logs with the request id.
- Configuration is validated with Zod at startup. Error output names variables, never values.
  Commit only `.env.example`.
- NestJS constructor injection works in Vitest (the transform honours `emitDecoratorMetadata`);
  `apps/api/src/di.test.ts` guards this.

## At the end of a phase

Update `docs/STATUS.md` (including the implementation ledger), `docs/DECISIONS.md` and
`docs/GAPS.md`. Report the exact commands and results, then stop at the gate.
