# Architecture Documentation

Supporting architecture material. The governing architecture baseline is
[Document 02](../specifications/Architecture_Technical_Specification_02.pdf), which currently appears
incomplete ([GAPS G-01](../GAPS.md)). Nothing here replaces or extends Document 02 unless it is
recorded as an `approved` decision in [`../DECISIONS.md`](../DECISIONS.md).

## Contents

| File                                                                                                       | Purpose                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`phase-mapping.md`](phase-mapping.md)                                                                     | Crosswalk of Doc 05 Phases 0–10 against Doc 01 Phases A–J and Doc 04 Stages A–G, plus tracked sequencing discrepancies                                   |
| [`architecture-technical-specification-supplement.md`](architecture-technical-specification-supplement.md) | Supplement S-02 to Doc 02: traceability of every architecture topic to its source; open choices marked OPEN. **PROPOSED, pending owner approval (G-01)** |

## What Document 02 does establish (v1.0, §1–§4)

These points are taken directly from Document 02. They are baseline statements, not new decisions.

- Modular monolith as the primary application shape. Specialized services only when justified (§1, §3).
- Logical topology: Browser/QR → Next.js (customer + management UI) → typed contracts → NestJS modular API (tenant resolver, auth/policy, domain modules, publishing, orchestration) → PostgreSQL, object storage, cache/queue as justified, observability. Python/Rust services sit behind versioned internal contracts (§2).
- Modules own their rules, data-access boundary and contracts. Dependency direction is enforced in CI. Shared libraries hold only deliberately reusable primitives (§3).
- A _proposed_ monorepo structure: `apps/{web,api}`, `packages/{contracts,ui,config,test-utils}`, `services/{ai,performance}`, `infra/{docker,environments,iac}`, `docs/{architecture,decisions,security,runbooks}`, `scripts/`, `tests/{architecture,security,e2e}`. Document 02 states the names and tooling "can be adjusted through recorded technical decisions" (§4).

## Enforced boundary rules

The architecture rules that Phase 1 enforces in CI are listed in `CLAUDE.md` ("Boundary rules")
and defined in `tests/architecture/dependency-cruiser.config.cjs`. Each has a per-rule regression
fixture under `tests/architecture/fixtures/rules/`. The rule set was corrected and extended by the
Phase 1 audit remediation (D-010 – D-012; findings H-01, M-01 – M-03) and the residual
remediation (D-016 – D-017; findings R-01, R-02, R-04). The rules cover the import forms
dependency-cruiser can detect statically. Known limitations (computed `require()` paths,
absolute-path build-output imports, the DB-client denylist, alias installs) are listed in
`CLAUDE.md` and `docs/audit/phase-1-audit-findings.md`.

## Conventions for future architecture records

Architecture decisions are logged centrally in [`../DECISIONS.md`](../DECISIONS.md). Longer
supporting analysis can go in this directory as `NNNN-short-title.md`, linked from its decision
entry. Document 02 §4 proposes `docs/decisions/`. This repository uses the owner-approved
`docs/DECISIONS.md` instead ([D-003](../DECISIONS.md#d-003)).
