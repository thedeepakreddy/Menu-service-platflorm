import { errors, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

/**
 * OpenID Connect token verification (decision D-025). Provider-independent: any issuer that
 * publishes a JWKS works. Owners and operators are separate trust domains, each with its own
 * verifier (issuer + audience); a token valid for one is never accepted by the other.
 */

/** Asymmetric algorithms only. `none` and HMAC (HS*) are never accepted (no key confusion). */
export const ALLOWED_ALGORITHMS = ['RS256', 'ES256'] as const;

/** Seconds of clock skew tolerated for exp/nbf/iat. */
export const CLOCK_TOLERANCE_SECONDS = 30;

export type VerifiedIdentity = {
  readonly issuer: string;
  readonly subject: string;
};

export type IdentityVerifier = {
  readonly issuer: string;
  verify(token: string): Promise<VerifiedIdentity | undefined>;
};

export type VerifierOptions = {
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
  /** Operators must show multi-factor authentication (RFC 8176 `amr` contains `mfa`). */
  requireMfa?: boolean;
  /**
   * Maximum age in seconds of the authentication event (`auth_time`, required when set). Used for
   * the operator authentication proof (D-033) so that an old MFA login cannot be reused forever.
   */
  maxAuthAgeSeconds?: number;
  /** Clock for tests (seconds since epoch). */
  nowSeconds?: () => number;
};

/** Upper bound on token size; anything larger is rejected before any parsing. */
const MAX_TOKEN_LENGTH = 8192;

export function createIdentityVerifier(options: VerifierOptions): IdentityVerifier {
  return {
    issuer: options.issuer,
    async verify(token: string): Promise<VerifiedIdentity | undefined> {
      if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return undefined;
      try {
        const { payload } = await jwtVerify(token, options.keys, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: [...ALLOWED_ALGORITHMS],
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          requiredClaims: ['sub', 'exp', 'iat'],
        });
        if (
          typeof payload.sub !== 'string' ||
          payload.sub.length === 0 ||
          payload.sub.length > 500
        ) {
          return undefined;
        }
        if (options.requireMfa === true) {
          const amr: unknown = payload.amr;
          if (!Array.isArray(amr) || !amr.includes('mfa')) return undefined;
        }
        if (options.maxAuthAgeSeconds !== undefined) {
          const authTime: unknown = payload.auth_time;
          const now = options.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
          if (typeof authTime !== 'number' || authTime > now + CLOCK_TOLERANCE_SECONDS)
            return undefined;
          if (now - authTime > options.maxAuthAgeSeconds) return undefined;
        }
        return { issuer: options.issuer, subject: payload.sub };
      } catch (error) {
        // Every verification failure is "not authenticated"; anything else is a real fault.
        if (error instanceof errors.JOSEError) return undefined;
        throw error;
      }
    },
  };
}

/** Extracts a bearer token from an Authorization header value; undefined if absent or malformed. */
export function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header);
  return match?.[1];
}
