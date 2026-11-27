# Phase 1 Independent Review Packet

**Purpose.** Gives an independent reviewer ("Account 2") what they need to audit the Phase 1
implementation without relying on the implementing agent's chat history or summaries. The
implementing agent prepared this packet. Treat every claim in it as something to verify, not as
evidence.

**Status:** audit completed 2026-11-27 (PASS WITH CONDITIONS) · prepared 2026-11-27

> **Post-audit correction.** Several statements below were shown to be inaccurate by the audit.
> Row 4 of §5 understated the boundary-check blind spot: the `dist/` exclusion also dropped npm
> dependencies (H-01). The claimed fixture coverage was 7 of 9 rules, not all rules (L-03). And
> `engines` was not enforced (L-01). See [`phase-1-audit-findings.md`](phase-1-audit-findings.md)
> for every finding and its status. This packet is kept as the record of what was handed to the
> auditor.
> A later remediation audit (R-01 – R-10) is recorded in the same register.
> For the final Phase 1 state see [`phase-1-closure-package.md`](phase-1-closure-package.md) and
> [`phase-1-independent-audit-handoff.md`](phase-1-independent-audit-handoff.md); this packet is historical.

## 1. What to review

| Item                    | Value                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository              | `thedeepakreddy/Menu-service-platflorm`                                                                                                                                                                                              |
| Branch                  | `claude/new-session-7xxuoq` (not merged; no PR)                                                                                                                                                                                      |
| Phase 0 commit          | `b963239` — specifications and governance docs                                                                                                                                                                                       |
| **Phase 1 code commit** | **`f383bc09b9099445f399a5d7f5645d54f9bd4835`** — all Phase 1 code and config                                                                                                                                                         |
| Later commits           | Documentation only (`docs/`, `README.md`, `CLAUDE.md`). Confirm with `git diff --stat f383bc0..HEAD`.                                                                                                                                |
| History note            | Commit messages after `075182c` were rewritten on 2026-11-27 (owner-authorized; messages only, trees unchanged). The old-to-new mapping is in `docs/STATUS.md` → "Commit history rewrite". CI runs #1–#3 ran on the pre-rewrite IDs. |
| Review diff             | `git diff b963239 f383bc0` (88 files)                                                                                                                                                                                                |
| Governing sources       | `docs/specifications/` (Docs 01–05; checksums in `docs/README.md`), the approved Phase 1 plan and decisions in `docs/DECISIONS.md` (P-101 – P-110, D-004 – D-009)                                                                    |

**Phase 1 scope as approved:** monorepo and workspaces; TypeScript, lint and format; Vitest;
Playwright; CI; environment validation; API, web and shared-package skeletons; documentation;
architecture enforcement. **Explicitly out of scope:** database/ORM, authentication, tenant
resolution or isolation, RLS, customer/owner features, localization, analytics, media, AI,
deployment and infrastructure, secrets backends.

## 2. Reproduce the evidence

Requires Node 24 (`.nvmrc`: 24.22.3) and Corepack. From a fresh clone at `f383bc0`:

```sh
corepack enable
export APP_ENV=test
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint            # builds packages/* first, then type-aware ESLint, zero warnings
pnpm typecheck
pnpm test            # Vitest: unit, API integration, architecture, startup
pnpm arch            # dependency-cruiser over the real tree
pnpm build
pnpm --filter @platform/tests exec playwright install --with-deps chromium   # if browsers absent
pnpm test:e2e
```

**Expected:** every command exits 0. `pnpm test` reports contracts 12, web 3, api 25, tests 14
(54 total). `pnpm arch` reports no violations over 55 modules / 59 dependencies. e2e: 6 passed.

**Boundary-enforcement negative check (manual):**

```sh
printf "import { parseApiEnv } from '../../api/src/env.js';\nexport const x = parseApiEnv;\n" \
  > apps/web/src/__violation.ts
pnpm arch; echo "exit=$?"     # expected: error no-cross-app-imports …, exit 1
rm apps/web/src/__violation.ts && pnpm arch   # expected: clean, exit 0
```

**Invalid-configuration negative check (manual, after build):**

```sh
(cd apps/api && env -i PATH="$PATH" node dist/main.js; echo "exit=$?")          # exit 1, "is required"
(cd apps/api && env -i PATH="$PATH" APP_ENV=bogus API_HOST=127.0.0.1 API_PORT=1 node dist/main.js; echo "exit=$?")
(cd apps/web && env -i PATH="$PATH" node node_modules/next/dist/bin/next build; echo "exit=$?")   # exit 1
```

## 3. Evidence already recorded

| Evidence                                                                                      | Location                                        |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Local clean-tree gate run, deliberate-violation and invalid-config results                    | `docs/STATUS.md` → "Phase 1 gate evidence"      |
| CI run #1 on `f383bc0` (success), runs #2 (cancelled, superseded) and #3 (success, docs only) | `docs/STATUS.md`; GitHub Actions, workflow "CI" |
| Decisions, approvals and conditions                                                           | `docs/DECISIONS.md`                             |
| Open gaps                                                                                     | `docs/GAPS.md`                                  |
| Requirement → code → test mapping                                                             | `docs/STATUS.md` → "Implementation ledger"      |

Local logs from the implementation container are **not** committed. They lived in an ephemeral
scratch directory. CI logs on GitHub and re-running the commands above are the reproducible
sources.

## 4. Suggested audit checklist

1. **Scope.** Is there no functionality from Phase 2 or later (tenant, auth, DB, i18n, analytics,
   AI)? Is anything present that the approved plan did not list? (Known additions are disclosed in
   §5.)
2. **Specification conformance.** Check against Doc 02 §1–§4 (modular monolith, boundary
   enforcement in CI, proposed layout and the approved P-109 deviation) and the Doc 05 Phase 1
   work package.
3. **No weakened checks.** Look at `packages/config/tsconfig/base.json`, `packages/config/eslint.js`
   and `eslint.config.mjs`. The only approved relaxation is D-007. Search for
   `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `skip`/`only` in tests, and `--no-verify`.
4. **Tests prove behaviour, not just pass.** Do the boundary tests fail on real violations? Do
   startup tests exercise the built artifacts? Do the API tests use a real HTTP server?
5. **Security foundations.** Error responses never leak internals; request-id handling;
   environment errors never echo values; CI token permissions; Action SHA pinning; lockfile
   integrity; no secrets in the diff.
6. **Reproducibility.** A frozen-lockfile install from a clean clone; Node 24 pinning
   (`.nvmrc`, `engines`, `packageManager`).
7. **Governance accuracy.** Do `STATUS.md`, `DECISIONS.md` and `GAPS.md` match the repository?
   Is anything unresolved presented as done?

## 5. Known limitations and points deserving scrutiny

The implementing agent identified these. They are listed so the reviewer can confirm, challenge
or extend them. None has been fixed after acceptance.

| #   | Area             | Observation                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Request id       | A client-supplied `x-request-id` is accepted if it matches `^[A-Za-z0-9_-]{8,128}$`. That prevents log injection, but clients can choose their own correlation ids (spoofing or collisions in logs). Acceptable for Phase 1?                                                                                                                                                                           |
| 2   | Error filter     | All `HttpException` messages are replaced with generic text, so future validation-error detail will need an extension of P-108 (G-14). Non-HTTP errors become 500 and are logged with their stack.                                                                                                                                                                                                     |
| 3   | Logger           | `createApp()` calls `Logger.overrideLogger(...)`, which is process-global static state; tests rely on it.                                                                                                                                                                                                                                                                                              |
| 4   | Boundary rules   | Imports of workspace packages resolve to `packages/*/dist` and are **excluded** from the cruise. Rules about package internals therefore apply to `src` sources, and deep `@platform/x/src/...` specifiers are blocked by the `exports` map (they surface as `not-to-unresolvable`; confirmed on 2026-11-27 with a temporary probe file that was then deleted). Check whether that coverage is enough. |
| 5   | Fixtures         | `tests/architecture/fixtures/violations/packages/contracts/node_modules/react/` is committed through a `.gitignore` negation so the framework-free rule can be proven.                                                                                                                                                                                                                                 |
| 6   | Web env          | Validation runs only when Next.js loads `next.config.ts`. The web app reads no other env yet. `APP_ENV` is required even for `typecheck` (D-008).                                                                                                                                                                                                                                                      |
| 7   | Tooling versions | TypeScript 6.0 (D-004), Playwright 1.63.0 (D-006), pnpm 12.22.0 (12.24 already exists), and the 7-day minimum release age (D-005, provisional).                                                                                                                                                                                                                                                        |
| 8   | Telemetry        | `TURBO_TELEMETRY_DISABLED=1` is set in CI only. Next.js telemetry is not disabled (its notice appears in the CI log). There is no policy decision yet.                                                                                                                                                                                                                                                 |
| 9   | CI               | The Build step is a Turborepo cache hit because typecheck already built everything in the same job. No dependency caching between runs. e2e uses fixed ports 3100/4100.                                                                                                                                                                                                                                |
| 10  | Security headers | Only `x-powered-by` is disabled. There is no CSP/HSTS, body-limit or rate-limit configuration (G-31, G-34).                                                                                                                                                                                                                                                                                            |
| 11  | Health           | `GET /health` is liveness only (G-33).                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | Environment      | Node 24 was installed manually in the implementation container; there is no saved environment setup script (G-35).                                                                                                                                                                                                                                                                                     |
| 13  | `skipLibCheck`   | Enabled in the shared base (standard practice; it does not affect checking of first-party code).                                                                                                                                                                                                                                                                                                       |
| 14  | D-009            | The placeholder `noindex` must be removed or replaced in the customer-platform phases.                                                                                                                                                                                                                                                                                                                 |

## 6. Reporting findings

Please record findings with: id, severity (blocking / should-fix / note), file and line, the
observed behaviour, the expected behaviour with a specification or decision reference, and a
suggested remedy. Findings that need code changes require explicit owner authorization before the
implementing agent acts on them. Accepted findings become entries in `docs/DECISIONS.md` or
`docs/GAPS.md`.
