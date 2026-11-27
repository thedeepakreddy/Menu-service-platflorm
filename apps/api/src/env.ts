import { isIP } from 'node:net';

import { z } from 'zod';

/**
 * API runtime configuration (decision P-107; security baseline D-019, D-020).
 * Required variables have no defaults. The two optional variables have
 * documented, secure defaults: no cross-origin access, and `info` logging.
 * Secrets (D-029): API_DATABASE_URL carries the runtime role's password. It is
 * injected at runtime by the platform's secret store, never committed, and
 * never printed (issues name the variable only).
 */
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevelName = (typeof LOG_LEVELS)[number];

const APP_ENVS = ['development', 'test', 'staging', 'production'] as const;

/** Environments that must behave like production (HTTPS-only origins, HSTS, no debug logs). */
export const PRODUCTION_LIKE: ReadonlySet<string> = new Set(['staging', 'production']);

/**
 * A single exact origin: `scheme://host[:port]` with no path, query, fragment,
 * credentials or wildcard. Anything else is rejected, never interpreted.
 */
export function isExactOrigin(value: string): boolean {
  if (value.includes('*')) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return url.origin === value;
}

/** TLS modes accepted for the database connection in staging and production (D-029). */
const TLS_SSLMODES = new Set(['require', 'verify-ca', 'verify-full']);

const postgresUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.hostname !== '';
  } catch {
    return false;
  }
}, 'must be a postgres:// URL');

const httpUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}, 'must be an http(s) URL');

/** One OIDC trust domain (D-025, D-034): all four variables together, or none. */
const OIDC_DOMAINS = ['OWNER', 'OPERATOR'] as const;
const OIDC_FIELDS = ['ISSUER', 'AUDIENCE', 'JWKS_URL', 'CLIENT_ID'] as const;

/** A high-entropy shared secret: at least 256 bits as base64url (43+ characters). */
const sharedSecret = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43,128}$/, 'must be 43-128 base64url characters');

/** Comma-separated exact IP addresses or CIDR ranges (D-037). */
const trustedProxyList = z
  .string()
  .transform((raw) =>
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .refine(
    (entries) =>
      entries.every((entry) => {
        const [address = '', prefix] = entry.split('/');
        const family = isIP(address);
        if (family === 0) return false;
        if (prefix === undefined) return true;
        const bits = Number(prefix);
        return /^\d{1,3}$/.test(prefix) && bits >= 0 && bits <= (family === 4 ? 32 : 128);
      }),
    { message: 'must be a comma-separated list of IP addresses or CIDR ranges' },
  );

const corsOriginList = z
  .string()
  .transform((raw) =>
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .refine((origins) => origins.every(isExactOrigin), {
    message: 'must be a comma-separated list of exact http(s) origins (no wildcards or paths)',
  });

export const apiEnvSchema = z
  .object({
    APP_ENV: z.enum(APP_ENVS),
    API_HOST: z.string().trim().min(1),
    API_PORT: z.coerce.number().int().min(1).max(65535),
    /** Optional. Absent or empty means no cross-origin access at all (D-019). */
    API_CORS_ALLOWED_ORIGINS: corsOriginList.default([]),
    /** Optional. Defaults to `info` (D-020). */
    API_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    /** Required. The restricted runtime role's connection string (D-028, D-029). Secret. */
    API_DATABASE_URL: postgresUrl,
    /**
     * The operator role's connection string (D-028). Secret. Optional in development and test
     * (operator actions then fail closed with 503); required in staging and production.
     */
    API_OPERATOR_DATABASE_URL: postgresUrl.optional(),
    /** Optional. Maximum pooled database connections; defaults to 10. */
    API_DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    /**
     * Owner and operator OIDC trust domains (D-025, D-034). Optional in development and test
     * (an unconfigured domain cannot log in); required in staging and production. AUDIENCE is the
     * API audience (in the access token's `aud`); CLIENT_ID is the web BFF client (the ID token's
     * `aud`/`azp` and the access token's `client_id`).
     */
    API_OWNER_OIDC_ISSUER: httpUrl.optional(),
    API_OWNER_OIDC_AUDIENCE: z.string().min(1).max(500).optional(),
    API_OWNER_OIDC_JWKS_URL: httpUrl.optional(),
    API_OWNER_OIDC_CLIENT_ID: z.string().min(1).max(500).optional(),
    API_OPERATOR_OIDC_ISSUER: httpUrl.optional(),
    API_OPERATOR_OIDC_AUDIENCE: z.string().min(1).max(500).optional(),
    API_OPERATOR_OIDC_JWKS_URL: httpUrl.optional(),
    API_OPERATOR_OIDC_CLIENT_ID: z.string().min(1).max(500).optional(),
    /** Operator MFA freshness (D-034): an operator session ends this long after the MFA login. */
    API_OPERATOR_MFA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(3600).default(3600),
    /** Idle timeouts of server-side sessions (D-034), renewed on use. */
    API_OWNER_SESSION_IDLE_SECONDS: z.coerce.number().int().min(60).max(28_800).default(1800),
    API_OPERATOR_SESSION_IDLE_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    /**
     * SECRET (D-034). The credential the web BFF presents on every authenticated API call.
     * Required whenever a login domain is configured.
     */
    API_BFF_CREDENTIAL: sharedSecret.optional(),
    /** Optional (D-037). Reverse proxies whose X-Forwarded-For is trusted; default none. */
    API_TRUSTED_PROXIES: trustedProxyList.default([]),
  })
  .superRefine((env, ctx) => {
    for (const domain of OIDC_DOMAINS) {
      const set = OIDC_FIELDS.filter((f) => env[`API_${domain}_OIDC_${f}`] !== undefined);
      if (set.length > 0 && set.length < OIDC_FIELDS.length) {
        for (const f of OIDC_FIELDS.filter((x) => !set.includes(x))) {
          ctx.addIssue({
            code: 'custom',
            path: [`API_${domain}_OIDC_${f}`],
            message: 'all three OIDC variables of a trust domain must be set together',
          });
        }
      }
    }
    if (
      env.API_OWNER_OIDC_ISSUER !== undefined &&
      env.API_OWNER_OIDC_ISSUER === env.API_OPERATOR_OIDC_ISSUER &&
      env.API_OWNER_OIDC_AUDIENCE === env.API_OPERATOR_OIDC_AUDIENCE
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_OPERATOR_OIDC_AUDIENCE'],
        message:
          'owner and operator must be separate trust domains (issuer or audience must differ)',
      });
    }
    const anyDomain = OIDC_DOMAINS.some((d) => env[`API_${d}_OIDC_ISSUER`] !== undefined);
    if (anyDomain && env.API_BFF_CREDENTIAL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_BFF_CREDENTIAL'],
        message: 'is required when a login domain is configured',
      });
    }
    if (
      env.API_OWNER_OIDC_CLIENT_ID !== undefined &&
      env.API_OWNER_OIDC_CLIENT_ID === env.API_OPERATOR_OIDC_CLIENT_ID
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_OPERATOR_OIDC_CLIENT_ID'],
        message: 'owner and operator must use different web clients',
      });
    }
    if (!PRODUCTION_LIKE.has(env.APP_ENV)) return;
    for (const domain of OIDC_DOMAINS) {
      for (const f of OIDC_FIELDS) {
        const value = env[`API_${domain}_OIDC_${f}`];
        const mustBeHttps = f === 'ISSUER' || f === 'JWKS_URL';
        if (value === undefined || (mustBeHttps && !value.startsWith('https://'))) {
          ctx.addIssue({
            code: 'custom',
            path: [`API_${domain}_OIDC_${f}`],
            message: 'is required (https for URLs) in staging and production',
          });
        }
      }
    }
    if (env.API_CORS_ALLOWED_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_CORS_ALLOWED_ORIGINS'],
        message: 'must use https:// origins in staging and production',
      });
    }
    if (env.API_OPERATOR_DATABASE_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_OPERATOR_DATABASE_URL'],
        message: 'is required in staging and production',
      });
    } else if (
      !TLS_SSLMODES.has(new URL(env.API_OPERATOR_DATABASE_URL).searchParams.get('sslmode') ?? '')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_OPERATOR_DATABASE_URL'],
        message: 'must require TLS in staging and production',
      });
    }
    const sslmode = new URL(env.API_DATABASE_URL).searchParams.get('sslmode') ?? '';
    if (!TLS_SSLMODES.has(sslmode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_DATABASE_URL'],
        message:
          'must require TLS (sslmode=require, verify-ca or verify-full) in staging and production',
      });
    }
    if (env.API_LOG_LEVEL === 'debug') {
      ctx.addIssue({
        code: 'custom',
        path: ['API_LOG_LEVEL'],
        message: 'debug logging is not allowed in staging and production',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export type EnvIssue = { variable: string; problem: string };

export type EnvResult = { ok: true; env: ApiEnv } | { ok: false; issues: EnvIssue[] };

/**
 * Validate configuration. Issues report the variable name and a description of
 * the problem only, never the supplied value, so misconfigured secrets added
 * later cannot leak into logs.
 */
export function parseApiEnv(source: Record<string, string | undefined>): EnvResult {
  const result = apiEnvSchema.safeParse(source);
  if (result.success) {
    return { ok: true, env: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => {
      const variable = issue.path.join('.') || '(root)';
      // Presence is checked on the raw source: Zod's issue codes differ by
      // schema type (an absent enum is `invalid_value`, not `invalid_type`).
      const missing = source[variable] === undefined;
      return { variable, problem: missing ? 'is required' : `is invalid (${issue.code})` };
    }),
  };
}
