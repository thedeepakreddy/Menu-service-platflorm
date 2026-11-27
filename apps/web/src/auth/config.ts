import type { WebEnv } from '../env';

/** The two login trust domains (D-025): owners and platform operators. */
export type LoginKind = 'owner' | 'operator';

export type ProviderConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** `openid` plus configured extra scopes (e.g. a provider's audience scope). */
  scope: string;
  /** Operators must have authenticated with MFA (`amr` contains `mfa`) recently (D-034). */
  requireMfa: boolean;
  maxAuthAgeSeconds: number;
};

export type AuthConfig = {
  appEnv: WebEnv['APP_ENV'];
  publicOrigin: string;
  /** Seals the login-transaction cookie only (D-034). */
  sessionKey: Uint8Array;
  providers: Partial<Record<LoginKind, ProviderConfig>>;
  /** The API that holds the server-side sessions (D-034). */
  apiOrigin: string;
  bffCredential: string;
  /** Trusted proxies in front of the web app (D-038). */
  trustedProxyHops: number;
  /** Global cap on token requests to the identity provider, per instance and minute (C-03). */
  tokenRequestsPerMinute: number;
};

/** Builds the login configuration, or undefined when no login domain is configured. */
export function authConfigFromEnv(env: WebEnv): AuthConfig | undefined {
  const providers: Partial<Record<LoginKind, ProviderConfig>> = {};
  if (
    env.WEB_OWNER_OIDC_ISSUER &&
    env.WEB_OWNER_OIDC_CLIENT_ID &&
    env.WEB_OWNER_OIDC_CLIENT_SECRET
  ) {
    providers.owner = {
      issuer: env.WEB_OWNER_OIDC_ISSUER,
      clientId: env.WEB_OWNER_OIDC_CLIENT_ID,
      clientSecret: env.WEB_OWNER_OIDC_CLIENT_SECRET,
      scope: ['openid', ...env.WEB_OWNER_OIDC_SCOPES.split(/\s+/).filter(Boolean)].join(' '),
      requireMfa: false,
      maxAuthAgeSeconds: 8 * 3600,
    };
  }
  if (
    env.WEB_OPERATOR_OIDC_ISSUER &&
    env.WEB_OPERATOR_OIDC_CLIENT_ID &&
    env.WEB_OPERATOR_OIDC_CLIENT_SECRET
  ) {
    providers.operator = {
      issuer: env.WEB_OPERATOR_OIDC_ISSUER,
      clientId: env.WEB_OPERATOR_OIDC_CLIENT_ID,
      clientSecret: env.WEB_OPERATOR_OIDC_CLIENT_SECRET,
      scope: ['openid', ...env.WEB_OPERATOR_OIDC_SCOPES.split(/\s+/).filter(Boolean)].join(' '),
      requireMfa: true,
      maxAuthAgeSeconds: 3600,
    };
  }
  if (providers.owner === undefined && providers.operator === undefined) return undefined;
  if (
    env.WEB_PUBLIC_ORIGIN === undefined ||
    env.WEB_SESSION_SECRET === undefined ||
    env.WEB_API_ORIGIN === undefined ||
    env.WEB_API_BFF_CREDENTIAL === undefined
  ) {
    return undefined;
  }
  return {
    appEnv: env.APP_ENV,
    publicOrigin: env.WEB_PUBLIC_ORIGIN,
    // Exactly 32 bytes (validated in env.ts): nothing is truncated.
    sessionKey: new Uint8Array(Buffer.from(env.WEB_SESSION_SECRET, 'base64url')),
    providers,
    apiOrigin: env.WEB_API_ORIGIN,
    bffCredential: env.WEB_API_BFF_CREDENTIAL,
    trustedProxyHops: env.WEB_TRUSTED_PROXY_HOPS ?? 0,
    tokenRequestsPerMinute: env.WEB_TOKEN_REQUESTS_PER_MINUTE,
  };
}

export function isLoginKind(value: string): value is LoginKind {
  return value === 'owner' || value === 'operator';
}
