# Phase 1 Logging and Security Baseline

**Status:** implemented and verified in the repository (decisions D-019, D-020) — **awaiting owner
review**. It addresses the Phase 1 portion of gaps G-31, G-32, G-34, G-36 and G-38 and audit
findings M-04, M-05 and L-05. Items marked _deferred_ belong to later phases and stay open in
[`../GAPS.md`](../GAPS.md).

Governing requirements: Doc 01 §11 (data minimization, privacy controls apply to logs), §16
(security layered, no client-only enforcement); Doc 03 §19 ("Do not log transcripts, names,
sensitive dietary/medical details or unnecessary query content"); Doc 04 §18 and §21 ("redact
secrets and sensitive content from logs"); Doc 05 §7.

## 1. Logging (API)

**Format.** One JSON object per line on stdout: `{ "time", "level", "context", ...fields }`.
Levels are `error`, `warn`, `info` and `debug`. NestJS framework logs pass through the same
logger (`apps/api/src/logging/json-logger.ts`).

**Level.** `API_LOG_LEVEL` (optional, default `info`). `debug` is rejected at startup in
`staging` and `production`.

**What is logged**

| Event                                 | Level | Fields                                                                          |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| `request` (every completed request)   | info  | `method`, `path` (no query string), `status`, `durationMs`, `requestId`         |
| `http_error` (4xx)                    | info  | `status`, `code`, `requestId` — no message, no client input                     |
| `exception` (5xx and non-HTTP)        | error | `status`, `code`, `requestId`, the error (`name`, `message`, `stack`), redacted |
| `response_already_sent`               | warn  | `requestId`, `status`                                                           |
| Framework lifecycle (startup, routes) | info  | message, `context`                                                              |

**What is never logged.** Request and response headers (including `Authorization`, `Cookie` and
`Set-Cookie`), request and response bodies, query strings, client IP addresses (including
`X-Forwarded-For`), user agents, and anything a customer typed. These are simply not passed to
the logger. The integration test `apps/api/src/security-baseline.test.ts` sends a bearer token,
a cookie, a JSON body with a password and a name, a query string with a token and an e-mail
address, and an `X-Forwarded-For` header, and asserts that none of them appears in any log line.

**Redaction (defence in depth).** Every entry passes through `redact()`
(`apps/api/src/logging/redact.ts`) before serialization:

- Values of sensitive keys are replaced at any depth. Keys are matched case-insensitively **as
  substrings**, so `authorization`, `cookie`, `passw…`, `pwd`, `passphrase`, `secret`, `token`,
  `api_key`/`apikey`, `session`, `private_key`, `credential` and `signature` all match, including
  variants such as `x-auth-token`, `bearerToken` and `dbPassword`. Over-redaction is accepted.
- Inside strings (messages and stack traces):
  - PEM private keys;
  - `Bearer …` / `Basic …` credentials, in any letter case;
  - JWTs;
  - AWS access-key ids;
  - `scheme://user:password@` URL credentials;
  - `password=` / `token:` / JSON `"token":"…"` pairs;
  - e-mail addresses, replaced with `[REDACTED_EMAIL]` because they are personal data.
- Strings are capped at 4096 characters, and nesting at depth 6.

Redaction is pattern-based and cannot recognise every possible secret or personal datum. Verified not redacted: phone numbers, generic high-entropy strings without a recognisable key, and names. It does not replace the
primary rule: **never pass secrets or personal data to the logger.**

**Request correlation.** Every response carries `x-request-id` (P-108). A client-supplied id is
accepted only if it matches `^[A-Za-z0-9_-]{8,128}$`; otherwise one is generated. Client-supplied
ids are therefore **untrusted correlation hints**: a caller can choose them (audit L-02, open,
LOW). Do not use them for security decisions or audit trails.

**Deferred.** Metrics, tracing, log shipping, retention and alerting (G-32 observability stack,
Phase 10). Audit logging of privileged and content changes (Doc 04 §21) arrives with the features
it audits (Phases 2, 6 and 8).

## 2. HTTP security headers

**API** (`apps/api/src/security/security-headers.ts`, on every response):
`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Cross-Origin-Resource-Policy: same-site`, `Cross-Origin-Opener-Policy: same-origin` and
`Cache-Control: no-store`. `Strict-Transport-Security: max-age=31536000` is sent only when
`APP_ENV` is `staging` or `production`. `X-Powered-By` is disabled.

**Web** (`apps/web/src/security-headers.ts`, applied to every route via `next.config.ts`):
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` and
`Cross-Origin-Opener-Policy: same-origin`. HSTS is sent in `staging` and `production`.

**Deferred.** A web Content-Security-Policy, which needs nonce support in Next.js (G-31,
Phase 3). HSTS `includeSubDomains`/`preload`, which depends on the tenant domain model (G-06,
G-21). Revisiting `Permissions-Policy` if a customer feature ever needs a browser capability
(Phase 3/5).

## 3. CORS (API)

`API_CORS_ALLOWED_ORIGINS` (optional): a comma-separated list of **exact** origins
(`scheme://host[:port]`).

- **Absent or empty (the default): CORS is not enabled.** No `Access-Control-*` headers are sent,
  so browsers block cross-origin reads.
- The startup check rejects wildcards (`*`, `https://*.x`), `null`, paths, trailing slashes,
  embedded credentials and non-http(s) schemes. In `staging` and `production`, only `https://`
  origins are accepted.
- Only listed origins are reflected, matched exactly (no suffix or prefix matching), with
  `Vary: Origin`.
- `credentials: false`. There is no authentication in Phase 1. The credential and cookie model
  is decided with authentication in Phase 2 (G-36, G-04).
- Methods `GET` and `HEAD` only, the only ones the API serves. Allowed headers are
  `Content-Type` and `X-Request-Id`; `X-Request-Id` is exposed. Preflight results are cached for
  600 s.

**Deferred.** Production origin values (no production domain exists yet). Credentials, cookies
and additional methods (Phase 2, with authentication and the first write endpoints).

## 4. Request limits

The default 100 KB JSON body limit applies; an oversize body returns `413 PAYLOAD_TOO_LARGE` in
the error envelope (verified by an earlier audit). **Deferred:** rate limiting, which arrives with
the first endpoints that need it (authentication, Phase 2, G-34 and G-38).

## 5. Deployment requirements (no environment exists yet)

A deployment of the API or web app **must**:

1. Set `APP_ENV` truthfully. `staging` and `production` enable HSTS and the stricter
   configuration checks.
2. Terminate TLS in front of the services. HSTS assumes HTTPS.
3. Set `API_CORS_ALLOWED_ORIGINS` only to the exact https origins that must call the API from a
   browser, or leave it empty.
4. Collect stdout as JSON lines and keep it with access controls and a retention period (to be
   defined with G-11 and G-32).
5. Never inject secrets through variables that are logged. There are no secret-bearing variables
   yet (G-08).
6. Bind the API to a non-public interface unless it is meant to be internet-facing
   (`API_HOST`).

## 6. Verification

- Configuration: `apps/api/src/env.test.ts` (origins, wildcards, https in production, log
  levels); `tests/startup/env-rejection.test.ts` (the built API refuses unsafe settings).
- Behaviour: `apps/api/src/security-baseline.test.ts` (headers, HSTS, CORS allow/deny,
  preflight, request/5xx/4xx logging, no secrets in logs);
  `apps/api/src/logging/*.test.ts` (redaction, logger format and levels);
  `apps/api/src/all-exceptions.filter.test.ts` (L-05 guards); `apps/web/src/security-headers.test.ts`;
  and the e2e headers and CORS-default checks in `tests/e2e/smoke.spec.ts`.
- Mutation checks are recorded in `../STATUS.md` → "Phase 1 completion work".
