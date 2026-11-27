# Specification Gaps, Conflicts and Open Questions

Items the specification package leaves unresolved. Missing requirements are **not** invented
(Doc 05 §2). Each gap is resolved by an owner decision recorded in [`DECISIONS.md`](DECISIONS.md).
Until then, the work that depends on it must not be implemented on assumed answers.

**"Blocks"** names the earliest Doc 05 phase that cannot complete without a resolution.

_Last updated: 2026-11-27_

## A. Specification completeness and conflicts

| ID   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Source                             | Blocks                                           | Status                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| G-01 | **Document 02 appears incomplete.** The PDF has 3 pages and ends after §4 (proposed repository structure). It contains no sections on the tenant data model, RLS enforcement, identity/auth, API conventions and versioning, cache/queue, security, observability, environments or infrastructure, yet Doc 01 §10 and §22 defer exactly these to "the detailed specification". The owner confirmed the document appears incomplete and directed: do not assume the missing sections exist. | Doc 02; Doc 01 §10, §22            | 1 (partial: conventions only), 2 (substantially) | open — owner to provide the complete Doc 02 or approve decisions item by item |
| G-02 | Sequencing discrepancies between Doc 01 Phases A–J, Doc 04 Stages A–G and Doc 05 Phases 0–10 (onboarding, localization, publishing, analytics, workspace shell, media). Governed by D-001/D-002; tracked as SEQ-1…SEQ-6.                                                                                                                                                                                                                                                                   | Doc 01 §19; Doc 04 §26; Doc 05 §11 | see each SEQ item                                | tracked — [`architecture/phase-mapping.md`](architecture/phase-mapping.md)    |

## B. Decisions that must not be silently locked

The owner listed these explicitly. Any Phase 1 work touching them may only _prepare structure_;
each one needs a `proposed` → `approved` decision.

| ID   | Item                                                                                                                                          | Source                                  | Blocks                   | Status |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------ | ------ |
| G-03 | ORM choice (Prisma is only a "proposed baseline"); migration tooling                                                                          | Doc 01 §9                               | 2 (schema), 4            | open   |
| G-04 | Authentication provider (owner and operator identity)                                                                                         | Doc 04 §29                              | 2                        | open   |
| G-05 | Account recovery flow                                                                                                                         | Doc 04 §19, §29                         | 2                        | open   |
| G-06 | Tenant enforcement architecture: tenant resolution mechanisms (domain / subdomain / path / QR), trusted context propagation, membership model | Doc 01 §3, §10, §22; Doc 03 §3          | 2                        | open   |
| G-07 | Database RLS policy strategy and privileged/operator access model                                                                             | Doc 01 §10, §22; Doc 04 §21             | 2                        | open   |
| G-08 | Secrets management and environment separation mechanism                                                                                       | Doc 01 §16, §17, §22                    | 1 (conventions only), 10 | open   |
| G-09 | Production cloud / deployment provider and infrastructure sizing                                                                              | Doc 01 §17, §22                         | 10                       | open   |
| G-10 | Backup schedule, disaster recovery, RPO/RTO targets                                                                                           | Doc 01 §17, §22                         | 10                       | open   |
| G-11 | Analytics event taxonomy, consent implementation, retention schedule, aggregation thresholds                                                  | Doc 01 §22; Doc 03 §19, §21; Doc 04 §29 | 8                        | open   |
| G-12 | Media storage, processing pipeline and upload quotas                                                                                          | Doc 04 §11, §29                         | 6                        | open   |
| G-13 | AI provider/model policy, routing, budgets, cost limits, evaluation datasets and thresholds                                                   | Doc 01 §22; Doc 04 §29                  | 9                        | open   |

## C. Other open items named by the specifications

| ID   | Item                                                                                              | Source                     | Blocks             | Status |
| ---- | ------------------------------------------------------------------------------------------------- | -------------------------- | ------------------ | ------ |
| G-14 | API schema, endpoint inventory, OpenAPI governance and versioning policy, error-response contract | Doc 01 §8, §22; Doc 04 §22 | 1 (convention), 2+ | open   |
| G-15 | Domain database schemas, indexes, transaction boundaries, deletion/archive semantics              | Doc 01 §22; Doc 04 §29     | 4                  | open   |
| G-16 | Theme token schema, template constraints, visual composition contracts                            | Doc 01 §22; Doc 03 §16     | 3                  | open   |
| G-17 | Owner-facing design system, component catalog and accessibility test tooling                      | Doc 04 §29                 | 3/6                | open   |
| G-18 | Capability / entitlement matrix and commercial packaging                                          | Doc 04 §29                 | 2/6                | open   |
| G-19 | Queue, cache (Redis "when justified") and search implementation choices                           | Doc 01 §9, §22             | as needed          | open   |
| G-20 | Security threat model; applicable legal and privacy obligations                                   | Doc 01 §22                 | 2 (initial), 10    | open   |
| G-21 | Custom-domain verification, advanced QR lifecycle, external integration contracts                 | Doc 04 §29; Doc 03 §18     | 7/9                | open   |
| G-22 | MVP acceptance thresholds and launch pilot criteria (performance budgets, accessibility level)    | Doc 01 §22; Doc 03 §17     | 5, 10              | open   |
| G-23 | Supported locales at launch and default fallback order                                            | Doc 01 §15; Doc 03 §15     | 3                  | open   |

## D. Phase 1 tooling choices (resolved)

| ID   | Item                                                | Status                                 |
| ---- | --------------------------------------------------- | -------------------------------------- |
| G-24 | Package manager and monorepo task runner            | resolved — [P-101](DECISIONS.md#p-101) |
| G-25 | Node.js runtime version and pinning                 | resolved — [P-102](DECISIONS.md#p-102) |
| G-26 | Lint/format tooling and module-boundary enforcement | resolved — [P-104](DECISIONS.md#p-104) |
| G-27 | CI platform                                         | resolved — [P-106](DECISIONS.md#p-106) |
| G-28 | Agent instruction file                              | resolved — [P-110](DECISIONS.md#p-110) |

## E. Found during Phase 1 (open)

| ID   | Item                                                                                                                                                           | Blocks                                    | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| G-29 | TypeScript 7 adoption is blocked until `typescript-eslint` supports it ([D-004](DECISIONS.md#d-004))                                                           | —                                         | open   |
| G-30 | Dependency and GitHub Action update policy (e.g. Dependabot/Renovate), including how urgent patches bypass the 7-day release age ([D-005](DECISIONS.md#d-005)) | 10                                        | open   |
| G-31 | HTTP security headers (CSP, HSTS, frame/referrer policy) for web and API. Phase 1 only disables `x-powered-by`.                                                | 3 / 10                                    | open   |
| G-32 | Structured logging, log redaction policy and observability stack. Phase 1 uses NestJS's built-in logger.                                                       | 10 (logging conventions sooner if needed) | open   |
| G-33 | Readiness/health semantics beyond liveness. `GET /health` checks no dependencies, because none exist yet.                                                      | 2 (when the DB lands)                     | open   |
| G-34 | API request body size limits and rate limiting are not configured yet (framework defaults apply)                                                               | 2 / 10                                    | open   |
| G-35 | Cloud-session environment: Node 24 was installed manually into the container for verification. There is no saved setup script yet.                             | —                                         | open   |
