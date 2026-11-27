# Phase 1 Independent Audit Hand-off

> **Status (2026-11-27):** the independent audit requested here was performed on `c788b0e`. Its
> report is [`phase-1-independent-audit-report.md`](phase-1-independent-audit-report.md). This
> hand-off is kept as written.

**For:** an auditor who did **not** implement the work. Every review so far — the Phase 1 audit,
the remediation audit and the residual-remediation audit — was a **self-audit** by the same Claude
session that implemented the work. This hand-off asks for the independent review that Phase 1
closure still needs.

**Rules for the auditor.** Read-only. Do not modify, commit, push, merge, open PRs or deploy.
Use scratch clones for experiments. Do not start Phase 2. Treat every claim in `docs/` as a claim
to verify, not as evidence.

## 1. Target

- **Repository / branch:** `thedeepakreddy/Menu-service-platflorm`, `claude/new-session-7xxuoq`.
- **Commits:** the Phase 1 completion commits and the final evidence commit are listed in
  `docs/STATUS.md` → "Phase 1 completion work". The earlier history and the message rewrite are
  recorded in the same file.
- **Scope:** the whole Phase 1 deliverable. The highest-value targets are:
  - architecture enforcement (`tests/architecture/`);
  - the security and logging baseline (`apps/api/src/{env.ts,create-app.ts,all-exceptions.filter.ts}`,
    `apps/api/src/logging/`, `apps/api/src/security/`, `apps/web/src/security-headers.ts`,
    `apps/web/next.config.ts`);
  - the supply-chain policy (`tests/policy/`, `pnpm-workspace.yaml`, `package.json`);
  - the CI workflow;
  - the governance records.

## 2. Reproduce

```sh
git clone --branch claude/new-session-7xxuoq https://github.com/thedeepakreddy/Menu-service-platflorm.git
cd Menu-service-platflorm && git checkout <commit under audit>
corepack enable && export APP_ENV=test
pnpm install --frozen-lockfile --store-dir "$(mktemp -d)"
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm arch && pnpm build
pnpm --filter @platform/tests exec playwright install --with-deps chromium   # if needed
pnpm test:e2e
pnpm audit && pnpm audit --prod
```

The expected results are in `docs/STATUS.md`. Node 24.22.3 is required; installation on other
majors must fail with `ERR_PNPM_UNSUPPORTED_ENGINE`.

## 3. Specific questions

1. Can any runtime file under `apps/` or `packages/` reach a test file, a devDependency or a
   forbidden package through any import form dependency-cruiser understands? Known limits are
   L-04, R-03 and R-10.
2. Do the per-rule fixtures fail for the right reason, and does each fail if its rule is weakened?
   Try your own mutations.
3. Can the CORS policy be made to reflect an unlisted origin, send credentials, or accept a
   wildcard or http origin in production?
4. Can any secret or personal datum from a request (headers, cookies, query, body, IP) reach a log
   line? Try your own payloads against `createApp` with a capture logger.
5. Do security headers appear on all API responses, including errors, preflight and 404s, and on
   web routes?
6. Do the supply-chain controls hold (release age on frozen install, engine strictness, hash pin,
   override detection)? Known limits are recorded in D-018.
7. Is S-02 consistent with Documents 01–05 and with the code, and does it ever present an OPEN item
   as decided?
8. Do `STATUS.md`, `DECISIONS.md`, `GAPS.md` and the findings register describe the repository
   accurately? Is anything pending presented as approved or closed?
9. Is there any Phase 2 functionality present (tenancy, identity, database, menu, owner or customer
   features)? There should be none.

## 4. Known limitations (do not re-report unless you find more)

L-02, L-04, L-08, L-09, R-03, R-05, R-07, R-08, R-10 (see `phase-1-audit-findings.md`); D-018's
text-scanning limits; the web CSP being deferred (G-31); and the CORS credential model and rate
limiting belonging to Phase 2 (G-36, G-34).

## 5. Report

For each finding, give: id, severity, file and line, evidence, reproduction, impact,
recommendation, and whether it blocks Phase 1 closure. End with PASS, PASS WITH CONDITIONS or FAIL,
and an explicit statement that no files were modified.
