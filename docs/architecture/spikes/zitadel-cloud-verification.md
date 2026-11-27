# ZITADEL Cloud verification (for D-032)

**Date:** 2026-11-27. **Method:** desk research by a delegated agent, reviewed by the main session.
`zitadel.com`, `help.zitadel.com` and `trust.zitadel.com` **could not be reached** from the
execution environment. Technical facts were therefore verified against ZITADEL's official
documentation **source** and code in the `zitadel/zitadel` GitHub repository (docs at commit
`c02ad5d`, 2026-11-25; each docs path maps to `https://zitadel.com/docs/<path>`). Commercial facts
from marketing or help pages were available only as search-engine summaries and are marked
**UNCONFIRMED**. Nothing here was verified with a ZITADEL account or contract.

## Facts relied on for implementation (confirmed in official docs/code)

| Topic           | Fact                                                                                                                                                                | Source                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Issuer          | One instance = one domain = one issuer. Discovery at `{domain}/.well-known/openid-configuration`; JWKS `{domain}/oauth/v2/keys`                                     | docs `concepts/structure/instance`, `apis/openidoauth/endpoints` |
| PKCE            | `code_challenge_method` must be `S256`; mandatory for auth method `none`; optional (verified if sent) for confidential clients                                      | docs endpoints; `zitadel/oidc` `pkg/op/token_code.go`            |
| state / nonce   | `state` recommended; `nonce` echoed in the ID token (required only for implicit)                                                                                    | docs endpoints                                                   |
| **amr**         | **In the ID token only** (not access tokens, introspection or userinfo). Values: `pwd`, `otp`, `user`, `mfa`; `mfa` added when ≥ 2 factors (passkey → `user`+`mfa`) | docs `apis/openidoauth/claims`; code `internal/api/oidc/amr.go`  |
| MFA enforcement | Login policy "Force MFA" (also covers external-IdP logins) vs "Force MFA for local users" (does not); per instance and per organization                             | docs `guides/manage/console/default-settings`                    |
| Access tokens   | Opaque by default; JWT per app ("Auth Token Type" = JWT)                                                                                                            | docs, `proto/zitadel/app.proto`                                  |
| Audience        | Scope `urn:zitadel:iam:org:project:id:{projectId}:aud` adds the project to `aud`                                                                                    | docs `apis/openidoauth/scopes`                                   |
| Signing         | RS256 default; ES256/384/512, RS384/512, EdDSA available; keys identified by `kid`, can rotate **without notice**                                                   | docs `guides/integrate/login/oidc/webkeys`, endpoints            |
| Redirect URIs   | Exact match; globs and http only in "Development mode" (must be off in production); post-logout URIs exact too                                                      | docs `guides/manage/console/applications-overview`               |
| Logout          | RP-initiated `{domain}/oidc/v1/end_session` with `id_token_hint`, `post_logout_redirect_uri`, `state`; back-channel logout supported; front-channel not             | docs `guides/integrate/login/oidc/logout`                        |
| Lifetimes       | Access/ID/refresh token lifetimes are **instance-wide** settings; refresh tokens rotate on use                                                                      | docs default-settings                                            |
| Provisioning    | Self-registration can be disabled; per-IdP auto-linking by e-mail/username exists (account-takeover risk: keep off)                                                 | docs default-settings, identity-providers                        |
| Abuse           | Password/OTP lockout settings; built-in tarpit; Cloud rate limit 50 req/s per IP for APIs incl. OAuth (1-minute ban on excess)                                      | docs default-settings, `legal/policies/rate-limit-policy`        |
| SLA             | 99.50% default / 99.95% extended, service credits only                                                                                                              | docs `legal/service-description/service-level-description`       |
| Export / exit   | `POST /admin/v1/export` incl. password hashes and OTP; excludes passkeys, machine keys, PATs, audit trail; Cloud → self-hosted documented                           | docs `guides/migrate/sources/zitadel`                            |
| Licence         | Core AGPL-3.0-only; protos/docs Apache-2.0; login app and clients MIT                                                                                               | `LICENSING.md`                                                   |

## Findings that need owner attention

- **EU residency is technical, not contractual.** An EU data location can be chosen at instance
  creation and cannot be changed later. The DPA (updated 2025-05-08) states customer data "may be
  processed outside of Switzerland or the EU/EAA, such as in the United States", and transit is
  excluded. The DPA also states two different sub-processor objection periods (5 and 15 days).
- **UNCONFIRMED (search summaries only):** plans and prices (Free 100 DAU; Pro from $100/month
  with 25,000 DAU; Enterprise custom), overage price, whether forced MFA/passkeys are on every
  plan, audit-log retention, SOC 2 Type II and ISO 27001 status, the sub-processor list, the
  status-page URL, and AGPL implications for Cloud customers.
- **Rate limit per IP** (50 req/s) matters if servers share NAT addresses; JWKS must be cached.

## Must be confirmed contractually before production (owner)

1. Written EU-only storage **and processing** commitment (the DPA currently allows otherwise).
2. Current sub-processor list and which objection period applies.
3. Plan, price, DAU overage, SLA tier and support terms.
4. Audit-log/event retention per plan.
5. Signing-key rotation behaviour on Cloud (automatic vs customer-managed; frequency).
6. Rate-limit raise for shared egress IPs; load-test approval (2 weeks' notice).
7. Current SOC 2 report period and ISO 27001 certificate validity.
8. Forced MFA and passkeys available on the chosen plan.
