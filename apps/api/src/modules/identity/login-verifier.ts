import { createHash } from 'node:crypto';

import { decodeProtectedHeader, errors, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

/**
 * Verification of an OpenID Connect login before a server-side session is created (decision
 * D-034, replacing the D-033 per-request proof header; audit C-01, C-02).
 *
 * Provider-independent, standard OIDC + JWT only. The checks deliberately do not rely on `aud`
 * alone to tell tokens apart: with ZITADEL an ID token's `aud` contains the project id as well as
 * every client id of the project (docs/architecture/spikes/zitadel-token-contract.md), so an
 * audience check would accept an ID token as an access token (C-01). Token ROLES are told apart by
 * content, and the two tokens are bound to each other and to our client:
 *
 *   ID token     iss; aud contains our web client; azp == our web client; `nonce` present (only
 *                ID tokens carry it); `at_hash` present and equal to the hash of THIS access
 *                token; issued at most MAX_ID_TOKEN_AGE_SECONDS ago; for operators `amr`
 *                contains `mfa` and `auth_time` is within the maximum MFA age.
 *   access token a JWT; same iss; aud contains the API audience; `client_id` (or `azp`, if a
 *                provider uses it) == our web client; NO `nonce`, `at_hash` or `auth_time` (an
 *                ID token is never an access token); same `sub`; not the same string.
 *
 * Anything else is refused with one generic reason-less `undefined`.
 */

/** Asymmetric algorithms only. `none` and HMAC (HS*) are never accepted (no key confusion). */
export const ALLOWED_ALGORITHMS = ['RS256', 'ES256'] as const;

/** Seconds of clock skew tolerated for exp/nbf/iat/auth_time. */
export const CLOCK_TOLERANCE_SECONDS = 30;

/** A login must be completed promptly: the ID token may be at most this old. */
export const MAX_ID_TOKEN_AGE_SECONDS = 300;

/** Upper bound on token size; anything larger is rejected before any parsing. */
export const MAX_TOKEN_LENGTH = 8192;

export type LoginDomainConfig = {
  issuer: string;
  /** The API's audience: must be in the access token's `aud`. */
  apiAudience: string;
  /** The web (BFF) client id: in the ID token's `aud`, its `azp`, and the access token's client. */
  clientId: string;
  keys: JWTVerifyGetKey;
  /** Operators: `amr` must contain `mfa` and `auth_time` must be at most this old (seconds). */
  mfaMaxAgeSeconds?: number;
};

export type VerifiedLogin = {
  readonly issuer: string;
  readonly subject: string;
  readonly mfa: boolean;
  /** Seconds since epoch. */
  readonly authTime: number;
  readonly clientId: string;
  /** The provider's login-session id (`sid`), if any. */
  readonly providerSessionId: string | undefined;
  /** SHA-256 of the ID token: one session per ID token (replay resistance). */
  readonly idTokenHash: Buffer;
  /** Seconds since epoch. */
  readonly idTokenExpiresAt: number;
  /** Seconds since epoch: the session may not outlive the access token. */
  readonly accessTokenExpiresAt: number;
};

/** The provider's key set could not be fetched (outage): a 503, not a 401 or 500 (audit C-04). */
export class ProviderUnavailableError extends Error {
  override name = 'ProviderUnavailableError';
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** OIDC Core 3.1.3.6: base64url of the left half of the hash matching the signing algorithm. */
export function accessTokenHash(accessToken: string, alg: string): string | undefined {
  const hash = alg === 'RS256' || alg === 'ES256' ? 'sha256' : undefined;
  if (hash === undefined) return undefined;
  const digest = createHash(hash).update(accessToken, 'ascii').digest();
  return digest.subarray(0, digest.length / 2).toString('base64url');
}

function isNonEmptyString(value: unknown, max = 500): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function audienceIncludes(aud: unknown, value: string): boolean {
  return aud === value || (Array.isArray(aud) && aud.includes(value));
}

async function verifyJwt(
  token: string,
  config: LoginDomainConfig,
  audience: string,
): Promise<{ payload: JWTPayload; alg: string } | undefined> {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(token)) {
    return undefined;
  }
  try {
    const header = decodeProtectedHeader(token);
    // A JWT is signed (JWS), not encrypted; a typ, if present, must be a plain JWT type.
    if (header.typ !== undefined && !['JWT', 'at+jwt', 'application/at+jwt'].includes(header.typ)) {
      return undefined;
    }
    const { payload, protectedHeader } = await jwtVerify(token, config.keys, {
      issuer: config.issuer,
      audience,
      algorithms: [...ALLOWED_ALGORITHMS],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    if (!isNonEmptyString(payload.sub)) return undefined;
    return { payload, alg: protectedHeader.alg };
  } catch (error) {
    if (error instanceof errors.JWKSTimeout) throw new ProviderUnavailableError('JWKS timeout');
    // A JWKS endpoint answering non-200 or unparseable content (review R2-09) is an outage of
    // the provider, not a bad token. jose reports both as a generic JOSEError or JWKSInvalid.
    if (
      error instanceof errors.JWKSInvalid ||
      (error instanceof errors.JOSEError && error.code === 'ERR_JOSE_GENERIC')
    ) {
      throw new ProviderUnavailableError('JWKS unusable');
    }
    // Every verification failure is "not authenticated".
    if (error instanceof errors.JOSEError) return undefined;
    // A JWKS fetch that could not connect surfaces as a fetch TypeError.
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      throw new ProviderUnavailableError('JWKS unreachable');
    }
    throw error;
  }
}

export type LoginTokens = { idToken: string; accessToken: string };

export async function verifyLogin(
  tokens: LoginTokens,
  config: LoginDomainConfig,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifiedLogin | undefined> {
  const { idToken, accessToken } = tokens;
  // One credential can never fill both roles.
  if (idToken === accessToken) return undefined;

  const id = await verifyJwt(idToken, config, config.clientId);
  if (id === undefined) return undefined;
  const idc = id.payload;
  // ID-token role: our client is the authorized party, and only ID tokens carry a nonce.
  if (idc.azp !== config.clientId) return undefined;
  if (!isNonEmptyString(idc.nonce)) return undefined;
  if (typeof idc.iat !== 'number' || nowSeconds - idc.iat > MAX_ID_TOKEN_AGE_SECONDS) {
    return undefined;
  }
  // Binding: this ID token was issued together with this access token.
  const expectedAtHash = accessTokenHash(accessToken, id.alg);
  if (expectedAtHash === undefined || idc.at_hash !== expectedAtHash) return undefined;

  const at = await verifyJwt(accessToken, config, config.apiAudience);
  if (at === undefined) return undefined;
  const atc = at.payload;
  // Access-token role: never an ID token (no nonce / at_hash / auth_time / amr), our client.
  if ('nonce' in atc || 'at_hash' in atc || 'auth_time' in atc || 'amr' in atc) return undefined;
  const atClient = atc.client_id ?? atc.azp;
  if (atClient !== config.clientId) return undefined;
  if (atc.sub !== idc.sub || atc.iss !== idc.iss) return undefined;
  if (!audienceIncludes(atc.aud, config.apiAudience)) return undefined;

  // Authentication event.
  const authTime = typeof idc.auth_time === 'number' ? idc.auth_time : undefined;
  const amr = Array.isArray(idc.amr) ? (idc.amr as unknown[]) : [];
  const mfa = amr.includes('mfa');
  if (authTime === undefined || authTime > nowSeconds + CLOCK_TOLERANCE_SECONDS) return undefined;
  if (config.mfaMaxAgeSeconds !== undefined) {
    if (!mfa) return undefined;
    if (nowSeconds - authTime > config.mfaMaxAgeSeconds) return undefined;
  }
  if (typeof idc.exp !== 'number' || typeof atc.exp !== 'number') return undefined;
  const sid = isNonEmptyString(idc.sid) ? idc.sid : undefined;

  return {
    issuer: config.issuer,
    subject: idc.sub as string,
    mfa,
    authTime,
    clientId: config.clientId,
    providerSessionId: sid,
    idTokenHash: createHash('sha256').update(idToken, 'ascii').digest(),
    idTokenExpiresAt: idc.exp,
    accessTokenExpiresAt: atc.exp,
  };
}
