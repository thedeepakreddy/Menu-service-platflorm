// A local OIDC test issuer (D-025, D-034): real asymmetric keys and signatures, synthetic claims.
// Lets the identity boundary be verified without any vendor. Test support only; never shipped.
//
// `login()` mints a token pair shaped like ZITADEL's (docs/architecture/spikes/
// zitadel-token-contract.md): the ID token's `aud` holds the web client AND the project (= API
// audience), `azp` is the client, `at_hash` binds the access token; the access token carries
// `client_id` and no nonce/amr/auth_time. Overrides let tests build every malformed variant.
import { createHash } from 'node:crypto';

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

export type TokenOptions = {
  expiresIn?: string | number;
  notBefore?: string;
  alg?: 'ES256' | 'RS256';
  noIat?: boolean;
  typ?: string;
};

export type LoginOptions = {
  clientId: string;
  apiAudience: string;
  subject?: string;
  amr?: string[];
  /** Seconds since epoch; default now. */
  authTime?: number;
  sid?: string;
  /** Claims merged into (or, with `undefined`, removed from) the ID token. */
  idClaims?: Record<string, unknown>;
  /** Claims merged into (or removed from) the access token. */
  accessClaims?: Record<string, unknown>;
  alg?: 'ES256' | 'RS256';
};

export type TestIssuer = {
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
  /** Signs a token; `claims` and `options` override the valid defaults. */
  token(claims?: JWTPayload, options?: TokenOptions): Promise<string>;
  /** A ZITADEL-shaped ID token + JWT access token pair. */
  login(options: LoginOptions): Promise<{ idToken: string; accessToken: string }>;
};

/** OIDC Core 3.1.3.6 at_hash for RS256/ES256. */
export function atHash(accessToken: string): string {
  const digest = createHash('sha256').update(accessToken, 'ascii').digest();
  return digest.subarray(0, 16).toString('base64url');
}

function withOverrides(base: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const merged = { ...base, ...overrides };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
}

export async function createTestIssuer(issuer: string, audience: string): Promise<TestIssuer> {
  const es = await generateKeyPair('ES256');
  const rs = await generateKeyPair('RS256');
  const esJwk = { ...(await exportJWK(es.publicKey)), kid: 'es', alg: 'ES256' };
  const rsJwk = { ...(await exportJWK(rs.publicKey)), kid: 'rs', alg: 'RS256' };

  async function sign(payload: Record<string, unknown>, options: TokenOptions = {}) {
    const alg = options.alg ?? 'ES256';
    let jwt = new SignJWT(payload).setProtectedHeader({
      alg,
      kid: alg === 'ES256' ? 'es' : 'rs',
      typ: options.typ ?? 'JWT',
    });
    if (payload.exp === undefined) jwt = jwt.setExpirationTime(options.expiresIn ?? '5m');
    if (options.noIat !== true && payload.iat === undefined) jwt = jwt.setIssuedAt();
    if (options.notBefore !== undefined) jwt = jwt.setNotBefore(options.notBefore);
    return jwt.sign(alg === 'ES256' ? es.privateKey : rs.privateKey);
  }

  return {
    issuer,
    audience,
    keys: createLocalJWKSet({ keys: [esJwk, rsJwk] }),
    async token(claims = {}, options = {}) {
      return sign(
        {
          sub: 'subject-1',
          ...claims,
          iss: typeof claims.iss === 'string' ? claims.iss : issuer,
          aud: claims.aud ?? audience,
        },
        options,
      );
    },
    async login(options) {
      const now = Math.floor(Date.now() / 1000);
      const sub = options.subject ?? 'subject-1';
      const alg = options.alg ?? 'RS256';
      const aud = [options.clientId, options.apiAudience];
      const accessToken = await sign(
        withOverrides(
          {
            iss: issuer,
            sub,
            aud,
            client_id: options.clientId,
            jti: `V2_${Math.random().toString(36).slice(2)}`,
            iat: now,
            nbf: now,
          },
          options.accessClaims,
        ),
        { alg },
      );
      const idToken = await sign(
        withOverrides(
          {
            iss: issuer,
            sub,
            aud,
            azp: options.clientId,
            client_id: options.clientId,
            nonce: 'n-0S6_WzA2Mj',
            at_hash: atHash(accessToken),
            amr: options.amr ?? ['pwd'],
            auth_time: options.authTime ?? now - 5,
            sid: options.sid ?? 'sid-1',
            iat: now,
          },
          options.idClaims,
        ),
        { alg },
      );
      return { idToken, accessToken };
    },
  };
}
