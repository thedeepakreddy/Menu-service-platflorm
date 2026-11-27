# Phase Status Ledger

Implementation status is established only by inspected repository state and executed tests
(Doc 05 §1, §3). Planning documents are not evidence. Phase order is governed by Document 05
([D-001](DECISIONS.md#d-001)).

_Last updated: 2026-11-27_

## Phase ledger

| Phase | Title | Status | Gate evidence |
|---|---|---|---|
| 0 | Reconnaissance & specification anchoring | awaiting gate acceptance | Baseline below; specification index, decision log, gaps list committed on `claude/new-session-7xxuoq` |
| 1 | Foundation | approved for planning — implementation not started | Plan to be presented and confirmed before file changes |
| 2 | Tenant & identity | not started | Blocked on [G-01, G-03–G-07](GAPS.md) decisions |
| 3 | Customer platform foundation | not started | — |
| 4 | Menu domain | not started | — |
| 5 | Customer experience | not started | — |
| 6 | Owner workspace | not started | — |
| 7 | QR & promotions | not started | — |
| 8 | Publishing & analytics | not started | — |
| 9 | Progressive AI & integrations | not started | — |
| 10 | Release hardening | not started | — |

## Phase 0 baseline (inspected 2026-11-27)

| Item | Observed state |
|---|---|
| Repository | `Menu-service-platflorm` |
| Branch | `claude/new-session-7xxuoq`, created from `main` at `075182c Initial commit` |
| Working tree before Phase 0 docs | Clean |
| Tracked files before Phase 0 docs | `README.md` only (contains only the repository name) |
| Application code / entry points | None |
| Package manifests, lockfiles, dependencies | None |
| Tests, test tooling | None |
| CI configuration | None |
| Infrastructure, Docker, IaC | None |
| Database, migrations, schema | None |
| Authentication / authorization | None |
| Agent instruction files (`CLAUDE.md`, `AGENTS.md`) | None |
| Build/test baseline | Not applicable — nothing to build or test |

**Conclusion:** This is a greenfield repository. No requirement in Documents 01–05 is implemented.

## Implementation ledger

Requirements are mapped to code paths, tests and evidence as they are implemented. There are no
entries yet.

| Requirement / ref | Phase | Code paths | Tests | Evidence | Status |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
