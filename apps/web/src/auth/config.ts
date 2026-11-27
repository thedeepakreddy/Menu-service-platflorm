import type { WebEnv } from '../env';

/** The two login trust domains (D-025): owners and platform operators. */
export type LoginKind = 'owner' | 'operator';

export type ProviderConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** `openid` plus configured extra scopes (e.g. a provider's audience scope). */
  scope: string;
  /** Absolute session cap in seconds (D-033: owners 8 h, operators 1 h). */
  maxSessionSeconds: number;
  /** Operators must have authenticated with MFA (`amr` contains `mfa`) recently (D-033). */
  requireMfa: boolean;
  maxAuthAgeSeconds: number;
};

export type AuthConfig = {
  appEnv: WebEnv['APP_ENV'];
  publicOrigin: string;
  sessionKey: Uint8Array;
  providers: Partial<Record<LoginKind, ProviderConfig>>;
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
      maxSessionSeconds: 8 * 3600,
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
      maxSessionSeconds: 3600,
      requireMfa: true,
      maxAuthAgeSeconds: 3600,
    };
  }
  if (providers.owner === undefined && providers.operator === undefined) return undefined;
  if (env.WEB_PUBLIC_ORIGIN === undefined || env.WEB_SESSION_SECRET === undefined) return undefined;
  return {
    appEnv: env.APP_ENV,
    publicOrigin: env.WEB_PUBLIC_ORIGIN,
    sessionKey: new Uint8Array(Buffer.from(env.WEB_SESSION_SECRET, 'base64url').subarray(0, 32)),
    providers,
  };
}

export function isLoginKind(value: string): value is LoginKind {
  return value === 'owner' || value === 'operator';
}
