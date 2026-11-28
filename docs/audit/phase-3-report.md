# Phase 3 — Customer Platform Foundation: closure candidate report

**Recommendation: closure candidate**, subject to the exact-commit evidence in §6 and the owner's
acceptance. Two owner decisions are open: OD-1 and OD-2 in [D-041](../DECISIONS.md#d-041).
Neither blocks the Phase 3 exit criteria in Doc 05 §13. Both are pre-production matters.

**This is not production approval.**

- PP-01 – PP-11 stay open.
- Nothing has been merged, deployed, released or provisioned.
- Phase 3 is **not closed** until the owner accepts it.
- Phase 4 has not been started.

**Authority:**

- [D-040](../DECISIONS.md#d-040): owner decisions O-1 – O-10 and constraints.
- The owner's "Phase 3.6 — Hardening, Verification & Closure Candidate" specification and its
  execution prompt.
- Plan and milestone log: [`architecture/phase-3-plan.md`](../architecture/phase-3-plan.md).

## 1. Milestones and gates

Each milestone was implemented, verified locally, committed, pushed, and gated on a green CI run
of its exact commit. This was re-checked at the start of M3.6 against the GitHub Actions run
list.

| Milestone                                      | Commit    | CI run (exact `head_sha`) |
| ---------------------------------------------- | --------- | ------------------------- |
| M3.0 decisions and plan                        | `e7874e1` | #29 success               |
| M3.1 resolver, routes, error states            | `809ed19` | #30 success               |
| M3.2 tokens and default preset                 | `07c0546` | #31 success               |
| M3.3 shell, four tabs, art-directed states     | `8072184` | #32 success               |
| M3.4 localization, per-visitor public limits   | `9f57ee2` | #33 success               |
| M3.5 CSP, caching, public/auth boundary        | `6db3712` | #34 success               |
| M3.6 accessibility gate, tablet, layout checks | `cfad19e` | #35 success               |
| M3.6 noindex and reduced-motion tests, draft   | `f5cad20` | #36 (see §6)              |
| M3.6 review remediation and closure records    | see §6    | see §6                    |

## 2. Sources and reconciliation

- **Specifications.** All five PDFs were read in full during M3.6:
  - Doc 01 (10 pages), Doc 02 (3), Doc 03 (6), Doc 04 (9), Doc 05 (7).
  - Their SHA-256 values match `docs/README.md`.
  - They are unchanged since `b963239`.
- **Repository documents also read:** CLAUDE.md, `docs/README.md`, STATUS, GAPS, DECISIONS
  (D-040), the phase plan and the security baseline.
- **No unresolved source conflict.** Where the specifications and D-040 differ, an approved
  decision governs:
  - Doc 02 proposes `packages/ui`; O-9 keeps UI in `apps/web`.
  - Doc 03 §17 has tenant-aware cache keys; O-6 uses no shared cache.
  - Doc 03 §18 has SEO metadata; O-7 keeps noindex.
- **Doc 03 §20 "Loading".** It was not covered before M3.6. It is now addressed (P3-03 below,
  D-041 §4).

| ID    | Requirement (short)                          | Implemented in                                                            | Evidence                                                                                                                                             |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-01 | Public tenant routing, server-side           | `apps/web/src/public/`, `app/[tenant]/`, `proxy.ts`                       | Resolver unit tests (canonical-slug matrix, contract seam); e2e 404 matrix of 11 hostile paths; parallel two-tenant test                             |
| P3-02 | No client-supplied identity; no internal ids | Route segment only; the proxy overwrites the raw-segment header           | e2e: Host / X-Forwarded-Host / raw-segment spoofing and laundering refused; UUID scan                                                                |
| P3-03 | Tenant-safe error, not-found, loading        | `not-found.tsx`, `error.tsx`, `global-error.tsx`, `pending-indicator.tsx` | e2e: unknown, suspended and retired give the same rendered page **and** byte-identical server responses; API outage → error state; pending indicator |
| P3-04 | Four tabs, accessible current tab            | `customer/tab-nav.tsx`, `tabs.ts`                                         | e2e: one "Main" landmark, order, `aria-current`, navigation, keyboard; unit tests                                                                    |
| P3-05 | Honest, art-directed empty states            | `customer/empty-state.tsx`, `illustrations.tsx`                           | Screenshots (§5); axe clean                                                                                                                          |
| P3-06 | Tokens and one preset                        | `design/tokens.ts`, `globals.css`                                         | Contrast tests for every pairing; raw-colour scan with a self-test; Tailwind palette removed                                                         |
| P3-07 | Localization base (en, hu)                   | `i18n/`                                                                   | Typed catalogue; resolution tests; `Intl` tests; e2e switch with and without JS; `lang` asserted                                                     |
| P3-08 | Session-only, anonymous context              | `i18n/switch.ts`                                                          | e2e: session cookie (HttpOnly, Secure, Lax, no expiry); customer pages set no cookie                                                                 |
| P3-09 | Content seam: provisioned identity only      | `public/tenant-resolver.ts`                                               | Unit tests refuse extra fields, another tenant's slug and malformed replies                                                                          |
| P3-10 | No shared caching                            | Dynamic rendering, `cache: 'no-store'`                                    | e2e: every customer page, the 404 and the locale POST are `no-store`, never `public` or `s-maxage`; a suspension shows on the next request           |
| P3-11 | Cross-tenant protections                     | All of the above                                                          | Two-tenant, spoofing and per-visitor-limit isolation e2e                                                                                             |
| P3-12 | Responsive and accessible                    | Shell, tokens, `globals.css`                                              | axe (§4); keyboard order and focus; reduced motion; overflow and tab-bar overlap checks; screenshots (§5)                                            |
| P3-13 | No auth code or state on public pages        | —                                                                         | `public-boundary.test.ts` (transitive walk, self-check, subpaths); planted violation caught; e2e HTML scan                                           |
| P3-14 | Strict nonce CSP                             | `security-headers.ts`, `proxy.ts`                                         | Unit tests; e2e: policy on every page, fresh nonce on every script, zero violations; an inline style attribute is blocked                            |
| P3-15 | noindex                                      | Metadata and `X-Robots-Tag`                                               | e2e: meta and header on every customer response, including the 404                                                                                   |

**O-1 – O-10:**

- **O-1:** a non-canonical slug gets the same 404, with no redirect or normalization.
- **O-2:** en and hu, en as default and fallback.
  - Hungarian is typed against English.
  - No tenant locale storage and no RTL.
- **O-3:** platform tokens and one preset. No tenant theme selection, storage, UI or schema.
- **O-4:** exactly four tabs, with honest empty states.
- **O-5:** only the provisioned public identity reaches pages.
- **O-6:** dynamic rendering, private and no-store.
- **O-7:** noindex everywhere.
- **O-8:** `@axe-core/playwright` added under governance (D-041 §3).
- **O-9:** tokens and UI stay in `apps/web`.
- **O-10:** the locale comes from the cookie, then Accept-Language; no URL locale segment.

## 3. Tenant isolation and security

| Check                                                          | Evidence                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Two tenants in parallel, no mixing                             | e2e: 5 rounds, two pages each                                                           |
| Unknown, suspended, retired, reserved, non-canonical → one 404 | e2e matrix (11 paths); rendered page and raw response compared                          |
| Host / X-Forwarded-Host / raw-segment spoofing                 | e2e: tenant unchanged; laundering refused                                               |
| Lifecycle change takes effect on the next request              | e2e: suspend, then 404, then reactivate, then 200 (real PostgreSQL)                     |
| Hostile display name                                           | e2e: rendered as text, no script execution                                              |
| Per-visitor limit isolation                                    | e2e: 125 requests by one visitor; another is still served                               |
| No internal identifiers                                        | e2e: no UUIDs in the HTML                                                               |
| CSP enforced, nonce fresh and on every script                  | e2e `security-headers.spec.ts`; unit tests                                              |
| Login and logout still work under the CSP                      | e2e `login.spec.ts` (`form-action` covers the end-session redirect)                     |
| No caching                                                     | e2e `no-store` assertions; every route dynamic (build route table)                      |
| Public/auth separation                                         | Unit boundary walk with self-check; e2e: no cookie and no login state on customer pages |

## 4. Accessibility and keyboard

- **axe** (`@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`):
  - 8 page types (root, tenant home, menu, offers, info, long name, hostile name, not-found);
  - in English and Hungarian;
  - on desktop, mobile (Pixel 7) and tablet (iPad gen 7 viewport, Chromium);
  - **zero violations**.
- **axe self-check.** Planted violations (`image-alt`, `link-name`, `button-name`) are reported,
  so the gate is not vacuous.
- **Keyboard order** on the home page: skip link, venue, Home, Menu, Offers, Info, the three
  section links, English, Magyar.
  - Every stop shows an outline of at least 2 px; the ring is 3 px.
  - The skip link moves focus past the navigation.
  - The tabs and the empty-state action work with Enter.
- **Other checks:**
  - Reduced motion removes transitions.
  - The current tab is marked by shape and weight, not colour alone.
  - `lang` follows the locale, and the language buttons carry their own `lang`.
- **Limitation.** Automated scans and scripted keyboard checks are not a full accessibility
  audit. No screen-reader session or manual audit with assistive technology has been performed.
  This is recorded as a limitation, not a pass.

## 5. Responsive and visual QA

- **Captured:** 48 screenshots of the candidate build at **320, 390, 768 and 1280 px**, in
  English and Hungarian. They cover:
  - the root, the tenant home and the three tabs;
  - a long Hungarian name;
  - the not-found and error pages.
- **Inspected:** every image, for overflow, clipping, typography, navigation, tap targets,
  empty and error states, and localized layout.
- **Stored:** as contact sheets in [`audit/phase-3-screenshots/`](phase-3-screenshots/).

| Sheet            | SHA-256                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `sheet-320.png`  | `0021d0a78b8f4e6a716997d6ef7b724f28e4b7959fa3a8531552b6b3e863481c` |
| `sheet-390.png`  | `e7f762163ed857b50ee1e6af76ca32f7e121f0fa990562e15acd7f426978d4dd` |
| `sheet-768.png`  | `d26f4d230fc0c8ec9b2f534a49d5416723947ec5803a23d7a289edd933258d47` |
| `sheet-1280.png` | `050bb5ded508f57aa77de4ed3d303ab5c956ed4d54cff0ff8df97ddc648634e0` |

Defects found earlier in Phase 3 and fixed:

| Defect                                           | Fix                                      |
| ------------------------------------------------ | ---------------------------------------- |
| Venue names broke mid-word at 320 px             | Headline size tiers (`name-size.ts`)     |
| Bottom-bar focus ring clipped by the screen edge | Inset focus ring in the bar              |
| Bare not-found page                              | Neutral illustrated not-found state      |
| Footer rule inset at 1280 px                     | Full-bleed rule                          |
| Generic first palette ("Linen")                  | "Porcelain" (still a proposal, D-041 §5) |

The final inspection found **no defects**.

- **Full-page phone captures.** They draw the fixed tab bar at its viewport position. An e2e
  test proves that nothing is hidden behind it at the end of a page.
- **Not visible in still screenshots.** The pending indicator shows only during a navigation;
  an e2e test covers it.

## 6. Verification of the closure candidate

_Recorded by the documentation-only commit that follows the candidate commit: the exact SHA,
its CI run, the clean-room commands and results, and the counts._

## 7. Separate-context review

**What it was.** A separate reviewer context: an AI subagent of the same model family, given
the governing documents and the source, with no access to this session's reasoning.

- It is **not** a human or third-party review; PP-10 (an external security review) still
  applies.
- It reviewed `beff724..cfad19e` read-only and ran no test suites.
- **Verdict: PASS WITH CONDITIONS**, with no CRITICAL or HIGH findings.

| #   | Severity | Finding                                                                        | Disposition                                                                                                                        |
| --- | -------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MEDIUM   | Staging/production accepted http origins without login                         | **Fixed:** https always required; tests added (D-041 §1)                                                                           |
| 2   | MEDIUM   | `WEB_TRUSTED_PROXY_HOPS=0` accepted, so all visitors share one budget          | **Partly fixed:** long chains can no longer select the shared bucket; wording corrected; **owner decision OD-1** (G-53)            |
| 3   | MEDIUM   | Closure documents incomplete                                                   | **Fixed:** M3.6 log, STATUS ledger and section, D-041, GAPS, this report                                                           |
| 4   | LOW      | `safeReturnPath` could return `//host`                                         | **Fixed** and tested                                                                                                               |
| 5   | LOW      | Locale POST read an unbounded body without `Content-Length`                    | **Fixed:** 411 without a length, 413 over 1 KB; tested                                                                             |
| 6   | LOW      | Boundary test missed package subpaths and prefix-named routes                  | **Fixed** and tested; a dependency-cruiser rule is recorded as G-55                                                                |
| 7   | LOW      | No dependency review for axe, and `pg` in tests                                | **Fixed:** D-041 §3                                                                                                                |
| 8   | LOW      | A rate-limited visitor gets 500                                                | **Recorded:** G-54, **owner decision OD-2**                                                                                        |
| 9   | LOW      | 404 indistinguishability compared only the rendered page                       | **Fixed:** e2e compares raw server responses (status, headers, normalized body)                                                    |
| 10  | INFO     | noindex absent from the JS-less 404 shell                                      | **Fixed:** `X-Robots-Tag` on every response; e2e                                                                                   |
| 11  | INFO     | Dev CSP relaxation depends on `NODE_ENV` only                                  | **Fixed:** also requires a non-staging, non-production `APP_ENV`                                                                   |
| 12  | INFO     | If the proxy ever skipped a request, a client raw-segment header would be used | **Accepted:** the proxy matcher covers every path. The worst case is a non-canonical spelling, and the API's slug must still match |
| 13  | INFO     | Screenshot inspection not evidenced in the repository                          | **Fixed:** contact sheets committed with hashes (§5)                                                                               |

The remediation diff is re-checked by the same reviewer context before the candidate is
submitted (§6).

## 8. Open items, risks and blockers

- **PP-01 – PP-11** (Phase 2 report §22) stay open; none is resolved or waived.
- **Owner decisions:**
  - **OD-1:** `WEB_TRUSTED_PROXY_HOPS=0` (G-53).
  - **OD-2:** 429 shown as 500 (G-54).
- **Owner review:** the "Porcelain" preset values (D-041 §5).
- **Gaps:**
  - **G-50:** native-speaker review of the Hungarian strings, before production.
  - **G-51:** the 404 page is rendered in the browser. Mitigated: noindex is now a header.
  - **G-52:** production and staging databases must be UTF-8.
  - **G-55:** the boundary rule could move to dependency-cruiser.
- **Limitations:** no manual assistive-technology audit (§4); the review is not
  human-independent (§7).
- **Out of scope:**
  - menu domain (Phase 4), customer screens (Phase 5);
  - owner workspace, theme selection and tenant locale (Phase 6);
  - QR (Phase 7), publishing and analytics (Phase 8), AI (Phase 9);
  - custom domains and indexing.

## 9. Governance

- The five specification PDFs are unchanged.
- No lint, type, test or architecture rule was weakened or disabled. There is no `.skip`,
  `.only`, `eslint-disable` or `ts-ignore` in the Phase 3 diff.
- No scope beyond Phase 3.
- No merge, deployment, release or production provisioning.
- Every result reported here comes from a run in this session, with its output read.
- **Phase 3 stops here for owner acceptance.**
