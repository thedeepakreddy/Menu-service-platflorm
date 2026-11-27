# Decision Log

The central record of decisions that govern implementation (Doc 05 §5). Decisions are never
silently changed. To revise one, add a new entry that marks the old one `superseded`, and keep
the history.

**Statuses:** `proposed` · `approved` · `implemented` · `verified` · `blocked` · `deferred` · `superseded`

A `proposed` decision is **not** binding. It may guide drafts but must not be treated as locked
until the owner approves it.

## Index

| ID              | Title                                                         | Status                 | Date       |
| --------------- | ------------------------------------------------------------- | ---------------------- | ---------- |
| [D-001](#d-001) | Document 05 is the authoritative execution roadmap            | approved               | 2026-11-27 |
| [D-002](#d-002) | Phase sequencing authority and tracking of discrepancies      | approved               | 2026-11-27 |
| [D-003](#d-003) | Specification placement and preservation                      | approved               | 2026-11-27 |
| [P-101](#p-101) | pnpm workspaces + Turborepo                                   | verified               | 2026-11-27 |
| [P-102](#p-102) | Node.js 24 LTS, pinned                                        | verified               | 2026-11-27 |
| [P-103](#p-103) | Strict TypeScript from one shared base                        | verified               | 2026-11-27 |
| [P-104](#p-104) | ESLint flat config + Prettier; dependency-cruiser boundaries  | verified               | 2026-11-27 |
| [P-105](#p-105) | Vitest (unit/integration) + Playwright (e2e)                  | verified               | 2026-11-27 |
| [P-106](#p-106) | GitHub Actions CI                                             | verified               | 2026-11-27 |
| [P-107](#p-107) | Zod-validated environment, fail fast, `.env.example` only     | verified               | 2026-11-27 |
| [P-108](#p-108) | Initial API error envelope and request id convention          | verified               | 2026-11-27 |
| [P-109](#p-109) | Create only `contracts` and `config` packages in Phase 1      | verified               | 2026-11-27 |
| [P-110](#p-110) | `CLAUDE.md` operational guide                                 | verified               | 2026-11-27 |
| [D-004](#d-004) | TypeScript pinned to 6.0.x (not 7.x)                          | approved               | 2026-11-27 |
| [D-005](#d-005) | 7-day minimum release age for npm packages                    | approved (provisional) | 2026-11-27 |
| [D-006](#d-006) | `@playwright/test` pinned exactly to 1.63.0                   | approved               | 2026-11-27 |
| [D-007](#d-007) | `no-extraneous-class` uses `allowWithDecorator` in `apps/api` | approved (scoped)      | 2026-11-27 |
| [D-008](#d-008) | `APP_ENV` required by every app and by build/typecheck/test   | approved               | 2026-11-27 |
| [D-009](#d-009) | Web placeholder is marked `noindex`                           | approved               | 2026-11-27 |

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
   is older than its removal condition. This check is manual today. Automating it in CI is a
   possible future change, tracked in [G-30](GAPS.md), and is not authorized yet.

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
