# Documentation Index

This directory is the durable documentation location for the Hospitality Digital Experience SaaS
platform (repository: `Menu-service-platflorm`). It exists so that any engineer or implementation
agent can continue work from repository state alone, without relying on chat history
(Document 05 §5).

## 1. Specification package (canonical, read-only)

The five specification documents are stored unmodified in [`specifications/`](specifications/).
They are the governing baseline. **Do not edit, replace or reinterpret them.** Clarifications,
reconciliations and amendments are recorded in [`DECISIONS.md`](DECISIONS.md) and
[`GAPS.md`](GAPS.md), never by changing the PDFs.

| Order | Document                                              | File                                                                                                                                          | Version | Pages | Purpose                                                                                                                       |
| ----- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 01    | Master Product & Engineering Blueprint                | [`Master_Product_Engineering_Blueprint_01.pdf`](specifications/Master_Product_Engineering_Blueprint_01.pdf)                                   | 1.0     | 10    | Vision, scope, principles, boundaries, invariants, conceptual roadmap                                                         |
| 02    | Architecture & Technical Specification                | [`Architecture_Technical_Specification_02.pdf`](specifications/Architecture_Technical_Specification_02.pdf)                                   | 1.0     | 3     | Architecture baseline, topology, modular monolith, proposed repo structure — **appears incomplete, see [GAPS G-01](GAPS.md)** |
| 03    | Customer Experience Implementation Specification      | [`Customer_Experience_Implementation_Specification_03.pdf`](specifications/Customer_Experience_Implementation_Specification_03.pdf)           | 1.0     | 6     | Public customer screens, journeys, states, acceptance                                                                         |
| 04    | Business Owner Dashboard Implementation Specification | [`Business_Owner_Dashboard_Implementation_Specification_04.pdf`](specifications/Business_Owner_Dashboard_Implementation_Specification_04.pdf) | 1.0     | 9     | Owner workspace workflows, publishing, acceptance                                                                             |
| 05    | Claude Implementation Execution Plan                  | [`Claude_Implementation_Execution_Plan_05.pdf`](specifications/Claude_Implementation_Execution_Plan_05.pdf)                                   | 1.0     | 7     | Execution protocol, Phase 0–10 roadmap, gates, reporting                                                                      |

### Integrity (SHA-256)

Recorded when the files were added on 2026-11-27. They match the files the owner supplied.

```
06278862c89f31a1a562c117cb2f7dd1bbf2825d30e5fdbcb5076289b5532bf1  Master_Product_Engineering_Blueprint_01.pdf
49ae4445531a7449cdae234b275fa040c89cf0120a367076e60c8460f972a604  Architecture_Technical_Specification_02.pdf
3b729cad999157b41e3374a571d89c5a5b486022fa180c03078651782241a001  Customer_Experience_Implementation_Specification_03.pdf
f5e0de4f0c06774a9178cb200fc8444c1f5f5bb98e3144e6bd2daca1782b3bd5  Business_Owner_Dashboard_Implementation_Specification_04.pdf
6951191ce26bebf956b2c8ddc4384dd4f0951d0e9ac146e926015755eb0df914  Claude_Implementation_Execution_Plan_05.pdf
```

Verify with: `cd docs/specifications && sha256sum *.pdf`

## 2. Precedence and authority

1. **Scope, product decisions and invariants:** Document 01, refined by Documents 02–04 within
   their areas. Detailed documents may refine mechanics but must not silently change product
   decisions (Doc 01 §1).
2. **Execution order and phase gates:** Document 05 is the sole authoritative roadmap
   (Phase 0–10). Document 01's Phases A–J and Document 04's Stages A–G are conceptual mappings
   only ([D-001](DECISIONS.md#d-001), [D-002](DECISIONS.md#d-002)). The crosswalk is in
   [`architecture/phase-mapping.md`](architecture/phase-mapping.md).
3. **Approved decisions** in [`DECISIONS.md`](DECISIONS.md) take precedence over the baseline
   documents only when they are explicitly marked `approved` with approval evidence.
4. **Conflicts** between documents are not silently reconciled. They are recorded in
   [`GAPS.md`](GAPS.md) or [`DECISIONS.md`](DECISIONS.md), and the affected work stops until the
   owner resolves them (Doc 05 §2).
5. **Implementation status** is established only by repository reality and verified tests, never by
   planning documents (Doc 05 §1). See [`STATUS.md`](STATUS.md).

## 3. Working documents

| File                             | Purpose                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| [`DECISIONS.md`](DECISIONS.md)   | Central decision log (proposed / approved / superseded …)                           |
| [`STATUS.md`](STATUS.md)         | Phase status ledger and implementation ledger                                       |
| [`GAPS.md`](GAPS.md)             | Unresolved specification gaps, conflicts and open questions                         |
| [`architecture/`](architecture/) | Architecture notes, phase mapping and future architecture decision records          |
| [`audit/`](audit/)               | Phase 1 review packet and the audit findings register (`phase-1-audit-findings.md`) |

## 4. Status vocabulary

Per Doc 05 §5, every decision, requirement and phase uses one of these statuses:
`proposed`, `approved`, `implemented`, `verified`, `blocked`, `deferred`, `superseded`.
Phases also use `not started`, `in progress` and `awaiting gate acceptance`.
