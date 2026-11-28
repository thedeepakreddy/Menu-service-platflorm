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

| ID    | Requirement                                                                                                              | Source                                                | Planned paths                                                                                                       | Verification                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P3-01 | Public tenant routing; tenant resolved server-side; ambiguous or invalid context rejected safely                         | SR: Doc 05 §13; Doc 03 §3; Doc 01 §3, §10; D-027; O-1 | `apps/web/src/app/[tenant]/…`, `apps/web/src/public/`                                                               | Resolver unit tests; hostile-path E2E; identical 404                      |
| P3-02 | No client-supplied tenant identity trusted; no internal ids in URLs or HTML                                              | SR: Doc 03 §3, §18; Doc 01 §3                         | Resolver uses the slug only                                                                                         | HTML/uuid scan; Host/X-Forwarded-Host spoofing E2E                        |
| P3-03 | Public error states: invalid/retired/unsupported → tenant-safe fallback with recovery; loading; failure                  | SR: Doc 05 §13; Doc 03 §3, §20                        | `not-found.tsx`, `error.tsx`; loading: no streamed `loading.tsx` (M3.1), navigation pending indicator (M3.6, D-041) | E2E per state; status codes                                               |
| P3-04 | Four-tab navigation (Home, Menu, Offers, Info), platform-governed, accessible active state                               | SR: Doc 03 §5; Doc 01 §4, §15; O-4                    | Customer shell                                                                                                      | Keyboard/landmark/`aria-current` E2E; axe                                 |
| P3-05 | Honest, art-directed empty/unavailable states for content not yet available                                              | SR: Doc 03 §6, §20; O-4                               | Empty-state component                                                                                               | Screenshots inspected; axe                                                |
| P3-06 | Governed design tokens, one default preset                                                                               | SR: Doc 05 §13; Doc 03 §16; Doc 01 §15; O-3, O-9      | `apps/web/src/design/tokens.ts`, `globals.css` (planned as `theme/`; renamed in M3.2)                               | Contrast tests; no raw colours outside tokens                             |
| P3-07 | Localization base: `en`/`hu`, `en` default/fallback, cookie + Accept-Language, typed catalogue, formatting, `lang`/`dir` | SR: Doc 03 §15; Doc 01 §15; SEQ-2; O-2, O-10          | `apps/web/src/i18n/`                                                                                                | Unit tests; E2E switch; `lang` asserted                                   |
| P3-08 | Session-only, minimal, anonymous context                                                                                 | SR: Doc 03 §1, §3; Doc 01 §11                         | Locale session cookie only                                                                                          | Cookie attribute tests                                                    |
| P3-09 | Content delivery seam: provisioned identity + platform config only                                                       | SR: Doc 05 §13, §7; O-5                               | `apps/web/src/public/`                                                                                              | Contract tests (no fields beyond `publicTenantSchema`)                    |
| P3-10 | No shared caching; `private, no-store`                                                                                   | SR: Doc 03 §17; Doc 05 §7; O-6; G-37                  | Headers                                                                                                             | Header assertions; two-tenant E2E; suspension visible on the next request |
| P3-11 | Cross-tenant protections verified                                                                                        | SR: Doc 05 §13 exit; Doc 03 §22, §23                  | —                                                                                                                   | Two-tenant adversarial E2E                                                |
| P3-12 | Responsive and accessible (320/390/768/1280; keyboard; focus; reduced motion; no colour-only meaning)                    | SR: Doc 03 §16; Doc 01 §15, §20; O-8                  | —                                                                                                                   | axe; keyboard E2E; inspected screenshots                                  |
| P3-13 | Public pages expose no owner/operator APIs, auth state or internal metadata                                              | SR: Doc 04 §21; Doc 03 §24                            | Import-boundary test                                                                                                | Test; HTML scan                                                           |
| P3-14 | Strict CSP with nonces                                                                                                   | PD: G-31 (deferred to this phase)                     | `apps/web/src/proxy.ts`                                                                                             | Header tests; no violations in E2E                                        |
| P3-15 | `noindex` kept                                                                                                           | O-7, D-009                                            | Metadata                                                                                                            | Header/meta assertion                                                     |

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

**M3.3 — customer shell, four tabs and empty states (O-4).**

- **Palette revised to "Porcelain".** During the M3.3 design review, the M3.2 "Linen" preset
  (cream surface with a terracotta accent) was judged a generic default. It was replaced by cool
  porcelain surfaces, green-black ink and a bottle-green accent. The values are still a proposal
  for owner review. The contrast tests pass unchanged.
- **One navigation landmark** (`nav`, "Main"):
  - **Phones:** a fixed bottom tab bar that respects the safe area. The current tab shows a pill
    and heavier type.
  - **768 px and up:** the same nav sits in the header, with an underline on the current tab.
  - **Marking:** `aria-current="page"` on the current tab; the current tab is never marked by
    colour alone. Focus rings in the bar are inset, so the screen edge cannot clip them.
  - **No prefetching:** every tab page is dynamic and calls the API, so a prefetch would only
    spend the visitor's rate limit.
- **Home.** The venue name is the one bold element. Its size steps down with name length and
  with the longest word, because names can be 200 characters and Hungarian words are long. After
  the name: an honest intro, then a list of the three sections.
- **Art-directed states.** Menu, Offers, Info, not-found and error each have a line illustration
  in token colours, a direct explanation and a way forward. The not-found art (a table card with
  a QR code) is deliberately neutral, so it never hints at tenant lifecycle.
- **Other details:**
  - Skip link, unique page titles (`Menu – <venue>`), `viewport-fit=cover`.
  - The unused `home.eyebrow` and `loading` strings were removed.
- **Screenshots inspected** at 320, 390, 768 and 1280 px in en and hu, including a 120-character
  Hungarian name, keyboard focus, the not-found page and the error page. Defects found and fixed:
  - mid-word breaks in long names (fixed by the size tiers);
  - bottom-bar focus ring clipped by the screen edge (fixed with an inset ring);
  - bare not-found page (now illustrated).
- **Test provisioning creates UTF-8 databases explicitly.** A SQL_ASCII cluster rejected accented
  names through `tenants_display_name_text`, because each byte of a multi-byte character counts as
  a control character there (G-52).

**M3.4 — localization (O-2, O-10; P3-07, P3-08).**

- **Language choice.** A plain form POST to `/platform/locale`. The path sits under the reserved
  `platform` segment, so it can never shadow a tenant slug. The control works without JavaScript.
  - **CSRF:** POST only, and only with `Origin` equal to `WEB_PUBLIC_ORIGIN`.
  - **Fail closed:** without that origin the switch is refused and the control is not rendered.
  - **Redirect:** the return target is reduced to a same-origin path; anything else goes to `/`.
  - **Input:** the body must be form-encoded and at most 1 KB.
  - **Cookie:** `__Host-platform-locale` is a session cookie (no Max-Age), HttpOnly, Secure and
    SameSite=Lax, and holds only the locale code. It is the only customer-side state (P3-08).
  - **Accessibility:** each language is named in its own language and marked with `lang`; the
    current one has `aria-pressed`.
- **Formatting.** `Intl` helpers for numbers, prices (explicit ISO 4217 currency), dates, times
  and lists. Dates and times have no default time zone: a venue's zone is not provisioned, and
  the server's zone would show wrong hours.
- **Configuration tightened (found by the e2e suite).** In staging and production,
  `WEB_PUBLIC_ORIGIN`, `WEB_API_BFF_CREDENTIAL` and `WEB_TRUSTED_PROXY_HOPS` are now required even
  without login. Previously a public-only deployment would have sent every visitor's lookups
  through ONE per-client API budget (120 a minute, D-031), so a single visitor could have denied
  the public pages to everyone. No limit was raised: the D-037 forwarding is now mandatory
  configuration (G-53).
- **e2e topology.** The e2e web server now runs as if behind one trusted proxy
  (`WEB_TRUSTED_PROXY_HOPS=1`), and each test sends its own `X-Forwarded-For` (`fixtures.ts`), so
  each test is a separate visitor. A new test shows that one visitor exhausting the budget gets
  the generic error state while another visitor is still served.
- **Screenshots inspected.** Footer and switcher at 320 and 1280 px, and the Hungarian 404 page
  after a switch. One defect, the footer rule being inset at 1280 px, was found and fixed.

**M3.5 — CSP, caching and the public/auth boundary (P3-10, P3-13, P3-14; G-31).**

- **Strict CSP** (`contentSecurityPolicy()` in `security-headers.ts`). It is built per request in
  `proxy.ts` with a fresh 128-bit nonce. Next.js reads the nonce from the request's CSP header and
  puts it on its own scripts. Every route is dynamic (checked in the build's route table), so no
  prerendered page carries a stale nonce.
  - `script-src` is `'self'`, the nonce and `'strict-dynamic'`: no `unsafe-inline`, and
    `unsafe-eval` only under `next dev`.
  - `object-src`, `base-uri`, `frame-ancestors` and `frame-src` are `'none'`.
  - `form-action` is `'self'` plus the configured OIDC issuer origins. Logout is a same-origin
    POST that redirects to the provider's end-session endpoint, and the login e2e test proves it
    still works.
  - `upgrade-insecure-requests` applies in staging and production only.
- **e2e:**
  - every page carries the policy, and every server-sent `<script>` has exactly that request's
    nonce, which is fresh per request;
  - real browsing (client navigation and the 404) raises zero `securitypolicyviolation` events,
    and the app still hydrates.
- **Caching.** Every customer page, the not-found page and the locale POST are `no-store`, and
  none is `public`, `s-maxage` or `stale-while-revalidate`. Customer pages set no cookie.
- **Boundary test** (`public-boundary.test.ts`). It walks every import, static and dynamic, from
  every non-`/auth` route and from the proxy, and requires that nothing under `src/auth/` and
  neither `openid-client` nor `jose` is reachable.
  - A self-check confirms the walker does find them from the login routes.
  - A deliberately planted import was caught by the test, then removed.
- **Decision.** This was done as a test rather than a new dependency-cruiser rule. Adding a rule
  needs an owner-reviewed fixture set (CLAUDE.md), so it remains a possible future hardening.

**M3.6 — verification, hardening and closure candidate.**

- **Sources.** All five specification PDFs were read in full, and their SHA-256 values match
  `docs/README.md`. They are unchanged since `b963239`. P3-01 – P3-15 were reconciled against
  Doc 05 §13, Doc 03 and D-040 O-1 – O-10 (report §2, §3).
- **Accessibility.**
  - `@axe-core/playwright`: WCAG 2.2 A/AA on 8 page types in en and hu, on desktop, mobile and
    tablet, with zero violations. A self-check proves violations are detected.
  - Keyboard order and focus indicators; reduced motion; no content hidden behind the phones'
    tab bar.
- **Visual QA.** 48 screenshots of the candidate build at 320, 390, 768 and 1280 px, in en and
  hu, including the error page, were inspected with no defects. Contact sheets with SHA-256 are
  in [`audit/phase-3-screenshots/`](../audit/phase-3-screenshots/).
- **Separate-context review** (an AI subagent, not a human). PASS WITH CONDITIONS, with no
  critical or high findings. Every finding has a disposition (report §7). Fixed:
  - https enforced without login;
  - long `X-Forwarded-For` chains no longer select the shared bucket;
  - protocol-relative return paths refused;
  - locale POST requires `Content-Length`;
  - boundary test matches package subpaths;
  - `X-Robots-Tag` on every response;
  - dev CSP relaxation tied to `APP_ENV`;
  - raw 404 responses compared server-side;
  - dependency review recorded (D-041).

  Open owner decisions: OD-1 (`WEB_TRUSTED_PROXY_HOPS=0`, G-53) and OD-2 (429 shown as 500,
  G-54).

- **Loading state (Doc 03 §20).** Added a navigation pending indicator (`useLinkStatus`). Tenant
  pages still resolve fully before their first byte (D-041).
- **Correction to the M3.4 entry above.** It said a shared API budget for public-only deployments
  was prevented by making the forwarding configuration mandatory. That holds only when
  `WEB_TRUSTED_PROXY_HOPS` is at least 1. With `0`, which is still accepted, all visitors share
  one budget (OD-1, G-53).
- **New tests.** `noindex` (meta and header) and byte-identical lifecycle responses.
  - e2e: 210 runs across three projects (90 at the end of M3.5, two projects).
  - Web unit tests: 227 (211 at the end of M3.5).

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
