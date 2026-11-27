# Decision Log

The central record of decisions that govern implementation (Doc 05 §5). Decisions are never
silently changed. To revise one, add a new entry that marks the old one `superseded`, and keep
the history.

**Statuses:** `proposed` · `approved` · `implemented` · `verified` · `blocked` · `deferred` · `superseded`

A `proposed` decision is **not** binding. It may guide drafts but must not be treated as locked
until the owner approves it.

## Index

| ID              | Title                                                                             | Status                                  | Date       |
| --------------- | --------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| [D-001](#d-001) | Document 05 is the authoritative execution roadmap                                | approved                                | 2026-11-27 |
| [D-002](#d-002) | Phase sequencing authority and tracking of discrepancies                          | approved                                | 2026-11-27 |
| [D-003](#d-003) | Specification placement and preservation                                          | approved                                | 2026-11-27 |
| [P-101](#p-101) | pnpm workspaces + Turborepo                                                       | verified                                | 2026-11-27 |
| [P-102](#p-102) | Node.js 24 LTS, pinned                                                            | verified                                | 2026-11-27 |
| [P-103](#p-103) | Strict TypeScript from one shared base                                            | verified                                | 2026-11-27 |
| [P-104](#p-104) | ESLint flat config + Prettier; dependency-cruiser boundaries                      | verified                                | 2026-11-27 |
| [P-105](#p-105) | Vitest (unit/integration) + Playwright (e2e)                                      | verified                                | 2026-11-27 |
| [P-106](#p-106) | GitHub Actions CI                                                                 | verified                                | 2026-11-27 |
| [P-107](#p-107) | Zod-validated environment, fail fast, `.env.example` only                         | verified                                | 2026-11-27 |
| [P-108](#p-108) | Initial API error envelope and request id convention                              | verified                                | 2026-11-27 |
| [P-109](#p-109) | Create only `contracts` and `config` packages in Phase 1                          | verified                                | 2026-11-27 |
| [P-110](#p-110) | `CLAUDE.md` operational guide                                                     | verified                                | 2026-11-27 |
| [D-004](#d-004) | TypeScript pinned to 6.0.x (not 7.x)                                              | approved                                | 2026-11-27 |
| [D-005](#d-005) | 7-day minimum release age for npm packages                                        | approved (provisional)                  | 2026-11-27 |
| [D-006](#d-006) | `@playwright/test` pinned exactly to 1.63.0                                       | approved                                | 2026-11-27 |
| [D-007](#d-007) | `no-extraneous-class` uses `allowWithDecorator` in `apps/api`                     | approved (scoped)                       | 2026-11-27 |
| [D-008](#d-008) | `APP_ENV` required by every app and by build/typecheck/test                       | approved                                | 2026-11-27 |
| [D-009](#d-009) | Web placeholder is marked `noindex`                                               | approved                                | 2026-11-27 |
| [D-010](#d-010) | Boundary graph: build output followed-not-excluded; anchored exclusions           | approved (2026-11-27)                   | 2026-11-27 |
| [D-011](#d-011) | `packages/contracts` dependency allowlist (zod only, incl. type-only)             | approved — strict scope incl. type-only | 2026-11-27 |
| [D-012](#d-012) | Web app must not import database clients or ORMs                                  | approved — interim denylist             | 2026-11-27 |
| [D-013](#d-013) | `engineStrict: true` enforces the Node.js engine range                            | approved (2026-11-27)                   | 2026-11-27 |
| [D-014](#d-014) | `packageManager` pinned with a Corepack integrity hash                            | approved (2026-11-27)                   | 2026-11-27 |
| [D-015](#d-015) | Automated supply-chain policy test                                                | approved (2026-11-27)                   | 2026-11-27 |
| [D-016](#d-016) | Runtime code must not import test files (R-01)                                    | approved (2026-11-27)                   | 2026-11-27 |
| [D-017](#d-017) | Boundary scan covers all of `tests/` (R-04)                                       | approved (2026-11-27)                   | 2026-11-27 |
| [D-018](#d-018) | Per-command supply-chain overrides are rejected (R-06)                            | approved — within documented limits     | 2026-11-27 |
| [D-019](#d-019) | Security baseline: CORS default-deny allowlist; API/web security headers          | approved — amended for F-04             | 2026-11-27 |
| [D-020](#d-020) | Structured JSON logging with redaction; controlled log levels                     | approved — amended for F-01, F-05, F-07 | 2026-11-27 |
| [D-021](#d-021) | devDependency rule covers all workspace files (N-01); CLI scan-scope guard (N-02) | approved — amended for F-02, F-10       | 2026-11-27 |
| [D-022](#d-022) | Doc 05 Phase 1 exit-gate conflict (§11 vs §13): interpretation                    | approved (owner amendment)              | 2026-11-27 |
| [D-023](#d-023) | Commit author identity policy (I-03)                                              | approved (2026-11-27)                   | 2026-11-27 |
| [D-024](#d-024) | G-03: Kysely on node-postgres; plain-SQL forward-only migrations                  | approved (delegated, Part IX)           | 2026-11-27 |
| [D-025](#d-025) | G-04: OIDC identity architecture behind a provider port                           | architecture approved; **vendor open**  | 2026-11-27 |
| [D-026](#d-026) | G-05: account recovery delegated to the identity provider                         | approved (delegated, Part IX)           | 2026-11-27 |
| [D-027](#d-027) | G-06: tenant resolution and server-side tenant context                            | approved (delegated, Part IX)           | 2026-11-27 |
| [D-028](#d-028) | G-07: PostgreSQL RLS isolation model, roles and operator access                   | approved (delegated, Part IX)           | 2026-11-27 |
| [D-029](#d-029) | G-08: runtime secrets management                                                  | approved (delegated, Part IX)           | 2026-11-27 |
| [D-030](#d-030) | G-36: sessions via a server-side web BFF; CORS stays credential-free              | approved (delegated, Part IX)           | 2026-11-27 |
| [D-031](#d-031) | G-34/G-38: rate limiting and request-cost controls                                | approved (delegated, Part IX)           | 2026-11-27 |

---

## D-001

**Title:** Document 05 is the authoritative execution roadmap
**Status:** approved
**Date / version:** 2026-11-27 · applies to the specification package v1.0
**Approval evidence:** Owner approval "Phase 0 Approval and Phase 1 Authorization", item A, Decision 1, and item B (implementation session, 2026-11-27).

**Decision.** Document 05 (Claude Implementation Execution Plan, Phases 0–10) is the
authoritative roadmap for implementation and phase sequencing. Document 01's conceptual Phases A–J
and Document 04's Stages A–G are supporting conceptual mappings, not independent roadmaps.
Differences in phase mapping are documented and reconciled, not ignored.

**Rationale.** The three documents sequence work differently. Doc 01 §19 calls its own sequence
"conceptual", and Doc 05 is written to govern execution. One governing roadmap prevents scope
drift and ambiguous phase gates.

**Constraints.** Phases may not be skipped, merged or reordered, and a future phase may not start
without its gate and explicit authorization. Phase order can change only through a documented,
approved amendment (Doc 05 §11, §17).

**Reference:** [`architecture/phase-mapping.md`](architecture/phase-mapping.md)

---

## D-002

**Title:** Phase sequencing authority and tracking of discrepancies
**Status:** approved
**Date / version:** 2026-11-27 · specification package v1.0
**Approval evidence:** Owner approval "Phase 0 Approval and Phase 1 Authorization", item A, Decision 2 (2026-11-27).

**Decision.** Sequencing discrepancies between Documents 01, 04 and 05 (onboarding, localization
and others) are tracked explicitly. Implementation follows Document 05's sequence unless a formally
approved change modifies it. A phase's scope is **not** expanded because a conceptual phase in
another document groups work differently.

**Rationale.** The documents agree on _what_ to build but group it differently. Without a rule,
an agent could justify pulling later-phase work forward by citing a different document.

**Tracking:** Discrepancies are listed as `SEQ-*` items in
[`architecture/phase-mapping.md`](architecture/phase-mapping.md#3-tracked-sequencing-discrepancies)
and summarised in [`GAPS.md`](GAPS.md).

---

## D-003

**Title:** Specification placement and preservation
**Status:** approved
**Date / version:** 2026-11-27
**Approval evidence:** Owner approval "Phase 0 Approval and Phase 1 Authorization", item A (2026-11-27).

**Decision.** The five specification PDFs are stored unmodified under `docs/specifications/`, with
SHA-256 checksums recorded in [`README.md`](README.md). Supporting documentation lives in
`docs/README.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, `docs/GAPS.md` and `docs/architecture/`.
The specifications are never rewritten, replaced, altered or reinterpreted in place.

**Note.** The upload prefixes (for example `25e01e25-`) were dropped from the filenames when the
files were stored. The file contents are byte-identical to what the owner supplied, as the
checksums confirm.

---

## Phase 1 decisions (P-101 – P-110)

**Approval evidence (all ten):** Owner message "accept P-101 through P-110", Phase 1
authorization, 2026-11-27. P-108 was explicitly accepted as an _initial API convention, not an
immutable contract_.
**Status: `verified`.** The owner accepted the Phase 1 gate on 2026-11-27 ("Phase 1 is formally
ACCEPTED"), based on the local and CI verification evidence in [`STATUS.md`](STATUS.md). An
independent audit by a second reviewer is pending; its findings may lead to new decisions but do
not silently change these.

### P-101

**pnpm workspaces + Turborepo.** `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `tests`) and
`turbo.json` (`build`, `typecheck`, `test`; `^build` dependencies). pnpm is pinned with
`packageManager: pnpm@12.22.0` and activated through Corepack.
_Alternatives:_ npm workspaces (no task graph or caching), Nx (heavier, more lock-in).

### P-102

**Node.js 24 LTS.** `.nvmrc` = `24.22.3`, `engines.node` = `>=24.22.3 <25`. CI reads `.nvmrc`.
Local verification used Node 24.22.3, installed from nodejs.org with its SHA-256 checked against
the official `SHASUMS256.txt`. The container's preinstalled Node 22 was not used.

_Correction (2026-11-27, audit finding L-01):_ `engines` alone was **not** enforced. pnpm only
warned, and a frozen install on Node 22 succeeded. It is enforced from the Phase 1 remediation
onwards by `engineStrict: true` ([D-013](#d-013)).

### P-103

**Strict TypeScript.** The single base is `packages/config/tsconfig/base.json` (`strict`,
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noUnused*`,
`isolatedModules`). Variants: `node.json` (NodeNext ESM) and `nextjs.json` (Bundler). The root
`tsconfig.base.json` only extends it.
_Implementation note:_ the base lives inside the package rather than at the root because Vite's
Oxc transformer resolves `extends` through the workspace symlink, which breaks relative
`../../../` paths. `skipLibCheck` is on (standard; it does not affect checking of our own code).

### P-104

**ESLint 10 flat config with `typescript-eslint` `strictTypeChecked`** (type-aware), plus
`consistent-type-imports` and `no-console`. Next.js and React Hooks rules for `apps/web`. Prettier 3. Module boundaries are enforced by dependency-cruiser
(`tests/architecture/dependency-cruiser.config.cjs`) through both `pnpm arch` (CLI) and a Vitest
suite that also proves each rule rejects a deliberate violation. See D-007 for the one rule option
that was changed.

_Correction (2026-11-27, audit findings H-01, M-01–M-03, L-03):_ as originally accepted, the
boundary configuration's unanchored `dist/` exclusion silently dropped every dependency on an npm
package whose code lives under `dist/` (12 of 71 edges, including `next` and `vitest`). As a
result `no-dev-deps-in-production-code` could never fire, and the framework rule for contracts was
blind to such packages. Only 7 of the 9 rules had negative fixtures, and the untested ones
included the broken rule. The Phase 1 remediation repairs this ([D-010](#d-010)–[D-012](#d-012));
see `docs/STATUS.md` → "Phase 1 audit remediation".

### P-105

**Vitest 5** for unit and API integration tests (a real HTTP server on an ephemeral port).
**Playwright** for end-to-end smoke tests against the built apps, on desktop and mobile Chromium.
See D-006 for the version pin.

### P-106

**GitHub Actions** (`.github/workflows/ci.yml`): frozen install → format → lint → typecheck →
test → arch → build → Playwright e2e. `permissions: contents: read`; checkout without persisted
credentials. Actions are pinned to full commit SHAs (checkout v6.1.0, setup-node v6.5.0,
upload-artifact v6.0.0), resolved from the official repositories with `git ls-remote`.

### P-107

**Environment validation.** `apps/api/src/env.ts` and `apps/web/src/env.ts` (Zod). The API
validates in `main.ts` before bootstrap; the web app validates in `next.config.ts`, so `next dev`,
`build`, `start` and `typegen` all refuse invalid configuration. Errors name the variable, never the
value. No defaults. Only `.env.example` files are committed. Secrets management remains open
([G-08](GAPS.md)).

### P-108

**Initial API error convention** (`packages/contracts/src/errors.ts`): the envelope
`{ error: { code, message, requestId } }`, a fixed initial code list, and the `x-request-id`
header. A client-supplied id is kept only if it matches `^[A-Za-z0-9_-]{8,128}$`; otherwise a UUID
is generated. Clients get generic messages. 5xx details are logged server-side with the request id.
The full endpoint inventory, versioning and error taxonomy remain open ([G-14](GAPS.md)).

### P-109

**Packages created in Phase 1:** `packages/contracts` and `packages/config` only. `packages/ui`,
`packages/test-utils`, `services/` and `infra/` from Doc 02 §4 are **deferred** until a phase needs
them. This is a recorded, approved deviation from Doc 02's _proposed_ structure. Cross-cutting tests
live in a `tests/` workspace package (`architecture/`, `startup/`, `e2e/`).

### P-110

**`CLAUDE.md`** is an operational guide: how to start work, toolchain, commands, layout, boundary
rules and conventions. It defers to `docs/` and states that `docs/` wins on any conflict.

---

## Implementation-time decisions (D-004 – D-009)

These came up while implementing the approved Phase 1 plan and were first recorded as `proposed`.
**Approval evidence:** Owner message at Phase 1 acceptance, 2026-11-27. D-004, D-006, D-007,
D-008 and D-009 were accepted; D-005 was accepted provisionally. Conditions are recorded under each
entry.

## D-004

**Title:** TypeScript pinned to 6.0.x (not 7.x)
**Status:** approved (2026-11-27)
**Decision.** Use `typescript ~6.0.3`.
**Rationale.** TypeScript 7.0 is the latest release, but `typescript-eslint` 8.x (required for
type-aware linting, P-104) declares `typescript >=4.8.4 <6.1.0`. Moving to 7.x would mean dropping
type-aware linting, which would weaken P-104.
**Revisit when** `typescript-eslint` supports TypeScript 7 ([G-29](GAPS.md)).

## D-005

**Title:** 7-day minimum release age for npm packages
**Status:** approved (provisional), 2026-11-27
**Conditions of approval.** Accepted _provisionally_ as a supply-chain safeguard. It is **not** a
permanent or comprehensive security policy (see "Limits" below) and must be reviewed (see
"Review requirement").

**Decision.** `minimumReleaseAge: 10080` (minutes, i.e. 7 days) in `pnpm-workspace.yaml`. pnpm will
not resolve any package version published less than 7 days before resolution.

**Rationale.** Many malicious npm releases are detected and pulled within hours to days of
publication. Refusing very fresh versions removes that window for new or updated dependencies at
negligible cost. Observed effect at installation: `@nestjs/*` resolved to 12.5.1 rather than
12.6.3, which had been published the day before.

**Override mechanism (verified).** pnpm fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` when a
required version is too new. This was confirmed on 2026-11-27 in a throwaway workspace outside the
repository with pnpm 12.22.0: `@nestjs/common@12.6.3` was refused, and then installed once
excluded. The only permitted override is an **exact `name@version` entry** under
`minimumReleaseAgeExclude` in `pnpm-workspace.yaml`:

```yaml
minimumReleaseAgeExclude:
  - '@scope/package@1.2.3' # OV-001, see docs/DECISIONS.md D-005 override log
```

Not permitted: lowering or removing `minimumReleaseAge`, package-wide or wildcard exclusions,
approving picks through pnpm's interactive prompt (which leaves no reviewable record in
`pnpm-workspace.yaml`), and overrides made by an agent without owner approval.

**Override auditing.**

1. Each exclusion needs owner approval and a row in the override log below **before** it is
   committed: id, date, `package@version`, reason (e.g. advisory id or blocking defect), approver,
   and removal condition.
2. The exclusion line in `pnpm-workspace.yaml` must cite its override-log id in a comment. It is
   committed together with the log row and the resulting `pnpm-lock.yaml` change, in a commit
   whose message names the override id.
3. Remove the exclusion once the version is older than 7 days, or at the next dependency update,
   whichever comes first. Record the removal in the log.
4. Reviewers check that every `minimumReleaseAgeExclude` entry has an open log row and that no row
   is older than its removal condition. Since the Phase 1 remediation, CI checks automatically that
   every exclusion is an exact `name@version` with an `OV-###` row in the log below, and that the
   release age is not lowered ([D-015](#d-015)). Checking that rows are closed when their removal
   condition is met remains a manual review step.

**D-005 override log**

| Id  | Date | Package@version | Reason                         | Approver | Removal condition | Removed |
| --- | ---- | --------------- | ------------------------------ | -------- | ----------------- | ------- |
| —   | —    | —               | No overrides have been granted | —        | —                 | —       |

**Limits (what D-005 does not cover).** Vulnerability scanning and advisories, package provenance
and signature verification, licence review, typosquatting and dependency-confusion controls,
malicious code in mature versions, transitive-dependency review, GitHub Action updates, and the
Node.js/pnpm toolchain downloads. These remain open under [G-30](GAPS.md) and Phase 10 release
hardening.

**Review requirement.** Review D-005 (keep, adjust the window, or replace it with a broader
dependency policy) **no later than the Phase 10 release-hardening gate**. Review it earlier if any
of these happens: the dependency-update policy ([G-30](GAPS.md)) is decided; an override is needed
for a security fix; or pnpm changes the setting's semantics. Record the outcome as a new decision
that supersedes or confirms this one.

## D-006

**Title:** `@playwright/test` pinned exactly to 1.63.0
**Status:** approved (2026-11-27)
**Rationale.** The development container ships Chromium builds for Playwright 1.63.0. Pinning the
same version means local and CI e2e runs use the same browser revision (CI installs it with
`playwright install --with-deps chromium`). The latest release at implementation time was 1.65.1.
**Revisit** at Phase 10 or when the container's browsers are updated.

## D-007

**Title:** `@typescript-eslint/no-extraneous-class` uses its `allowWithDecorator` option in `apps/api`
**Status:** approved (scoped), 2026-11-27
**Conditions of approval.** The approval covers **only** this exception: the
`@typescript-eslint/no-extraneous-class` rule, set to `error` with `{ allowWithDecorator: true }`,
applied to `apps/api/**`, for NestJS decorated classes. It does **not** authorize any other lint
relaxation. Any further change that disables, downgrades or adds options loosening a rule (in
config or inline) needs a separate owner-approved decision recorded here _before_ it is
committed.
**Decision.** In `apps/api/**`, the rule stays at `error` with `{ allowWithDecorator: true }`.
**Rationale.** NestJS modules are, by framework design, empty decorated classes
(`@Module({...}) export class X {}`). The option exempts only decorated classes; undecorated
extraneous classes are still reported.
**Disclosure.** This is the only lint relaxation in the repository. During implementation, broader
relaxations were tried and then removed in favour of code fixes: turning this rule off, turning off
`no-unsafe-class-instance-assignment`, a `no-console` override, `allowNumber` and
`argsIgnorePattern`.

## D-008

**Title:** `APP_ENV` is required by every app and by build/typecheck/test commands
**Status:** approved (2026-11-27)
**Decision.** `APP_ENV ∈ {development, test, staging, production}` is required, with no default.
Because the web app validates in `next.config.ts`, any command that loads the Next.js config needs
it (`next build`, `next typegen` inside `typecheck`, and the startup tests). Turborepo tasks declare
it in `env` so it is passed through and included in cache keys. CI sets `APP_ENV=test`.
**Trade-off.** It is explicit and fails fast, but developers must export `APP_ENV` locally (this is
documented in `CLAUDE.md` and `README.md`).

## D-009

**Title:** Web placeholder is marked `noindex`
**Status:** approved (2026-11-27)
**Decision.** The root layout sets `robots: { index: false, follow: false }`.
**Rationale.** Keeps the Phase 1 placeholder out of search indexes if it is ever deployed. Real SEO
and robots policy belong to the customer platform phases (Doc 03 §18). Remove or replace this then.

---

## Phase 1 audit remediation decisions (D-010 – D-015)

**Authorization evidence:** Owner message "Phase 1 Remediation — Independent Audit Findings"
(2026-11-27). It authorized fixes for H-01, M-01, M-02 and M-03, related architecture tests and
fixtures, L-01, L-03 and L-07, and L-06 and L-10 if narrow. Each decision below implements that
authorization and stays **awaiting owner review** until the owner accepts the remediation. No
Phase 2 work is included.

## D-010

**Title:** Boundary graph: workspace build output is followed-not-excluded; all exclusions anchored
**Status:** implemented — awaiting owner review
**Decision.** In `tests/architecture/dependency-cruiser.config.cjs`, `node_modules` and workspace
build output (`^(apps|packages)/[^/]+/(dist|\.next)/`) are `doNotFollow`. They remain in the graph
as dependency targets, but they are not traversed. `exclude` is limited to anchored workspace
locations: the fixtures, `.turbo`, coverage and test reports, and the generated
`apps/<app>/next-env.d.ts`. A new rule, `no-workspace-build-output-imports`, rejects any source
import of a workspace build-output directory by path (`local` dependency type: value, type-only and
dynamic imports). A workspace package consumed by name through its `exports` map is not `local` and
stays allowed. A new rule, `api-module-entry-only`, extends module encapsulation to every
`apps/api` file outside `src/modules/`.
**Rationale.** Audit findings H-01 (unanchored exclusion swallowed npm `dist/` paths), M-01 (build
output not policed) and M-02 (root and bootstrap files could bypass a module's `index.ts`).
**Verification.** `tests/architecture/boundaries.test.ts`: per-rule fixtures, a valid fixture, and
graph-integrity tests comparing the configured graph against an unexcluded baseline. Restoring
the original exclusion makes 7 tests fail.

_Correction (2026-11-27, remediation audit R-02, R-03, R-09):_ the wording above overstated two
guarantees.

- `no-workspace-build-output-imports` rejects **relative-path** imports of build output, including
  `require()`, `import()` type queries and symlinked paths. It does **not** reject an
  **absolute-path** import into a package's build output, because dependency-cruiser types that as
  `undetermined`, not `local` (R-03, open). An absolute import into another app's build output is
  still rejected by `no-cross-app-imports`.
- `api-module-entry-only` originally exempted every file under `src/modules/`, so a file
  directly in `src/modules/` (a registry or barrel) could reach module internals (R-02). Since
  the residual remediation it exempts only files inside `src/modules/<name>/` ([D-016](#d-016)
  records the companion R-01 rule). Both changes are covered by fixtures.

## D-011

**Title:** `packages/contracts` dependency allowlist
**Status:** implemented — **type-only scope proposed for owner confirmation**
**Decision.** Rule `contracts-allowlist` replaces `contracts-must-be-framework-free`. Runtime
sources under `packages/contracts/src/` (test files excepted) may depend only on other
`packages/contracts/src/` files and `zod`. Everything else is rejected, including Node built-ins
(`node:*`), frameworks, ORM/database clients, HTTP clients and any other package.
**Type-only imports.** The implementation holds type-only imports to the **same** allowlist. For
example, `import type { Request } from 'express'` is rejected. Contracts are shared with browser
code and are meant to stay framework-free, and a framework type in a contract couples every
consumer to that framework. The owner asked that this be assessed carefully, so this choice is
recorded as **proposed**. The alternative, allowing type-only imports of approved packages, would
need an explicit list.
**Limits.** Test files (`*.test.ts`) are exempt. They are excluded from the build by
`tsconfig.build.json`.

## D-012

**Title:** Web app must not import database clients or ORMs
**Status:** implemented — awaiting owner review
**Decision.** Rule `web-no-db-clients` rejects any import from `apps/web/` (value, type-only or
dynamic, resolved or not) of a known database client or ORM. The list is: Prisma, MikroORM,
Drizzle, Kysely, Knex, TypeORM, Sequelize, pg/pg-pool/postgres, Neon, Vercel Postgres,
mysql/mysql2/mariadb, PlanetScale, better-sqlite3/sqlite3, libSQL, MongoDB/Mongoose and
Redis/ioredis.
**Limits.** This is necessarily a denylist, because the web app legitimately uses many packages.
A database client not on the list is not caught. When Phase 2 introduces database infrastructure,
including any workspace database package, the rule must be extended in the same change
([G-40](GAPS.md)).

## D-013

**Title:** `engineStrict: true`
**Status:** implemented — awaiting owner review
**Decision.** `engineStrict: true` in `pnpm-workspace.yaml`, so pnpm refuses to install when
Node.js does not satisfy the root `engines.node` (`>=24.22.3 <25`).
**Verification.** A frozen install on Node 22.23.5 now fails with `ERR_PNPM_UNSUPPORTED_ENGINE`,
and on Node 24.22.3 it succeeds (audit finding L-01).

## D-014

**Title:** `packageManager` pinned with a Corepack integrity hash
**Status:** implemented — awaiting owner review
**Decision.** `"packageManager": "pnpm@12.22.0+sha512.<hex>"`, generated with `corepack use`.
**Verification.** The hash equals the npm registry `dist.integrity` of `pnpm@12.22.0` (base64 →
hex comparison). With a fresh Corepack cache, the correct hash runs pnpm 12.22.0, and a tampered
hash fails with "Mismatch hashes". The frozen install and lockfile are unchanged (audit finding
L-06).

## D-015

**Title:** Automated supply-chain policy test
**Status:** implemented — awaiting owner review
**Decision.** `tests/policy/supply-chain-policy.test.ts`, which runs in `pnpm test` and CI,
checks pnpm's **effective** settings (`pnpm config get … --json`) and the root `package.json`.
It requires: `minimumReleaseAge >= 10080`; `engineStrict` true; `engines.node` declared;
`packageManager` hash-pinned; and every `minimumReleaseAgeExclude` entry an exact `name@version`
with an `OV-###` row in the D-005 override log. Nine negative cases are unit-tested. Lowering the
real release age makes the repository test fail.
**Correction to audit finding L-10.** The audit stated that CI does not re-check the release age
because it installs with `--frozen-lockfile`. **That claim was wrong.** Verified on 2026-11-27 with
pnpm 12.22.0: a lockfile created with the policy disabled, and then installed with
`--frozen-lockfile` with the policy enabled, fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`.
pnpm verifies the lockfile against the active policy itself. D-015 therefore protects the inputs
that pnpm check depends on (the settings and the exclusions), rather than duplicating it.

---

## Phase 1 residual remediation decisions (D-016 – D-018)

**Authorization evidence:** Owner message "Phase 1 Audit Residual Remediation — R-01 and R-02"
(2026-11-27). R-01 and R-02 were mandatory; R-04 and R-06 were optional if narrow. No Phase 2 work
is included.

## D-016

**Title:** Runtime code must not import test files
**Status:** implemented — awaiting owner review
**Decision.** New rule `no-runtime-imports-of-test-files`: no non-test file under `apps/` or
`packages/` may import a test file. A test file is matched by `(\.(test|spec)\.[cm]?[jt]sx?$)` or
a `/__tests__/` path segment, and the rule covers value, type-only, dynamic, re-export and
`typeof import()` forms. Test files may import other test files. The existing test-file
exemptions in `contracts-allowlist` and `no-dev-deps-in-production-code` are **kept unchanged**:
tests still need devDependencies, and contract tests may use test helpers. With this rule those
exemptions can no longer be reached from runtime code. As an outcome check,
`tests/architecture/build-output.test.ts` asserts that `packages/contracts/dist` and
`apps/api/dist` contain no emitted test files.
**Rationale.** Remediation-audit finding R-01: a runtime file re-exporting a `*.test.ts` file
passed every gate, and `tsc` emitted the test file, with its forbidden `node:http` import, into
`dist/`. `exclude` in `tsconfig.build.json` filters entry points only.
**Also changed (R-02):** `api-module-entry-only` now exempts only `src/modules/<name>/`, so files
directly under `src/modules/` must use module entry points (see the D-010 correction).

## D-017

**Title:** Boundary scan covers all of `tests/`
**Status:** implemented — awaiting owner review
**Decision.** `pnpm arch` and the real-repository test cruise `apps packages tests`, instead of
only `tests/architecture` and `tests/e2e`. Fixtures stay excluded. The scanned `tests/` modules
are exactly the eight source files (architecture, e2e, policy, startup and the Vitest config), and
the test asserts that `tests/startup/` and `tests/policy/` are included (remediation audit R-04).

## D-018

**Title:** Per-command supply-chain overrides are rejected
**Status:** implemented — awaiting owner review
**Decision.** `tests/policy/supply-chain-policy.test.ts` scans every `.github/workflows/*.yml`
line, and the scripts in every workspace `package.json`, for
`minimum[-_.]?release[-_.]?age` and `engine[-_.]?strict`. That covers
`pnpm_config_minimum_release_age`, `--config.minimumReleaseAge`, `minimumReleaseAgeExclude` and
`pnpm_config_engine_strict`. These settings may be set only in `pnpm-workspace.yaml`, where
D-015 verifies them.
**Rationale.** Remediation audit R-06: `pnpm_config_minimum_release_age=0` or
`--config.minimumReleaseAge=0` disables the release-age check on a frozen install, and a
step-level override was invisible to the effective-settings check.
**Limits.** An override routed through an indirectly named variable (for example
`${{ vars.SOMETHING }}` expanding to a flag) or a script outside the workspace is not detected.
Workflow changes remain subject to review.

---

## Phase 1 completion decisions (D-019 – D-021)

**Authorization evidence:** Owner message "PHASE 1 — COMPLETE REMAINING WORK, CLOSEOUT
PREPARATION & FINAL VERIFICATION" (2026-11-27). It authorized resolving G-36 and G-38, N-01 and
N-02, and narrowly scoped Phase 1 remediation. It also said not to approve owner decisions
silently. Each decision is therefore **awaiting owner review**. Full details are in
[`security/logging-and-security-baseline.md`](security/logging-and-security-baseline.md).

## D-019

**Title:** Security baseline — CORS and HTTP security headers
**Status:** implemented — awaiting owner review
**Decision.**

- `API_CORS_ALLOWED_ORIGINS` (optional) is an exact-origin allowlist. When it is absent or
  empty, CORS is not enabled.
- Startup rejects wildcards, `null`, paths, credentials and non-http(s) values, and requires
  `https://` origins in staging and production.
- `credentials: false`; methods `GET` and `HEAD` only.
- The API sends CSP `default-src 'none'; frame-ancestors 'none'`, `nosniff`, `DENY`,
  `no-referrer`, CORP `same-site`, COOP `same-origin` and `Cache-Control: no-store`, plus HSTS in
  staging and production.
- The web app sends `nosniff`, `DENY`, `strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy` and COOP, plus HSTS in staging and production.

**Rationale.** G-36 and G-38 (audit M-05): a deliberate, secure-by-default policy before any
authenticated endpoint exists.
**Deferred.** The CORS credential model and production origins (Phase 2, with G-04), the web CSP
(G-31, Phase 3), and HSTS `includeSubDomains`/`preload` (G-06, G-21).
**Note on P-107.** P-107 requires every variable and allows no silent defaults. The two new
variables are optional with documented **secure** defaults (deny cross-origin, `info`). This is
an explicit, reviewable exception, recorded here for owner approval.

## D-020

**Title:** Structured JSON logging with redaction
**Status:** implemented — awaiting owner review
**Decision.**

- The API logs JSON lines through a NestJS `LoggerService`, and every entry is deep-redacted:
  sensitive keys, bearer/basic credentials, JWTs, URL credentials and `key=value` secrets, with
  length and depth caps.
- Request logging records method, path without query, status, duration and request id. It never
  records headers, bodies, query strings, IPs or user agents.
- 5xx are logged at `error` with the redacted error and stack. 4xx are logged at `info` with
  status and code only.
- `API_LOG_LEVEL` is `error|warn|info|debug` (default `info`); `debug` is rejected in staging and
  production.
- The exception filter no longer writes responses for non-HTTP contexts or after headers have
  been sent (audit L-05).

**Rationale.** G-32 and G-38 (audit M-04); Doc 01 §11, Doc 03 §19, Doc 04 §18 and §21.
**Limits.** Redaction is pattern-based. The primary control is never passing secrets or personal
data to the logger. Client-supplied request ids remain untrusted correlation hints (L-02, open).
The observability stack (metrics, tracing, retention) is open (G-32).

## D-021

**Title:** devDependency rule covers all workspace files; architecture CLI scope guard
**Status:** implemented — awaiting owner review
**Decision.**

- `no-dev-deps-in-production-code` applies to every file under `apps/<x>/` and `packages/<x>/`,
  not only `src/`.
- The only exemptions are test files (`*.test.ts(x)`) and test-tooling config
  (`^(apps|packages)/[^/]+/vitest.config.*`). `next.config.ts` is not exempt, because
  `next start` loads it at runtime.
- `no-runtime-imports-of-test-files` also forbids runtime imports of that tooling config, so the
  exemption cannot be used for laundering.
- The architecture suite checks that:
  - the `pnpm arch` scan targets equal the real-tree scan list;
  - every `pnpm-workspace.yaml` root is scanned;
  - CI runs `pnpm arch`;
  - every top-level exclusion alternative is anchored (H-01).

**Rationale.** Audit findings N-01 and N-02.

---

## Independent-audit remediation and owner decision reconciliation (2026-11-27)

**Authorization evidence:** Owner message "MASTER EXECUTION PROMPT — PHASE 1 REMEDIATION, FORMAL
CLOSURE & PHASE 2 IMPLEMENTATION" (2026-11-27), Part VI. It approved D-010 – D-018 and D-005
(retained), and approved D-019, D-020, D-021, S-02, I-02 and I-03 **conditionally**: each only
once the named audit findings were remediated and verified. Part IV P1-R3 authorized the D-022
interpretation. The independent audit itself is preserved in
[`audit/phase-1-independent-audit-report.md`](audit/phase-1-independent-audit-report.md).

| Decision             | Owner disposition (Part VI)                           | Condition                                          | Condition evidence                                                              |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| D-010, D-013 – D-017 | Approve                                               | Verification supports the implementation           | Independent audit §G (all gates reproduced); this remediation's verification    |
| D-011                | Approve the strict scope, type-only imports included  | Evidence confirms the behaviour                    | Audit probe: contracts `.spec.ts` importing `node:http` rejected; fixture suite |
| D-012                | Approve as an interim control; not exhaustive         | —                                                  | Limits recorded in D-012, G-40, R-05                                            |
| D-018                | Approve within its documented scope and limits        | —                                                  | Limits recorded in D-018; F-09 recorded below                                   |
| D-019                | Approve after F-04 is reconciled and verified         | F-04 remediated                                    | D-019 amendment below; `tests/startup/web-runtime-headers.test.ts`              |
| D-020                | Approve after F-01 is resolved and F-05 is documented | F-01 remediated; F-05 limits documented            | D-020 amendment below; `redact.test.ts`; security baseline §1                   |
| D-021                | Approve after F-02 is resolved and verified           | F-02 remediated                                    | D-021 amendment below; `rules/no-undeclared-dependencies/` fixture              |
| S-02                 | Approve after F-03 and F-06; open items stay open     | D-022 recorded; labels corrected; G-03 – G-08 open | S-02 v2 (`architecture/architecture-technical-specification-supplement.md`)     |
| I-02                 | Accept the residual; delete no CI evidence            | Description verified                               | Audit §H: old commit not fetchable by git; Actions API still serves its message |
| I-03                 | Choose a future author identity policy; no rewrite    | —                                                  | D-023                                                                           |
| D-005                | Retain as provisional; review by Phase 10             | —                                                  | Unchanged                                                                       |

The approvals take effect with the Phase 1 closure record in [`STATUS.md`](STATUS.md), which
cites the commit and CI run on which the conditions were verified.

### D-019 amendment (audit F-04)

**Change.** Web HSTS is no longer part of the `next.config.ts` headers, which Next.js compiles
into the build output. It is set per request by `apps/web/src/proxy.ts` from the runtime
`APP_ENV` (staging and production only). Environment-independent headers stay in
`next.config.ts`. **Reason.** A build made as `test` and started as `production` sent no HSTS,
which conflicts with promoting one immutable artifact (Doc 01 §17). **Also recorded (F-13):**
`Vary: Origin` is sent only to allowed origins; safe while every API response is `no-store`, and
must be revisited with any cacheable response (G-37).

### D-020 amendment (audit F-01, F-05, F-07)

**F-01.** Redaction work is bounded and linear: strings are cut to `SCAN_LIMIT` (5120 characters)
before any pattern runs; every pattern is anchored with a negative lookbehind and bounded;
objects and arrays are capped at 100 entries per level; the request path is capped at 512
characters at the source. **F-05.** Additional bounded patterns, and an honest list of what is
not detected (security baseline §1); the earlier description overstated the `key=value`
coverage. **F-07.** Caller fields cannot overwrite `time`, `level`, `context` or `fatal`; BigInt
and Date are serialized deliberately; serialization cannot throw.

### D-021 amendment (audit F-02, F-10)

**F-02.** New rule `no-undeclared-dependencies`: every workspace file (apps, packages, tests; any
import form) must declare each npm package it imports in its closest `package.json`
(dependency-cruiser types such imports `npm-no-pkg` / `npm-unknown`). The original wording of
D-021 ("no workspace file … imports devDependencies") was not true for root devDependencies that
resolve through the hoisted root `node_modules`. A test now also requires every rule to have
severity `error`, because `pnpm arch` exits 0 on warnings. **F-10.** The CLI-scope guard now
also requires every gate to run in `ci.yml` and rejects `continue-on-error`, `|| true` and
`if: false`/`always()`.

**F-09 (recorded, not changed).** `engineStrict` and `minimumReleaseAge` are enforced by pnpm's
effective configuration, so a developer can bypass them locally with environment variables such
as `pnpm_config_engine_strict=false`. CI does not set such variables (D-018 checks workflows and
scripts). Local enforcement against a deliberate override is out of scope.

## D-022

**Title:** Doc 05 Phase 1 exit-gate conflict: §11 vs §13
**Status:** approved — owner amendment/interpretation, 2026-11-27
**Approval evidence:** Owner message "MASTER EXECUTION PROMPT — PHASE 1 REMEDIATION, FORMAL
CLOSURE & PHASE 2 IMPLEMENTATION", Part IV P1-R3: "Phase 1 is the foundation phase defined by
§13, while tenant model and authentication boundary implementation are to be verified through
the Phase 2 gate, provided this interpretation does not conflict with the original five
specification documents."

**The conflict (verified in the PDF; the PDF is unchanged).**

- Doc 05 §11 (phase roadmap table), Phase 1 — Foundation: focus "Project conventions,
  environments, tenant-aware skeleton, contracts, testing and security foundations"; exit gate
  "Build/test gate; **tenant model and auth boundary verified**".
- Doc 05 §13 (phase-specific work packages), Phase 1 — Foundations: "Establish or verify project
  structure, type/validation standards, environments, API conventions, testing, logging, error
  handling and security foundations … Exit: reproducible build/checks and foundation contracts."
- Doc 05 §13 Phase 2 — Tenant and identity: "Define and verify tenant resolution and owner
  account lifecycle, server-side tenant context, permissions, tenant-owned resource policies and
  isolation tests … Exit: isolation/authentication/authorization negative tests."

The §11 Phase 1 gate requires verifying a tenant model and an auth boundary that §13 assigns to
Phase 2. The conflict was not recorded when Phase 1 was implemented: the implementation followed
§13, and S-02 §3 wrongly stated that no contradiction existed (audit F-03).

**Why Phase 1 followed §13.** §13 is the detailed work package; §11 summarizes. The decisions a
tenant model and an auth boundary depend on (ORM, RLS strategy, identity provider, tenant
resolution: G-03 – G-07) were owner-reserved "do not silently lock" items. Building them in
Phase 1 would have meant implementing Phase 2 on assumed answers, which Doc 05 §2 and §8 forbid.

**Decision.** Phase 1's exit gate is §13's: reproducible build/checks and foundation contracts,
plus the security foundations. Verification of the tenant model and the authentication boundary
moves to the **Phase 2 gate**, which already requires "isolation/authentication/authorization
negative tests" (§11 and §13 agree on that). §11's "tenant-aware skeleton" is likewise delivered
in Phase 2.

**Consistency check.** No other document assigns tenant or auth verification to the foundation
stage in a way this contradicts: Doc 01 §19 puts tenant identity, isolation enforcement and the
database model in Phase B (after Phase A foundations); Doc 04 §26 Stage A groups auth with
foundations but is a conceptual sequence governed by Doc 05 (D-001, D-002). The phase order is
unchanged; no requirement is dropped; it moves to the next gate. This is recorded as an
amendment under Doc 05 §17.

## D-023

**Title:** Commit author identity policy (I-03)
**Status:** approved (2026-11-27)
**Approval evidence:** Owner message (Part VI, I-03): "Choose and record an appropriate future
commit author identity policy. Do not rewrite historical commits."

**Decision.**

- Commits produced by an AI implementation agent keep the agent's git identity as author and
  committer (currently `Claude <noreply@anthropic.com>`). The git metadata then records honestly
  which tool produced the change; it does not attribute machine-written code to a person.
- Ownership and accountability are stated in every such commit message by the owner's
  attribution line, `Built by Deepak, assisted by Claude.` (CLAUDE.md). No session links.
- Commits the owner writes themselves use the owner's own git identity.
- Historical commits are not rewritten (it would invalidate every recorded commit id and CI
  reference). I-03 is closed by this policy.

**Alternative considered.** Author = owner, committer = agent. Rejected as the default because it
records the owner as having authored code they did not write; the owner can switch to it by
configuring `user.name`/`user.email` for future sessions and recording a superseding decision.

---

## Phase 2 entry decisions (D-024 – D-031)

**Authorization evidence:** Owner message "MASTER EXECUTION PROMPT — PHASE 1 REMEDIATION, FORMAL
CLOSURE & PHASE 2 IMPLEMENTATION" (2026-11-27), Part IX: resolve G-03 – G-08, G-36 and G-34/G-38
before Phase 2 implementation, evidence-driven, through bounded spikes where possible; Part XII:
ask the owner only for decisions that are outside the authorized scope, change the product,
introduce **a materially new vendor commitment**, or create irreversible external consequences.
Phase 1 was closed first (STATUS.md → "Phase 1 formal closure"). These decisions were taken by
the implementation agent under that delegation; each states its evidence. Any of them can be
superseded by the owner through a new entry.

## D-024

**Title:** G-03 — data access: Kysely on node-postgres; plain-SQL forward-only migrations
**Status:** approved (delegated, Part IX), 2026-11-27
**Evidence:** [`architecture/spikes/g03-g07-postgres-rls-spike.md`](architecture/spikes/g03-g07-postgres-rls-spike.md)
(real PostgreSQL 16, 90/90 PASS, re-run independently).
**Decision.**

- Runtime data access uses **Kysely** (`kysely`, MIT) over **node-postgres** (`pg`, MIT) with a
  `pg.Pool`. Kysely is a typed SQL builder with no engine and no hidden queries; raw SQL remains
  first-class (Doc 01 §9).
- Schema changes are **plain `.sql` files**, forward-only, applied in order by a small migration
  runner in `apps/api` (checksummed, one transaction per file, advisory-locked) as the migration
  role `app_owner`. RLS policies, `FORCE`, grants and functions are ordinary SQL in those files,
  so nothing in the toolchain can hide or silently drop them. A rollback is a new forward
  migration, or a restore (Doc 05 §8 backup/rollback strategy, G-10).
- Every tenant-scoped query runs through a single `withTenant()` helper; no other code may open
  a transaction or set the tenant setting (D-028).

**Prisma (the Doc 01 §9 "proposed baseline") was evaluated and not selected.** It passed the
runtime isolation checks inside interactive transactions, but RLS policies exist only as raw SQL
outside its schema model, its drift detection ignores them (a dropped policy goes unnoticed), its
introspection reports RLS as "not yet fully supported", `migrate dev` needs a shadow database,
and a bare (non-transactional) call silently returns no rows. For a platform whose primary
security property is database-enforced isolation, keeping policies first-class outweighs Prisma's
schema-first workflow. Doc 01 §9 calls Prisma "proposed … subject to architecture
specification", so this is a recorded architecture decision, not a deviation from a requirement.
**Dependency review (Doc 05 §8):** kysely 0.29.9, pg 8.23.1, @types/pg 8.23.1 — MIT, older than
7 days (D-005), no install scripts required.

## D-025

**Title:** G-04 — identity: OpenID Connect architecture behind a provider port
**Status:** architecture **approved** (delegated, Part IX); **identity-provider vendor: OPEN —
owner decision required** (materially new vendor commitment, Part XII)
**Decision (architecture).**

- Owners and platform operators authenticate with an external **OpenID Connect** provider using
  the authorization-code flow with PKCE. The platform never stores or verifies passwords and
  never builds its own credential system (no compelling reason to; it would add password
  storage, breach exposure and recovery handling).
- The API is a resource server: it accepts `Authorization: Bearer <JWT>` and verifies signature
  (JWKS, asymmetric algorithms only: RS256/ES256; `none` and HS* rejected), `iss`, `aud`, `exp`,
  `nbf` and a small clock skew. Library: `jose` (MIT), no vendor SDK.
- **Owners and operators are separate trust domains**: different issuer (realm/tenant) or at least
  different client/audience, configured separately. An owner token is never accepted on operator
  routes and vice versa. Operator tokens must show multi-factor authentication (`amr`/`acr`
  claims); owner MFA is strongly recommended and becomes required when the vendor supports it.
- Identity is mapped to a platform account by `(issuer, subject)`; e-mail is not an identifier.
  Membership and permissions are platform data (D-027), never token claims alone.
- Logout and session lifetime are handled by the web BFF (D-030); the API is stateless per
  request.
- An `IdentityVerifier` port isolates the provider. Tests use a local test issuer (generated keys,
  synthetic claims), so Phase 2 can be built and verified without a vendor account.

**Open: the vendor.** Candidates meeting the architecture: managed OIDC services (for example
Auth0/Okta, Microsoft Entra External ID, AWS Cognito, Google Identity Platform) or self-hosted
(Keycloak, Zitadel). Choosing one is a cost, data-residency, contract and exit-strategy commitment
for the owner. Until chosen, no vendor is integrated and no production login exists.

## D-026

**Title:** G-05 — account recovery is delegated to the identity provider
**Status:** approved (delegated, Part IX), 2026-11-27
**Decision.** Recovery (password reset, MFA reset) is performed by the identity provider through a
**verified e-mail** flow; SMS-only recovery is not allowed. Recovery links must be single-use and
short-lived (provider configuration, checked when the vendor is chosen). Operator MFA reset
requires a second operator and is audited. Platform-side: recovery and login endpoints the
platform itself exposes are rate-limited (D-031), responses do not reveal whether an account
exists, and recovery events received from the provider are logged without secrets (D-020).
**Depends on:** the D-025 vendor choice for its concrete configuration.

## D-027

**Title:** G-06 — tenant resolution and server-side tenant context
**Status:** approved (delegated, Part IX), 2026-11-27
**Decision.**

- **Public traffic (MVP): path-based tenant URLs** with a validated slug
  (`^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$`, reserved words refused). Doc 03 §18 allows paths and
  subdomains, with verified custom domains later (G-21). Paths need no wildcard DNS or
  certificates, keep HSTS `includeSubDomains` possible later, and keep one cookie origin.
- The server resolves the slug to an **active** tenant; unknown, suspended or retired tenants get
  the same tenant-safe "not found" (Doc 03 §3, §20). Internal tenant ids never appear in public
  URLs (Doc 03 §18).
- **Owner traffic: tenant from verified membership, never from the URL alone.** An owner request
  names a tenant; the server checks an active membership of the authenticated account in that
  tenant before any tenant data is read (Doc 04 §3).
- The resolved tenant is an immutable server-side value passed explicitly into `withTenant()`
  (D-028). It is never read back from client input after resolution.
- **Background jobs** carry the tenant id in their payload and open their own `withTenant()`
  transaction; a job without a tenant is refused. **Cache keys** must include the tenant id
  (Doc 03 §17); there is no cache in Phase 2.
- Membership model: an account may hold memberships in several tenants; Phase 2 has one role,
  `owner` (Doc 01 §5: one owner account per business; no staff roles).

## D-028

**Title:** G-07 — PostgreSQL row-level security isolation model, roles and operator access
**Status:** approved (delegated, Part IX), 2026-11-27
**Evidence:** spike (D-024), re-proved by `pnpm test:db` in the repository.
**Decision.**

- **Shared database, shared schema** (`app`), `tenant_id uuid not null` on every tenant-owned
  table (Doc 01 §10 "shared relational database … tenant-aware schema … RLS"). This settles the
  S-02 row 9 PROPOSED model.
- **Roles:** `app_owner` owns schema and tables and is used only by migrations; `app_runtime`
  (LOGIN, NOSUPERUSER, NOBYPASSRLS, NOINHERIT, not an owner, DML grants only, no TEMP/CREATE) is
  the only role the API uses; `app_operator` (NOBYPASSRLS) is the platform-operator path. No
  application role is a superuser or has BYPASSRLS.
- **Every tenant-owned table:** `ENABLE` and `FORCE ROW LEVEL SECURITY`; policy USING and WITH
  CHECK `tenant_id = app.current_tenant_id()` in the InitPlan-friendly form; an index on
  `tenant_id`. A database test asserts that every table with a `tenant_id` column has RLS,
  `FORCE` and a policy, so a forgotten policy fails CI.
- **Tenant context:** `set_config('app.tenant_id', <validated uuid>, true)` inside the
  transaction opened by `withTenant()`, once, as the first statement. Session-level `SET` and
  `set_config(..., false)` are forbidden (checked by a test that scans the API source). Missing,
  empty or malformed context fails closed.
- **Operator access** (Doc 01 §6, Doc 04 §3): no BYPASSRLS role. Cross-tenant operator actions go
  through `SECURITY DEFINER` functions owned by `app_owner`, executable only by `app_operator`,
  each taking an operator id and a reason and writing an audit record (Phase 2: tenant
  provisioning and lifecycle). Because an in-database audit row rolls back with its transaction,
  the API also emits a structured log entry before the call; the shipped log is the trail of
  record (G-32).
- **Tests:** negative isolation tests against real PostgreSQL in CI (Doc 05 §9), including pool
  reuse, concurrency and missing context.

## D-029

**Title:** G-08 — runtime secrets management
**Status:** approved (delegated, Part IX), 2026-11-27
**Decision.**

- Secrets (database passwords, identity-provider client secrets) are **injected at runtime as
  environment variables** by the deployment platform's secret store (concrete store chosen with
  G-09). They are never committed, never baked into an image, never in `.env.example` with real
  values, and never logged: the env schema reports names only (P-107) and redaction covers URL
  credentials (D-020).
- **Separate credentials per role.** The API runtime receives only the `app_runtime` connection
  string (`API_DATABASE_URL`). The migration job alone receives the `app_owner` connection string
  (`MIGRATION_DATABASE_URL`). The API process never holds migration credentials.
- **CI** uses synthetic, job-local credentials for a throwaway database; no real secrets exist
  in CI. GitHub environment secrets are reserved for future deployment jobs (Phase 10).
- **Local development** uses a gitignored `.env` with synthetic values.
- **Rotation:** credentials are rotatable without code changes (restart with new values);
  database roles support dual-password rotation by role recreation. The rotation runbook is part
  of Phase 10 with G-09/G-10.

## D-030

**Title:** G-36 — sessions through a server-side web BFF; API CORS stays credential-free
**Status:** approved (delegated, Part IX), 2026-11-27
**Decision.**

- The browser never holds identity tokens. The Next.js server (`apps/web`) acts as a
  backend-for-frontend: it runs the OIDC code flow, keeps the session server-side in an
  encrypted, `HttpOnly`, `Secure`, `SameSite=Lax`, host-only cookie, and calls the API
  server-to-server with the bearer token.
- Therefore the API keeps **`credentials: false` CORS** (D-019); no credentialed cross-origin
  browser request is ever needed. Production CORS origins stay empty unless a browser must call
  the API directly.
- **CSRF:** state-changing BFF routes require `SameSite=Lax` plus an `Origin`/`Host` check
  (and a CSRF token if a non-GET form is ever cross-site reachable). Logout clears the cookie and
  ends the provider session (RP-initiated logout).
- The BFF login flow is built when an owner-facing route first needs it; until the D-025 vendor is
  chosen, the API's token verification is tested against a local test issuer.

## D-031

**Title:** G-34/G-38 — rate limiting and request-cost controls
**Status:** approved (delegated, Part IX), 2026-11-27
**Decision.**

- **Bounded processing first** (audit F-01): body limit 100 KB, Node's 16 KB header limit, bounded
  logging, and no unbounded work per request.
- **Application rate limiting in-process** (fixed-window counters with a bounded key table) for
  authentication-relevant and tenant-resolution endpoints, keyed by route plus client address and,
  where present, account; responses are `429 TOO_MANY_REQUESTS` in the error envelope with
  `Retry-After`. No Redis: Doc 01 §9 introduces it only when justified.
- **Multi-instance limitation (recorded):** in-process limits are per instance. Before running
  more than one API instance, either an edge/load-balancer limit or a shared store is added
  (Phase 10, with G-09). The client address used for keys comes from the socket unless a trusted
  proxy is explicitly configured; `X-Forwarded-For` is not trusted by default.
- Credential-guessing protection for login itself is the identity provider's responsibility
  (D-025, D-026).

**Implementation (M2.5, 2026-11-27).** `apps/api/src/infrastructure/rate-limit/`:

| Group           | Routes                      | Default limit (per instance) | Key                    |
| --------------- | --------------------------- | ---------------------------- | ---------------------- |
| `public-tenant` | `GET /public/tenants/:slug` | 120 / minute                 | group + socket address |
| `owner`         | `/owner/*`                  | 120 / minute                 | group + socket address |
| `operator`      | `/operator/*`               | 30 / minute                  | group + socket address |

- The guard runs **before** authentication, so failed authentication attempts consume the
  budget (token guessing is limited before any verification work).
- Unknown and malformed tenant slugs consume the same budget as valid ones.
- Bounded key table (50,000 keys). **Fail closed for new keys when it is full of live keys**:
  failing open would let a client bypass limits by rotating source addresses; existing keys
  keep their budgets. Expired keys are evicted first.
- 429 responses use the error envelope plus `Retry-After`, and keep the security headers.
- Logs record `rate_limited` with the group and reason only, **never the client address**
  (D-020).
- **Not distributed.** Each instance counts on its own: N instances allow up to N × limit.
  `X-Forwarded-For` is not trusted, so behind a reverse proxy all clients would share the
  proxy's key until a trusted-proxy setting exists. Both must be resolved before running more
  than one instance or deploying behind a proxy (Phase 10, with G-09). Limits reset when the
  process restarts.
