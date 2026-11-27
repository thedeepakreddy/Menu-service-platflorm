# Decision Log

The central record of decisions that govern implementation (Doc 05 §5). Decisions are never
silently changed. To revise one, add a new entry that marks the old one `superseded`, and keep
the history.

**Statuses:** `proposed` · `approved` · `implemented` · `verified` · `blocked` · `deferred` · `superseded`

A `proposed` decision is **not** binding. It may guide drafts but must not be treated as locked
until the owner approves it.

## Index

| ID | Title | Status | Date |
|---|---|---|---|
| [D-001](#d-001) | Document 05 is the authoritative execution roadmap | approved | 2026-11-27 |
| [D-002](#d-002) | Phase sequencing authority and tracking of discrepancies | approved | 2026-11-27 |
| [D-003](#d-003) | Specification placement and preservation | approved | 2026-11-27 |

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

**Rationale.** The documents agree on *what* to build but group it differently. Without a rule,
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
