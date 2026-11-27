# ZITADEL OIDC token contract (for D-034)

**Date:** 2026-11-27. **Method:** desk research by a delegated agent, reviewed by the main session.
It read the public source code of `zitadel/zitadel` (main @ `03efb097d09f`) and `zitadel/oidc`
(main @ `2eda4bcc47a1`). ZITADEL's `go.mod` pins `github.com/zitadel/oidc/v3 v3.47.5`, and
`git diff v3.47.5 HEAD` shows no change in the token, hash or introspection files used below.

**Limits:** these facts come from source code, not from a live ZITADEL Cloud instance or a real
token. Cloud may run a different release. Each fact must be re-checked against real tokens from
the chosen instance before production (pre-production checklist, item PP-03).

## Facts (CONFIRMED in code unless stated otherwise)

| Claim / behaviour  | ID token                                                                                                                                                          | JWT access token                       | Evidence                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `aud`              | **All client ids of the project's apps plus the project id** (not opt-in); extra project ids through the `urn:zitadel:iam:org:project:id:{id}:aud` scope          | Same set as the ID token's in practice | `internal/api/oidc/auth_request.go` `audienceFromProjectID`: `return append(appIDs, projectID), nil`; docs `apis/openidoauth/claims.mdx`        |
| `azp`              | Always the requesting client id                                                                                                                                   | **Absent**                             | `pkg/oidc/token.go` `NewIDTokenClaims`: `AuthorizedParty: clientID`                                                                             |
| `client_id`        | Requesting client id                                                                                                                                              | Requesting client id                   | `NewIDTokenClaims`, `NewAccessTokenClaims`                                                                                                      |
| `at_hash`          | **Present whenever an access token is issued** (code flow, refresh, exchange); left half of the hash for the signing alg (RS256/ES256/PS256 → SHA-256), base64url | —                                      | `internal/api/oidc/token.go`: `if accessToken != "" { claims.AccessTokenHash, err = oidc.ClaimHash(accessToken, signAlg)`; `pkg/crypto/hash.go` |
| `nonce`            | Echoed when sent                                                                                                                                                  | **Absent**                             | `NewIDTokenClaims` / `NewAccessTokenClaims`                                                                                                     |
| `sid`              | ZITADEL login-session id (omitted when empty)                                                                                                                     | **Absent**                             | `internal/api/oidc/token.go`: `claims.SessionID = sessionID`                                                                                    |
| `amr`, `auth_time` | Present (`auth_time` backdated by the client's clock skew)                                                                                                        | **Absent**                             | `AuthMethodTypesToAMR`; `AuthTime: FromTime(authTime.Add(-skew))`                                                                               |
| `amr` values       | `pwd`, `user` (passkey/U2F), `otp`, and `mfa` when two or more factors were verified; IdP login adds none                                                         | —                                      | `internal/api/oidc/amr.go`                                                                                                                      |
| `acr`              | Never set                                                                                                                                                         | Never set                              | `NewIDTokenClaims(…, nonce, "", amr, …)`                                                                                                        |
| `jti`              | —                                                                                                                                                                 | Present (token id)                     | `NewAccessTokenClaims`                                                                                                                          |
| JOSE `typ`         | `JWT`                                                                                                                                                             | `JWT` (never `at+jwt`)                 | `internal/api/oidc/sign/signer.go`: `WithType("JWT")`                                                                                           |

**Other behaviour:**

- **Introspection** returns `amr` and `auth_time` for V2 tokens (all current code exchanges). It
  returns no `sid` and no `azp`, and requires client authentication.
  - The ZITADEL docs say introspection has no `amr`. The code contradicts this.
- **`max_age`** is enforced per factor by the v1 login UI, and `auth_time` reflects the fresh
  verification.
  - The v2 (TypeScript) login UI is UNCONFIRMED.
  - `prompt=login` does not provably force factors to be verified again.
- **Back-channel logout** is supported. The logout token carries `sid`, the same value as the ID
  token's.
- **Token exchange** (RFC 8693) exists. It is not used here.

## Consequences for the design (D-034)

1. **C-01 is real with ZITADEL's defaults.** An operator ID token's `aud` contains the project id
   by default. If the API audience is that project id, a verifier that checks only `iss` and
   `aud` accepts the ID token as an access token. Token roles must therefore be told apart by
   their content:
   - ID token: has `nonce` and `azp`; `at_hash` binds it to the access token.
   - Access token: has `client_id`; has **no** `nonce`, `azp` or `at_hash`.
2. **`aud` does not identify the client.** Another app in the same project receives tokens whose
   `aud` contains our client id. The client must be checked through `azp` (ID token) and
   `client_id` (access token).
3. **MFA evidence exists only in the ID token** (or in introspection). The API checks it once, at
   session creation, and bounds the session by `auth_time` + the maximum age.
4. **`at_hash` is always present in the code flow**, so the API can require it and bind the two
   tokens cryptographically.
5. **Access tokens must be JWTs.** This is the ZITADEL app setting "Auth Token Type = JWT".
   Opaque tokens are refused (fail closed).
