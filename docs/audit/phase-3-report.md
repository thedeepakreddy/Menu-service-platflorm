# Phase 3 — Customer Platform Foundation: closure candidate report

**Status:** closure candidate, awaiting owner review. This is **not** production approval:
pre-production blockers PP-01 – PP-11 stay open, and nothing has been merged, deployed or released.

**Authority:** owner message "Phase 3 — Owner Decisions and Implementation Authorization"
(2026-11-28), recorded as [D-040](../DECISIONS.md#d-040) (decisions O-1 – O-10 and constraints).
Plan and milestone log: [`architecture/phase-3-plan.md`](../architecture/phase-3-plan.md).

## 1. Milestones and gates

Each milestone was implemented, verified locally, committed, pushed, and gated on a green CI run
of its exact commit before the next one started.

| Milestone                                        | Commit    | CI run (exact commit) |
| ------------------------------------------------ | --------- | --------------------- |
| M3.0 decisions and plan                          | `e7874e1` | #29 success           |
| M3.1 resolver, routes, error states              | `809ed19` | #30 success           |
| M3.2 tokens and default preset                   | `07c0546` | #31 success           |
| M3.3 shell, four tabs, art-directed states       | `8072184` | #32 success           |
| M3.4 localization, per-visitor public limits     | `9f57ee2` | #33 success           |
| M3.5 CSP, caching, public/auth boundary          | `6db3712` | #34 success           |
| M3.6 accessibility gate, tablet, layout checks   | `cfad19e` | see §6                |
| M3.6 closure records (this report, ledger, gaps) | see §6    | see §6                |

## 2. Requirements and evidence

| ID    | Requirement (short)                                 | Implemented in                                                                 | Evidence                                                                                                                                                |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-01 | Public tenant routing, server-side resolution       | `apps/web/src/public/`, `apps/web/src/app/[tenant]/`, `apps/web/src/proxy.ts`  | Resolver unit tests (canonical-slug matrix, contract seam); e2e 404 matrix of 11 hostile paths; two tenants in parallel                                 |
| P3-02 | No client-supplied tenant identity; no internal ids | Resolver takes the route segment only; proxy overwrites the raw-segment header | e2e: Host / X-Forwarded-Host / raw-segment spoofing and laundering refused; UUID scan of the HTML                                                       |
| P3-03 | Tenant-safe error states                            | `not-found.tsx`, `error.tsx`, `global-error.tsx`                               | e2e: unknown, suspended and retired render the same page; API outage gives the error state; one visitor's API 429 gives the generic error, never a page |
| P3-04 | Four-tab navigation, accessible current tab         | `apps/web/src/customer/tab-nav.tsx`, `tabs.ts`                                 | e2e: one "Main" landmark, order, `aria-current`, real navigation, keyboard; unit tests for tab paths                                                    |
| P3-05 | Honest, art-directed empty states                   | `customer/empty-state.tsx`, `customer/illustrations.tsx`                       | Screenshots inspected (§4); axe clean                                                                                                                   |
| P3-06 | Governed tokens, one default preset                 | `apps/web/src/design/tokens.ts`, `app/globals.css`                             | Contrast tests for every pairing; raw-colour scan with a self-test; Tailwind palette removed                                                            |
| P3-07 | Localization base (en, hu)                          | `apps/web/src/i18n/`                                                           | Typed catalogue (hu typed as en's shape); resolution tests; `Intl` helper tests; e2e switch with and without JS; `lang` asserted                        |
| P3-08 | Session-only, anonymous context                     | `i18n/switch.ts`                                                               | e2e: the locale cookie is a session cookie, HttpOnly, Secure, SameSite=Lax; customer pages set no cookie                                                |
| P3-09 | Content seam: provisioned identity only             | `public/tenant-resolver.ts` (`publicTenantSchema`)                             | Unit tests refuse extra fields, another tenant's slug and malformed replies                                                                             |
| P3-10 | No shared caching                                   | Dynamic rendering, `cache: 'no-store'`                                         | e2e: every customer page, the 404 and the locale POST are `no-store`, never `public`/`s-maxage`; a suspension shows on the next request                 |
| P3-11 | Cross-tenant protections                            | All of the above                                                               | Two-tenant e2e, spoofing e2e, per-visitor limit isolation e2e                                                                                           |
| P3-12 | Responsive and accessible                           | Shell, tokens, `globals.css`                                                   | axe WCAG 2.2 AA (en, hu; desktop, mobile, tablet) with a self-check; keyboard order and focus; reduced motion; overflow checks; screenshots (§4)        |
| P3-13 | Public pages expose no auth code or state           | —                                                                              | `public-boundary.test.ts` (transitive import walk, self-check, planted violation caught); e2e HTML scan; no cookies                                     |
| P3-14 | Strict nonce CSP                                    | `security-headers.ts`, `proxy.ts`                                              | Unit tests; e2e: policy on every page, nonces fresh and on every script, zero violations while browsing                                                 |
| P3-15 | `noindex` kept                                      | Root and tenant metadata                                                       | e2e: every customer page and the 404 are `noindex`                                                                                                      |

## 3. Decisions honoured (D-040)

- **O-1:** a non-canonical slug gets the same 404 as an unknown tenant, with no redirect or
  normalization.
- **O-2:** en and hu, with en as the default and fallback.
  - Hungarian is typed against English, so a missing key is a compile error.
  - There is no tenant locale storage and no RTL.
- **O-3:** platform tokens and one preset ("Porcelain"). There is no tenant theme selection,
  storage, UI or schema.
- **O-4:** exactly four tabs, with honest empty states.
- **O-5:** only the provisioned public identity reaches pages.
- **O-6:** dynamic rendering, private and no-store.
- **O-7:** noindex everywhere.
- **O-8:** `@axe-core/playwright` added under dependency governance.
- **O-9:** tokens and UI stay in `apps/web`.
- **O-10:** the locale comes from the cookie, then Accept-Language; there is no URL locale
  segment.

## 4. Visual inspection

Screenshots were generated and inspected at 320, 390, 768 and 1280 px, in English and Hungarian.
The set covers:

- the platform root and the tenant home;
- the menu, offers and info tabs;
- a 120-character Hungarian name with a 45-letter word;
- the hostile-markup name, the 404 page and the error page (with the API stopped);
- keyboard focus and the language footer.

Defects found and fixed before closure:

| Defect                                                          | Fix                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Venue names broke mid-word at 320 px                            | Headline size tiers by name length and longest word (`name-size.ts`) |
| Bottom-bar focus ring clipped by the screen edge                | Inset focus ring inside the bar                                      |
| Bare not-found page                                             | Illustrated, neutral not-found state                                 |
| Footer rule inset at 1280 px                                    | Full-bleed footer rule                                               |
| First palette ("Linen", cream and terracotta) a generic default | Replaced by "Porcelain"; values remain an owner-review proposal      |

The final pass showed no overflow at any width. Full-page captures on phones draw the fixed tab
bar at its viewport position; an e2e test confirms that, at the end of a page, nothing is hidden
behind it.

## 5. Findings made during Phase 3

- **Per-visitor limits (fixed).** A public-only staging or production deployment would have
  counted every visitor against one API budget of 120 requests a minute. These are now required
  in staging and production even without login:
  - `WEB_API_BFF_CREDENTIAL`;
  - `WEB_TRUSTED_PROXY_HOPS`;
  - `WEB_PUBLIC_ORIGIN`.

  No limit was raised. The remaining deployment dependency is recorded as G-53.

- **Database encoding (test infrastructure fixed; G-52).** Under SQL_ASCII the display-name check
  rejects accented names. Test provisioning now creates UTF-8 databases explicitly; production
  must too.
- **Next.js 404 rendering (accepted; G-51).**
  - `notFound()` on a dynamic route answers with Next.js's error shell, and the browser renders
    the not-found page. This was reproduced with a minimal route.
  - Status and tenant safety are correct, but without JavaScript a visitor sees a blank 404.
- **The CSP blocks inline `style` attributes.** This was found while writing the axe
  self-check, and is as intended.

## 6. Verification of the closure candidate

_To be completed with the exact closure-candidate commit, its CI run and the clean-room results._

## 7. Independent review

_To be completed with the independent reviewer's findings and their disposition._

## 8. Open items carried forward

- **PP-01 – PP-11** (Phase 2 report §22) remain open; none is resolved or waived.
- **G-50:** native-speaker review of the Hungarian strings (before production).
- **G-51:** the 404 page is rendered in the browser (LOW).
- **G-52:** production and staging databases must be UTF-8.
- **G-53:** the proxy-hop configuration must match the real topology (related to G-43, PP-04).
- **Owner review:** the "Porcelain" palette values are a design proposal.
- **Out of scope:**
  - menu domain (Phase 4), customer screens (Phase 5);
  - owner workspace, theme selection and tenant locale (Phase 6);
  - QR (Phase 7), publishing and analytics (Phase 8), AI (Phase 9);
  - custom domains and indexing.

## 9. Constraints honoured

- The five specification PDFs are unchanged.
- No lint, type, test or architecture rule was weakened or disabled.
- No scope beyond Phase 3 was built.
- Every result reported here comes from a run in this session, with its output read.
