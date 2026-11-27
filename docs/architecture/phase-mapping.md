# Phase Mapping: Document 05 ↔ Document 01 ↔ Document 04

**Governing rule:** Document 05's Phases 0–10 govern execution ([D-001](../DECISIONS.md#d-001)).
The Doc 01 and Doc 04 columns are conceptual cross-references only and **do not expand** a Doc 05
phase's scope ([D-002](../DECISIONS.md#d-002)).

## 1. Crosswalk

| Doc 05 phase (authoritative) | Doc 01 conceptual phase(s) (§19) | Doc 04 stage(s) (§26) |
|---|---|---|
| 0 — Reconnaissance & specification anchoring | — | — |
| 1 — Foundation | A — repository, tooling, architectural boundaries, CI, environments, security baseline | A (partial) — contract/validation patterns |
| 2 — Tenant & identity | B — tenant identity, routing, database model, isolation enforcement, configuration | A (partial) — auth, tenant resolution, permissions; B (partial) — the "onboarding foundation" in the Doc 05 Phase 2 exit gate |
| 3 — Customer platform foundation | C — customer shell, theme, navigation, responsive foundation; F (partial) — localization base | — |
| 4 — Menu domain | D (partial) — menu data | C (partial) — domain model, variants/modifiers, availability, safety facts |
| 5 — Customer experience | D (partial) — customer menu rendering, search, item details; C (partial) | — |
| 6 — Owner workspace | D (partial) — management CRUD; E (partial) — business information, media; F (partial) — localization management; G (partial) — dashboard core, onboarding, readiness | A (partial) — workspace shell; B — onboarding, profile, hours, readiness; C (partial) — menu management UI; D — composer, media, business info, localization |
| 7 — QR & promotions | E (partial) — QR lifecycle; F (partial) — promotions | E — offers, scheduling, QR destinations and context |
| 8 — Publishing & analytics | E (partial) — publishing and preview; G (partial) — basic analytics | F — publication lifecycle, history/recovery, privacy-aware metrics |
| 9 — Progressive AI & integrations | H — privacy, AI grounding, evaluation; I — optional integrations | G — AI assistance, integration settings, extra capabilities |
| 10 — Release hardening | J — release readiness, pilot, monitoring, recovery, gradual launch | — |

## 2. Naming note

Doc 05 §11 titles Phase 7 "QR & campaign content". Doc 05 §13 titles it "QR & promotions".
This record treats them as the same phase. The owner's approval uses "QR & Promotions".

## 3. Tracked sequencing discrepancies

None of these change the Doc 05 order. Each one is recorded so that it is handled at the right
phase gate rather than resolved silently.

| ID | Topic | Doc 01 | Doc 04 | Doc 05 (governs) | Handling | Status |
|---|---|---|---|---|---|---|
| SEQ-1 | Onboarding | Phase G (late, with dashboard core) | Stage B (immediately after foundations, before menu) | Phase 2 exit "onboarding foundation"; full guided onboarding in Phase 6 | Phase 2 scope for "onboarding foundation" must be defined and approved at Phase 2 planning (tenant/owner provisioning only, no owner UI flow) | open |
| SEQ-2 | Localization | Phase F (after QR/publishing) | Stage D (content) | Phase 3 localization *base*; Phase 6 localization management; translation AI in Phase 9 | Phase 3 delivers locale resolution and fallback infrastructure only | open |
| SEQ-3 | Publishing lifecycle | Phase E (with QR, before owner dashboard) | Stage F | Phase 8 (draft/publish, versioning, recovery); but the Phase 6 exit gate cites "publishing workflows" and Phase 4/6 work needs draft vs. published separation | The minimum draft/published boundary needed before Phase 8 must be defined at Phase 4/6 planning without pre-building Phase 8 | open |
| SEQ-4 | Basic analytics | Phase G (with owner dashboard) | Stage F; but the Overview (§6.1) requires basic analytics | Phase 8 | The Phase 6 Overview analytics area shows an explicit "not yet available" or empty state until Phase 8 | open |
| SEQ-5 | Owner workspace shell | — | Stage A (with foundations) | Phase 6 | No owner workspace UI before Phase 6; Phase 1 may include only a minimal route placeholder | open |
| SEQ-6 | Media | Phase E | Stage D | Phase 6 (media workspace) and Phase 7 (campaign media); Phase 4 (media *references* in the menu domain) | Phase 4 models references only; storage choice depends on [GAPS G-12](../GAPS.md) | open |
