# Phase 3 — Customer Platform Foundation: implementation plan

**Authority:**

- Doc 05 §11 and §13 (page 5): "Public tenant routing, session/context rules, theme tokens,
  adaptive navigation, localization base, content delivery and public error states. No
  ordering/payment or unsupported module functionality. Exit: public tenant entry, locale/context
  and cross-tenant protections verified."
- Owner authorization and decisions O-1 – O-10: [D-040](../DECISIONS.md#d-040), 2026-11-28.

The attached Phase 3 planning specification is an aid only; it does not override the PDFs.

**Labels:** SR = source requirement · PD = proposed design (approved through D-040 where it cites
an O-decision).

## Requirements

| ID    | Requirement                                                                                                              | Source                                                | Planned paths                                         | Verification                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| P3-01 | Public tenant routing; tenant resolved server-side; ambiguous or invalid context rejected safely                         | SR: Doc 05 §13; Doc 03 §3; Doc 01 §3, §10; D-027; O-1 | `apps/web/src/app/[tenant]/…`, `apps/web/src/public/` | Resolver unit tests; hostile-path E2E; identical 404                      |
| P3-02 | No client-supplied tenant identity trusted; no internal ids in URLs or HTML                                              | SR: Doc 03 §3, §18; Doc 01 §3                         | Resolver uses the slug only                           | HTML/uuid scan; Host/X-Forwarded-Host spoofing E2E                        |
| P3-03 | Public error states: invalid/retired/unsupported → tenant-safe fallback with recovery; loading; failure                  | SR: Doc 05 §13; Doc 03 §3, §20                        | `not-found.tsx`, `error.tsx`, `loading.tsx`           | E2E per state; status codes                                               |
| P3-04 | Four-tab navigation (Home, Menu, Offers, Info), platform-governed, accessible active state                               | SR: Doc 03 §5; Doc 01 §4, §15; O-4                    | Customer shell                                        | Keyboard/landmark/`aria-current` E2E; axe                                 |
| P3-05 | Honest, art-directed empty/unavailable states for content not yet available                                              | SR: Doc 03 §6, §20; O-4                               | Empty-state component                                 | Screenshots inspected; axe                                                |
| P3-06 | Governed design tokens, one default preset                                                                               | SR: Doc 05 §13; Doc 03 §16; Doc 01 §15; O-3, O-9      | `apps/web/src/theme/`, `globals.css`                  | Contrast tests; no raw colours outside tokens                             |
| P3-07 | Localization base: `en`/`hu`, `en` default/fallback, cookie + Accept-Language, typed catalogue, formatting, `lang`/`dir` | SR: Doc 03 §15; Doc 01 §15; SEQ-2; O-2, O-10          | `apps/web/src/i18n/`                                  | Unit tests; E2E switch; `lang` asserted                                   |
| P3-08 | Session-only, minimal, anonymous context                                                                                 | SR: Doc 03 §1, §3; Doc 01 §11                         | Locale session cookie only                            | Cookie attribute tests                                                    |
| P3-09 | Content delivery seam: provisioned identity + platform config only                                                       | SR: Doc 05 §13, §7; O-5                               | `apps/web/src/public/`                                | Contract tests (no fields beyond `publicTenantSchema`)                    |
| P3-10 | No shared caching; `private, no-store`                                                                                   | SR: Doc 03 §17; Doc 05 §7; O-6; G-37                  | Headers                                               | Header assertions; two-tenant E2E; suspension visible on the next request |
| P3-11 | Cross-tenant protections verified                                                                                        | SR: Doc 05 §13 exit; Doc 03 §22, §23                  | —                                                     | Two-tenant adversarial E2E                                                |
| P3-12 | Responsive and accessible (320/390/768/1280; keyboard; focus; reduced motion; no colour-only meaning)                    | SR: Doc 03 §16; Doc 01 §15, §20; O-8                  | —                                                     | axe; keyboard E2E; inspected screenshots                                  |
| P3-13 | Public pages expose no owner/operator APIs, auth state or internal metadata                                              | SR: Doc 04 §21; Doc 03 §24                            | Import-boundary test                                  | Test; HTML scan                                                           |
| P3-14 | Strict CSP with nonces                                                                                                   | PD: G-31 (deferred to this phase)                     | `apps/web/src/proxy.ts`                               | Header tests; no violations in E2E                                        |
| P3-15 | `noindex` kept                                                                                                           | O-7, D-009                                            | Metadata                                              | Header/meta assertion                                                     |

## Milestones

Each milestone is gated, and the next starts only after its gate passes:

- **M3.0** — decisions (D-040) and this plan.
- **M3.1** — resolver, routes and error states.
- **M3.2** — tokens.
- **M3.3** — shell, tabs and empty states.
- **M3.4** — localization.
- **M3.5** — CSP, caching and boundary.
- **M3.6** — verification and closure candidate.

**Stop conditions:** a source conflict, an unapproved architecture change, a security or isolation
failure, scope expansion, or a failing gate.

## Milestone log

**M3.1 — resolver, routes and error states.**

- **Order change.** The typed string catalogue and the locale resolution (cookie, then
  `Accept-Language`, then `en`) were brought forward from M3.4. The 404, error and empty states
  need real strings in both locales, and there is to be no silent fallback to hard-coded text.
  M3.4 keeps the locale switcher and the `Intl` formatting helpers.
- **No `loading.tsx` under `[tenant]`.** A loading boundary starts streaming before the tenant is
  resolved, so a missing tenant would be answered with status 200. Tenant pages therefore resolve
  before the first byte is sent.
- **The not-found page is rendered in the browser** (framework behaviour; Next.js 16.4.6).
  - When `notFound()` is thrown on a route, Next.js answers with its error shell: status 404, an
    empty `<html id="__next_error__">`, and the RSC payload.
  - The browser then renders the shared not-found page from that payload.
  - This was reproduced with a minimal route that only calls `notFound()`. The cause is not the
    proxy or the root layout.
  - Tenant safety holds: the status is correct, the server HTML holds no tenant data, and
    unknown, suspended and retired tenants render the same page.
  - The e2e test compares the rendered page and its title in a real browser.
  - Without JavaScript a visitor gets a blank 404 page (G-51).

**M3.2 — tokens and default preset (O-3, O-9).**

- **Where the tokens live.** The values are in `apps/web/src/design/tokens.ts`. The `@theme`
  block in `apps/web/src/app/globals.css` repeats them, and a test keeps the two identical.
- **Default preset "Linen".** Warm off-white surfaces, warm near-black ink and a terracotta
  accent, with a separate blue focus ring.
  - These values are a design proposal for owner review; no specification fixes the palette.
  - There is no tenant theme selection, storage or schema.
- **Tailwind's default palette is removed** (`--color-*: initial`). Only the semantic roles
  (`bg-surface`, `text-ink-muted`, …) exist as utilities.
- **Tests:**
  - every pairing the UI uses meets WCAG 2.2 AA contrast;
  - no source file outside the token files contains a hex value, a colour function, an arbitrary
    colour utility or a palette utility;
  - the patterns themselves are tested against known violations and known valid classes.
- **Font.** A system font stack, so no web font is downloaded and no font host is contacted.
- **Focus and motion.** The focus ring is 3 px, drawn outside the element on the surrounding
  surface. `prefers-reduced-motion` is honoured globally.

## Out of scope

- Phase 4: menu domain.
- Phase 5: Doc 03 screens and journeys.
- Phase 6: owner workspace, theme selection, tenant locale configuration.
- Phase 7: QR.
- Phase 8: publishing and analytics.
- Phase 9: AI and integrations.
- Custom domains (G-21).
- SEO/indexing (O-7).
- Ordering, payments, POS, Events, customer accounts.
