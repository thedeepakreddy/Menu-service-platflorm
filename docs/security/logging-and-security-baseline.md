# Phase 1 Logging and Security Baseline

**Status:** implemented and verified (decisions D-019, D-020). D-019 and D-020 were approved by
the owner on 2026-11-27 after the independent-audit remediation of F-01, F-04, F-05 and F-07
(see [`../DECISIONS.md`](../DECISIONS.md)). It addresses the Phase 1 portion of gaps G-31, G-32,
G-34, G-36 and G-38 and audit findings M-04, M-05 and L-05. Items marked _deferred_ belong to later phases and stay open in
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

| Event                                 | Level | Fields                                                                                       |
| ------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `request` (every completed request)   | info  | `method`, `path` (no query string, capped at 512 chars), `status`, `durationMs`, `requestId` |
| `http_error` (4xx)                    | info  | `status`, `code`, `requestId` — no message, no client input                                  |
| `exception` (5xx and non-HTTP)        | error | `status`, `code`, `requestId`, the error (`name`, `message`, `stack`), redacted              |
| `response_already_sent`               | warn  | `requestId`, `status`                                                                        |
| Framework lifecycle (startup, routes) | info  | message, `context`                                                                           |

**What is never logged.** Request and response headers (including `Authorization`, `Cookie` and
`Set-Cookie`), request and response bodies, query strings, client IP addresses (including
`X-Forwarded-For`), user agents, and anything a customer typed. These are simply not passed to
the logger. The integration test `apps/api/src/security-baseline.test.ts` sends a bearer token,
a cookie, a JSON body with a password and a name, a query string with a token and an e-mail
address, and an `X-Forwarded-For` header, and asserts that none of them appears in any log line.

**Logger metadata.** `time`, `level`, `context` and `fatal` belong to the logger. A caller's
object cannot overwrite them; a colliding key is kept as `field.<key>` (audit F-07). BigInt
values are logged as decimal strings and dates as ISO strings, and serialization cannot throw.

**Redaction (defence in depth).** Every entry passes through `redact()`
(`apps/api/src/logging/redact.ts`) before serialization.

_Bounded cost (audit F-01)._ A client controls the request path, so redaction must not be a
denial-of-service vector. The independent audit showed the original e-mail, JWT and URL patterns
were quadratic (a 15.8 KB path blocked the event loop for ~360 ms). Now:

- the path is capped at 512 characters at the source (`request-logging.ts`);
- every string is cut to `SCAN_LIMIT` (4096 + 1024) characters **before** any pattern runs, then
  the result is capped at 4096 (`…[truncated]`); the extra 1024 let a secret that starts before
  the cap be seen whole;
- every pattern may start only at the beginning of a run of the characters it consumes (negative
  lookbehind) and every repetition is bounded, so matching is linear;
- objects and arrays are capped at depth 6 and 100 entries per level.

Tests prove each pattern family stays linear on 64 KB pathological inputs; restoring the old
anchoring makes them take ~25 s against a 250 ms bound.

_What is redacted._

- Values of sensitive object keys, at any depth. Keys are matched case-insensitively **as
  substrings**: `authorization`, `cookie`, `passw…`, `pwd`, `passphrase`, `secret`, `token`,
  `api_key`/`apikey`, `access_key`, `session`, `private_key`, `credential`, `signature`,
  `bearer`, `jwt`, and the exact keys `auth` and `otp`. Variants such as `x-auth-token`,
  `bearerToken`, `dbPassword` and `aws_access_key_id` match. Over-redaction is accepted.
- Inside strings (messages, stack traces, any string field):
  - PEM and PGP private keys, including a key cut off before its `END` line;
  - `Authorization:` lines of any scheme (`Bearer`, `Basic`, `Token`, `Digest`, …), up to the end
    of the line;
  - `Bearer …` / `Basic …` credentials in any letter case, also with `%20` or `+`;
  - JWTs;
  - prefixed credential formats: AWS key ids (`AKIA…`, `ASIA…`), GitHub (`ghp_…`, `github_pat_…`),
    Stripe (`sk_live_…`, `rk_test_…`), Slack (`xox…-`) and Google API keys (`AIza…`);
  - `scheme://user:password@` URL credentials, including passwords that contain `@`;
  - `key=value`, `key: value`, JSON `"key":"value"` and escaped `\"key\":\"value\"` pairs
    whose key name looks sensitive (same list as above), e.g. `DB_PASSWORD=…`, `GITHUB_TOKEN=…`,
    `apiToken: …`, `X-Amz-Signature=…`;
  - `code`, `sig`, `state` and `key` only as URL query parameters (`?code=…`, `&sig=…`);
  - e-mail addresses, also with a URL-encoded `@`, replaced with `[REDACTED_EMAIL]`.

_Known limits (not redacted, verified by tests or probes)._ Phone numbers; names; postal
addresses; generic high-entropy strings with no recognisable key or prefix; secrets whose key
name is not on the list (e.g. `pin=`); unquoted values longer than 256 characters (only the first
256 are redacted); and anything beyond the 4096-character cap, which is discarded rather than
emitted. Redaction is pattern-based and **cannot** recognise every secret or personal datum. It
does not replace the primary rule: **never pass secrets or personal data to the logger.**

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

**Web** (`apps/web/src/security-headers.ts`). On every route, via `next.config.ts`:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` and
`Cross-Origin-Opener-Policy: same-origin`. These are constants, so Next.js compiling them into
the build is harmless.

HSTS is different: it depends on where the artifact runs. It is set per request by
`apps/web/src/proxy.ts` (Next.js 16 proxy, Node runtime) from the **runtime** `APP_ENV`, only in
`staging` and `production`, never in `development` or `test` (audit F-04). One build can
therefore be promoted from test to staging to production unchanged (Doc 01 §17).
`tests/startup/web-runtime-headers.test.ts` starts the real build output under each `APP_ENV`
and checks this.

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
- Only listed origins are reflected, matched exactly (no suffix or prefix matching).
  `Vary: Origin` is sent on responses to a listed origin only. Responses to other origins carry
  no CORS headers and no `Vary: Origin`. That is safe today because every API response is
  `Cache-Control: no-store`; any future cacheable API response must add `Vary: Origin` whenever
  CORS is enabled (audit F-13, tracked with G-37).
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
7. Not rely on a `.env` file. `pnpm --filter @platform/api start` loads `apps/api/.env` if one
   exists (`--env-file-if-exists`), which is a local-development convenience. Deployments inject
   variables through the platform; an image must not contain a `.env` (audit F-12).
8. Treat a failed start (for example a port already in use) as a crash: Node prints a plain-text
   error to stderr and exits 1. It fails closed and contains no configuration values, but it is
   not JSON (audit F-12, Phase 10 with G-32).

## 6. Verification

- Configuration: `apps/api/src/env.test.ts` (origins, wildcards, https in production, log
  levels); `tests/startup/env-rejection.test.ts` (the built API refuses unsafe settings).
- Behaviour: `apps/api/src/security-baseline.test.ts` (headers, HSTS, CORS allow/deny,
  preflight, request/5xx/4xx logging, no secrets in logs);
  `apps/api/src/logging/*.test.ts` (redaction, logger format and levels);
  `apps/api/src/all-exceptions.filter.test.ts` (L-05 guards); `apps/web/src/security-headers.test.ts`;
  and the e2e headers and CORS-default checks in `tests/e2e/smoke.spec.ts`.
- Web HSTS at runtime: `tests/startup/web-runtime-headers.test.ts` (F-04).
- Redaction cost and coverage: `apps/api/src/logging/redact.test.ts` (F-01, F-05),
  `json-logger.test.ts` (F-07), and the long-path test in `security-baseline.test.ts`.
- Mutation checks are recorded in `../STATUS.md` → "Phase 1 completion work" and
  "Phase 1 independent-audit remediation".
