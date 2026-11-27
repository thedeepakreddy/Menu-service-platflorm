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
  `tests/policy/` fails if these settings are weakened or an exclusion lacks a D-005 override-log row.
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
| `tests/policy`       | Supply-chain policy checks (release age, engine-strict, pinned pnpm, exclusions) |
| `tests/e2e`          | Playwright smoke tests                                                           |
| `docs/`              | Specifications, decisions, status, gaps                                          |

## Boundary rules (enforced by `pnpm arch` and `pnpm test`)

Twelve rules, each with a permanent per-rule regression fixture:

- No circular imports; every import must resolve.
- Apps never import each other; share code through `packages/`. Packages never import apps.
- Apps consume packages through their public entry only: never `packages/*/src/`, and no source
  file imports any workspace build output (`dist/`, `.next/`) by path.
- Runtime code never imports `tests/`, and never imports devDependencies (type-only imports are
  allowed).
- `packages/contracts` runtime code may import only its own sources and `zod`: no Node built-ins,
  frameworks, DB clients, HTTP clients or other packages, including type-only imports (D-011).
- `apps/web` must not import database clients or ORMs (a denylist; extend it when adding DB
  infrastructure, D-012).
- An API module may use another module only through its `index.ts`, and so must every other
  `apps/api` file (root, bootstrap, tests, config).

Rules live in `tests/architecture/dependency-cruiser.config.cjs`. Build output and `node_modules`
are `doNotFollow` (kept in the graph, not traversed). Exclusions must stay anchored to workspace
paths, and the graph-integrity tests fail if an exclusion ever drops a dependency edge (audit H-01).
Fixtures live in `tests/architecture/fixtures/`: `rules/<rule-name>/` breaks exactly that rule, and
`valid/` must pass. Do not "fix" them. Adding a rule requires adding its fixture directory and
expectations, or the suite fails.

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
