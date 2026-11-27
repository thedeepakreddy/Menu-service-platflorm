# Architecture & Technical Specification — Supplement S-02

**Supplements:** Document 02, _Architecture & Technical Specification_, v1.0
(`docs/specifications/Architecture_Technical_Specification_02.pdf`, SHA-256 `49ae4445…a604`).
**Status:** **APPROVED v2** (2026-11-27) as the Phase 1 architecture baseline supplement for
gap G-01. v1 was drafted 2026-11-27 as PROPOSED; v2 corrects the status labels (audit F-06) and
the consistency review (audit F-03, decision D-022), after which the owner's conditional approval
took effect ([`../DECISIONS.md`](../DECISIONS.md), "Independent-audit remediation"). Approval
covers the traceability and labels below; it does **not** decide any row marked PROPOSED,
INFERRED or OPEN.
It does not modify, replace or reinterpret Document 02. If the owner supplies a complete Document
02, that document takes precedence and this supplement is reconciled against it.
**Precedence:** Documents 01–05 and approved decisions (`docs/DECISIONS.md`) prevail over this
supplement. Nothing here approves an open decision.

## 0. Why this supplement exists

Document 02 v1.0 has three pages and covers §1 goals and constraints, §2 logical topology, §3 the
modular-monolith pattern and §4 the proposed repository structure. Document 01 §8–§17 and §22,
and Document 04 §29, assign further technical content to "the detailed specification". That
content is absent:

- the tenant data model, RLS and privileged-access model;
- identity and authentication;
- API conventions, versioning and the endpoint inventory;
- database, ORM and migrations;
- caching, queues and jobs; media storage;
- security, observability and logging;
- environments, deployment, backup and recovery;
- testing and architecture enforcement.

This supplement collects, **with traceability**, what the specification package and the approved
or implemented decisions already establish for each topic, and marks every remaining choice as
**OPEN** with its gap. It invents no requirement.

**Status labels**

| Label       | Meaning                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| BASELINE    | Stated by Documents 01–05; binding                                                                    |
| APPROVED    | An owner-approved decision (`docs/DECISIONS.md`)                                                      |
| IMPLEMENTED | Built and verified in the repository                                                                  |
| PROPOSED    | A recommendation awaiting owner approval; not binding                                                 |
| INFERRED    | A design this supplement derives from the specifications but they do not state it; not binding (F-06) |
| DEFERRED    | Agreed to belong to a later phase                                                                     |
| OPEN        | Undecided; tracked as a gap; must not be implemented on assumption                                    |

## 1. Traceability matrix

| #   | Requirement                                                                                                                  | Source                                            | Architectural decision                                                                                                                                                                                                                                                               | Status                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One shared platform and codebase; tenant-specific behaviour by configuration only; no tenant forks                           | Doc 01 §3, §21; Doc 02 §1; Doc 05 §7              | Single monorepo and deployables; tenant differences expressed as data/configuration                                                                                                                                                                                                  | BASELINE                                                                                                                                      |
| 2   | Modular monolith first; specialised services only when justified                                                             | Doc 01 §8; Doc 02 §1, §3                          | `apps/api` (NestJS) is the single backend; Python/Rust services only on measured need                                                                                                                                                                                                | BASELINE                                                                                                                                      |
| 3   | Module boundaries enforced in CI                                                                                             | Doc 02 §3                                         | 14 dependency-cruiser rules (all `error`) with per-rule fixtures; `pnpm arch` and `pnpm test` in CI                                                                                                                                                                                  | IMPLEMENTED (P-104, D-010 – D-018, D-021)                                                                                                     |
| 4   | Repository structure                                                                                                         | Doc 02 §4                                         | `apps/{api,web}`, `packages/{contracts,config}`, `tests/`, `docs/`; `ui`, `test-utils`, `services`, `infra` deferred until needed                                                                                                                                                    | APPROVED (P-109)                                                                                                                              |
| 5   | TypeScript primary; React/Next.js web; Node/NestJS backend; PostgreSQL; Tailwind; Zod; Vitest/Playwright                     | Doc 01 §9                                         | Adopted as listed; versions pinned (D-004, D-006)                                                                                                                                                                                                                                    | APPROVED (P-101 – P-105)                                                                                                                      |
| 6   | Customer experience, owner workspace and operator control plane in one product                                               | Doc 01 §4–§6; Doc 02 §2                           | `apps/web` serves customer, management and operator routes (Doc 02 §4: "customer experience + owner + operator routes"). Separate authentication for the operator plane is BASELINE (Doc 04 §3); route groups per surface are INFERRED                                               | BASELINE (single web app, separate operator auth); route groups INFERRED; route design **OPEN** (Phases 3/6)                                  |
| 7   | Tenant resolution from verified domains, subdomains, paths and validated QR context; never trust a client-supplied tenant id | Doc 01 §3, §10; Doc 03 §3; Doc 04 §3              | A server-side resolver produces an immutable tenant context per request. The mechanism, precedence and domain model are undecided                                                                                                                                                    | BASELINE principle; mechanism **OPEN (G-06)**                                                                                                 |
| 8   | Tenant isolation at server and data layers, tested across APIs, queries, cache, storage, jobs and analytics                  | Doc 01 §10; Doc 04 §21; Doc 05 §7                 | Application authorization plus database-level isolation; isolation tests against a real database                                                                                                                                                                                     | BASELINE; enforcement model **OPEN (G-06, G-07)**                                                                                             |
| 9   | PostgreSQL shared database with tenant-aware schema and RLS where appropriate                                                | Doc 01 §9, §10                                    | Shared relational database with tenant-aware schema design and RLS where appropriate (Doc 01 §10). A shared schema with `tenant_id` on every tenant-owned row is the PROPOSED model (closure package G-07)                                                                           | BASELINE (shared DB, tenant-aware schema); shared-schema `tenant_id` model PROPOSED; RLS strategy **OPEN (G-07)**                             |
| 10  | ORM; SQL first-class for constraints, RLS and migrations                                                                     | Doc 01 §9 ("Prisma … proposed baseline")          | ORM choice and migration tooling undecided; raw SQL allowed for RLS and constraints                                                                                                                                                                                                  | **OPEN (G-03)**                                                                                                                               |
| 11  | One owner account per tenant; no staff roles in MVP; separately governed operator access                                     | Doc 01 §5, §21; Doc 04 §3                         | Identity has owner and operator principals only                                                                                                                                                                                                                                      | BASELINE; provider **OPEN (G-04)**, recovery **OPEN (G-05)**                                                                                  |
| 12  | Server-side authorization on every privileged action; frontend checks never substitute                                       | Doc 01 §10, §16; Doc 05 §7                        | API guards on every non-public route; the web app never decides access                                                                                                                                                                                                               | BASELINE                                                                                                                                      |
| 13  | REST API with OpenAPI governance; versioned, validated contracts; consistent errors                                          | Doc 01 §8; Doc 04 §22                             | REST over JSON; Zod schemas in `packages/contracts`; error envelope and request id (P-108); OpenAPI generation and versioning policy undecided                                                                                                                                       | P-108 APPROVED (initial); versioning/inventory **OPEN (G-14)**                                                                                |
| 14  | Contracts shared, framework-free                                                                                             | Doc 02 §4; Doc 01 §8                              | `packages/contracts` may depend only on its own sources and zod, including type-only imports                                                                                                                                                                                         | IMPLEMENTED (D-011; type-only scope **PROPOSED**)                                                                                             |
| 15  | Explicit cache invalidation; tenant-aware cache keys; no cross-tenant contamination                                          | Doc 01 §8; Doc 03 §17                             | Every cache key includes the tenant; versioned invalidation on publish                                                                                                                                                                                                               | BASELINE; cache technology **OPEN (G-19)**; rendering/CDN rules **OPEN (G-37, Phase 3)**                                                      |
| 16  | Background jobs with idempotency, retry, cancellation, dead-letter, tenant context                                           | Doc 01 §8; Doc 04 §22                             | Jobs carry an explicit tenant context and an idempotency key                                                                                                                                                                                                                         | BASELINE; queue technology **OPEN (G-19)**                                                                                                    |
| 17  | S3-compatible object storage with tenant-aware ownership, access and lifecycle                                               | Doc 01 §9; Doc 04 §11                             | Tenant-aware ownership, access and lifecycle policies (Doc 01 §9). Tenant-prefixed object keys and server-mediated access are INFERRED designs                                                                                                                                       | BASELINE (tenant-aware ownership); key layout INFERRED; quotas and processing **OPEN (G-12)**                                                 |
| 18  | Versioned configuration; capability and entitlement governance                                                               | Doc 01 §3, §6, §8                                 | Configuration and capabilities are data owned by the platform/operator                                                                                                                                                                                                               | BASELINE; matrix **OPEN (G-18)**                                                                                                              |
| 19  | Publishing: draft → validation → preview → publish → version; failed publish keeps the prior version                         | Doc 04 §15; Doc 05 §7                             | Public delivery reads only the latest successfully published version; no partial publication; a failed publish keeps the prior version (Doc 04 §15, Doc 05 §7). Immutable version records are INFERRED; the transactional or consistency strategy is decided in Phase 8 (Doc 05 §13) | BASELINE (lifecycle and failure behaviour); version model INFERRED; implementation Phase 8 (DEFERRED); minimum draft/published boundary SEQ-3 |
| 20  | Domains, subdomains, paths and verified custom domains; QR destinations stable through their lifecycle                       | Doc 03 §3, §18; Doc 04 §12                        | Avoid sensitive data and internal tenant identifiers in QR/public URLs (Doc 03 §3, §18). QR codes encoding opaque identifiers resolved server-side is INFERRED from that                                                                                                             | BASELINE (no sensitive data in URLs); opaque-identifier design INFERRED; domain model **OPEN (G-06, G-21)**                                   |
| 21  | Localization from launch with structured locale records and controlled fallback                                              | Doc 01 §15; Doc 03 §15; Doc 04 §14                | Locale resolution server-side with an explicit fallback order                                                                                                                                                                                                                        | BASELINE; locales **OPEN (G-23)**; base in Phase 3 (SEQ-2)                                                                                    |
| 22  | Privacy-preserving, aggregate, tenant-scoped analytics; consent and retention                                                | Doc 01 §11, §14; Doc 03 §19, §21; Doc 04 §16      | No customer profiles; aggregate events only                                                                                                                                                                                                                                          | BASELINE; taxonomy/retention **OPEN (G-11)**                                                                                                  |
| 23  | AI progressive, grounded, provider-independent, budgeted; never certifies safety facts                                       | Doc 01 §12; Doc 03 §14; Doc 04 §17                | AI behind a provider abstraction; outputs are drafts; no persistent customer memory                                                                                                                                                                                                  | BASELINE; providers/budgets **OPEN (G-13)**                                                                                                   |
| 24  | Provider-independent integrations; optional providers never block core flows                                                 | Doc 01 §13                                        | Integrations behind ports; failure isolated                                                                                                                                                                                                                                          | BASELINE; contracts **OPEN (G-21)**                                                                                                           |
| 25  | Ordering, payments, POS, Events and an internal reservation engine excluded from MVP                                         | Doc 01 §7; Doc 03 §2; Doc 04 §2                   | Not built; no architecture beyond "ready"                                                                                                                                                                                                                                            | BASELINE                                                                                                                                      |
| 26  | Security: layered controls, API protection, secrets lifecycle, audit integrity                                               | Doc 01 §16; Doc 04 §21                            | Phase 1 baseline: CORS default-deny, security headers, structured redacted logs, startup config validation, supply-chain policy                                                                                                                                                      | IMPLEMENTED (D-005, D-013 – D-015, D-018 – D-020); rate limiting **OPEN (G-34)**, web CSP **OPEN (G-31)**, threat model **OPEN (G-20)**       |
| 27  | Secrets: lifecycle, rotation, environment separation                                                                         | Doc 01 §16, §17                                   | No secrets exist in Phase 1; configuration validated, errors never echo values, logs redacted                                                                                                                                                                                        | Mechanism **OPEN (G-08, Phase 2 prerequisite)**                                                                                               |
| 28  | Logging and observability; privacy controls apply to logs                                                                    | Doc 01 §11, §14, §17; Doc 03 §19; Doc 04 §18, §21 | JSON-lines logs with redaction and request correlation; no headers, bodies, query strings or IPs                                                                                                                                                                                     | IMPLEMENTED (D-020); metrics/tracing/retention **OPEN (G-32)**                                                                                |
| 29  | Error handling: consistent, safe, no internal leakage                                                                        | Doc 04 §20, §22                                   | Error envelope with generic messages; 5xx details only in redacted logs                                                                                                                                                                                                              | IMPLEMENTED (P-108, D-020)                                                                                                                    |
| 30  | Environments dev/test/staging/production isolated; Docker; CI/CD; IaC progressively                                          | Doc 01 §17                                        | `APP_ENV` explicit and validated; CI on GitHub Actions; Docker and IaC deferred                                                                                                                                                                                                      | APPROVED (P-106, P-107, D-008); cloud **OPEN (G-09)**                                                                                         |
| 31  | Backups, recovery and RPO/RTO tested                                                                                         | Doc 01 §17                                        | —                                                                                                                                                                                                                                                                                    | **OPEN (G-10, Phase 10)**                                                                                                                     |
| 32  | Testing: unit, integration against a real database, e2e, isolation, security, accessibility, performance                     | Doc 01 §20; Doc 04 §25; Doc 05 §9                 | Vitest, Playwright and architecture tests now; real-database isolation tests from Phase 2                                                                                                                                                                                            | APPROVED (P-105); DB tests from Phase 2                                                                                                       |
| 33  | Supply chain: pinned toolchain, frozen lockfile, dependency governance                                                       | Doc 05 §8; Doc 01 §17                             | Node 24 enforced, hash-pinned pnpm, 7-day release age, policy tests                                                                                                                                                                                                                  | IMPLEMENTED (D-005 provisional, D-013 – D-015, D-018); broader policy **OPEN (G-30)**                                                         |
| 34  | Scalability and performance budgets                                                                                          | Doc 01 §15; Doc 03 §17                            | Stateless API processes; budgets defined before release                                                                                                                                                                                                                              | Thresholds **OPEN (G-22)**                                                                                                                    |
| 35  | Phase order                                                                                                                  | Doc 05 §11                                        | Phases 0–10 govern; conceptual mappings only                                                                                                                                                                                                                                         | APPROVED (D-001, D-002)                                                                                                                       |

## 2. Topic notes

Each topic states the binding baseline, the Phase 1 state and the open choices. No open choice
may be implemented on assumption (CLAUDE.md, Doc 05 §2).

**2.1 System and modular monolith.** The baseline is Doc 02 §1–§3. API domain modules live in
`apps/api/src/modules/<name>/` and are public only through `index.ts`. Every other API file must
use module entries. These rules are enforced (`api-module-encapsulation`,
`api-module-entry-only`). The planned domain modules follow Doc 05's phases: tenancy and identity
(2), customer delivery (3), menu (4), content and media (6), QR and offers (7), publishing and
analytics (8), and AI and integrations (9). **Open:** whether operator functions get a separate
deployable. The baseline says no, unless justified (Doc 01 §8).

**2.2 Surfaces and routing.** A single Next.js app serves the customer, owner and operator
surfaces (Doc 02 §4). Customer browsing is anonymous by default (Doc 01 §7). The owner and
operator surfaces require server-verified identity. **Open:** route structure and host mapping
(G-06, G-21), decided in Phases 2, 3 and 6.

**2.3 Tenancy.** The baseline principles are rows 7–9. The **proposed** direction is in the
Phase 1 closure decision package (`docs/audit/phase-1-closure-package.md`, G-06 and G-07). It
must be decided before Phase 2 begins.

**2.4 Identity and authorization.** The baseline is rows 11–12. The provider, recovery, session
and credential model, and how CORS credentials work with it (G-36), are **open** (G-04, G-05)
and decided before Phase 2.

**2.5 API and contracts.** The baseline is rows 13–14. P-108 is the initial convention. The
endpoint inventory, versioning and OpenAPI generation are **open** (G-14) and are defined with
the first Phase 2 endpoints.

**2.6 Data.** The baseline is rows 9, 10 and 19. Every tenant-owned table carries a tenant key
and is covered by isolation tests. Migrations are forward-only, reviewed, and reversible or
backed up (Doc 05 §8). **Open:** the ORM and migration tool (G-03), the RLS model (G-07), and
schemas and deletion semantics (G-15).

**2.7 Caching, jobs, storage.** The baseline is rows 15–17. Redis is introduced only when
justified (Doc 01 §9). **Open:** technologies (G-19), quotas (G-12), and tenant rendering and
cache rules (G-37).

**2.8 Security, logging, errors.** The Phase 1 baseline is implemented; see
`docs/security/logging-and-security-baseline.md`. **Open:** rate limiting (G-34), web CSP
(G-31), observability stack (G-32), threat model (G-20), secrets (G-08), and the CORS credential
model (G-36).

**2.9 Environments, deployment, recovery.** The baseline is row 30. **Open:** cloud, IaC and
sizing (G-09), and backup and recovery (G-10), both Phase 10, with G-08 needed earlier.

**2.10 Testing and enforcement.** The baseline is rows 3 and 32. From Phase 2, isolation tests
must run against a real PostgreSQL instance (Doc 05 §9: "tests must exercise real boundaries").

## 3. Consistency review

- **Against the repository (2026-11-27):** rows marked IMPLEMENTED were checked against the code
  and tests at the Phase 1 completion commit (see `docs/STATUS.md`).
- **Against Documents 01, 03, 04 and 05:** one internal conflict exists in Document 05. Its §11
  phase table gives Phase 1 the exit gate "tenant model and auth boundary verified" and a
  "tenant-aware skeleton"; its §13 work package gives Phase 1 the exit "reproducible build/checks
  and foundation contracts" and assigns tenant context, owner identity and isolation tests to
  Phase 2. v1 of this supplement wrongly said no contradiction was found (audit F-03). The owner
  resolved it in [D-022](../DECISIONS.md#d-022): Phase 1 follows §13, and tenant-model and
  auth-boundary verification is part of the Phase 2 gate. The known sequencing differences
  between documents are governed by D-001/D-002 and tracked as SEQ-1 – SEQ-6
  (`phase-mapping.md`). No other contradiction was found.
- **Against Document 02 §1–§4:** consistent. One recorded deviation: P-109 defers `packages/ui`,
  `packages/test-utils`, `services/` and `infra/`.

## 4. Approval

The owner approved v2 on 2026-11-27 (conditional approval, conditions met: F-03 recorded as
D-022, F-06 labels corrected, G-03 – G-08 still open). This **closes G-01 for Phase 1**. If the
owner later supplies a complete Document 02, that document takes precedence and this supplement
is reconciled against it. Every row marked PROPOSED, INFERRED or OPEN remains a decision to be
made through `DECISIONS.md`, mostly before or during Phase 2.
