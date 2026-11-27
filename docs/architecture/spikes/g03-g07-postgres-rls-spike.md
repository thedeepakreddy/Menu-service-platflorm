# Spike: data-access layer (G-03) and tenant isolation (G-07) on real PostgreSQL

**Date:** 2026-11-27. **Purpose:** evidence for the Phase 2 entry decisions D-024 (G-03) and D-028
(G-07). **Method:** an isolated throwaway PostgreSQL 16.15 cluster (loopback only, synthetic
data), no mocks. The spike was written by a delegated agent and then **re-run independently by
the main execution session**: both runs produced the same result, **90 PASS, 0 FAIL**. The spike
code lived in a scratch directory outside the repository; its conclusions are re-proved inside
the repository by the Phase 2 database integration tests (`apps/api/src/infrastructure/database/`,
`pnpm test:db`), which supersede it as durable evidence.

## Environment

PostgreSQL 16.15; Node v24.22.3; pg 8.23.1 (pg-pool 3.14.0); kysely 0.29.9; prisma,
@prisma/client and @prisma/adapter-pg 7.10.1; drizzle-orm 0.45.4. All installed with
`--ignore-scripts`, all more than 7 days old. `trust` authentication was used only because the
cluster was loopback-only, throwaway and synthetic.

## Design tested

- `app_owner`: owns schema and tables; migrations only. `app_runtime`: LOGIN, NOSUPERUSER,
  NOBYPASSRLS, NOINHERIT, DML only, no TEMP/CREATE. `app_operator`: separate privileged path.
- Every tenant-owned table: `ENABLE` + `FORCE ROW LEVEL SECURITY`; policy
  `USING/WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`.
- Tenant context per transaction: `select set_config('app.tenant_id', $1, true)`.

## Results (excerpts of the recorded PASS lines)

| Area                 | Result                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Isolation            | Tenant A sees only A; SELECT/UPDATE/DELETE of B affect 0 rows; INSERT or UPDATE into B rejected (`42501`)                   |
| Fail closed          | No context, empty context and a fresh session: 0 rows, INSERT rejected; malformed uuid raises `22P02`                       |
| Pool reset           | `pg.Pool` max=1, same `pg_backend_pid`: no context after COMMIT or ROLLBACK                                                 |
| Concurrency          | 0 cross-tenant rows in 200 transactions over 10 connections (raw pg, Kysely); 100 over 5 (Prisma)                           |
| Runtime privileges   | `app_runtime` cannot disable/unforce RLS, drop/alter/create policies, grant itself BYPASSRLS, `SET ROLE`, TRUNCATE, run DDL |
| Migration separation | DDL only as `app_owner`; Prisma `migrate deploy` as `app_runtime` fails                                                     |
| Background jobs      | A job without context sees nothing; each job transaction must set its own context                                           |
| Kysely               | All isolation, pool-reset and concurrency checks pass inside `db.transaction()`                                             |
| Prisma 7             | Passes inside interactive `$transaction`; policies only as raw SQL in migrations; drift detection ignores policies          |
| Overhead             | Bare `current_setting()` evaluated per row made a filtered query ~4x slower; the `(SELECT …)` InitPlan form restored parity |

## Dangers demonstrated

1. Session-level context (`set_config(..., false)`, plain `SET`, even `SET` inside a committed
   transaction) **leaks** the tenant into the next pooled checkout. Forbidden.
2. `set_config(..., true)` outside an explicit transaction silently does nothing (fails closed,
   but hides bugs). Context must be set only inside the helper's transaction.
3. Without `FORCE`, the table owner and owner-owned views bypass RLS. `FORCE` is mandatory.
4. Superuser and BYPASSRLS ignore every policy, including WITH CHECK, and leave no trace.
5. An in-database audit row disappears if the operator transaction rolls back; a server-log line
   survives. The audit trail of record must be non-transactional.
6. Context can be switched mid-transaction: one tenant per transaction, enforced by the helper.
7. `FORCE` also binds migrations and seeds; data migrations need explicit owner policies.

## Recommendations (adopted with modifications in D-024 and D-028)

- **G-03:** Kysely on `pg.Pool` with plain-SQL, forward-only migrations run as `app_owner`.
  Prisma 7 is workable but hides policies from its drift checks.
- **G-07:** the tested design with `FORCE` everywhere and the InitPlan policy form; context only
  through a `withTenant` helper; session-level `SET` banned; operator access through explicit,
  audited, least-privilege paths rather than a BYPASSRLS role.

## Not tested

PgBouncer transaction pooling, `security_invoker` views, composite-index performance, pgaudit,
drizzle-kit policy generation and NestJS integration (the last is covered by the Phase 2 tests).
