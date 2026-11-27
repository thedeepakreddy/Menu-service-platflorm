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

/** One OIDC trust domain (D-025): all three variables together, or none. */
const OIDC_DOMAINS = ['OWNER', 'OPERATOR'] as const;
const OIDC_FIELDS = ['ISSUER', 'AUDIENCE', 'JWKS_URL'] as const;

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
     * Owner and operator OIDC trust domains (D-025). Optional in development and test (routes
     * of an unconfigured domain fail closed); required in staging and production.
     */
    API_OWNER_OIDC_ISSUER: httpUrl.optional(),
    API_OWNER_OIDC_AUDIENCE: z.string().min(1).max(500).optional(),
    API_OWNER_OIDC_JWKS_URL: httpUrl.optional(),
    API_OPERATOR_OIDC_ISSUER: httpUrl.optional(),
    API_OPERATOR_OIDC_AUDIENCE: z.string().min(1).max(500).optional(),
    API_OPERATOR_OIDC_JWKS_URL: httpUrl.optional(),
    /**
     * Optional (D-033). The operator WEB client id: when set, operator MFA is proven by the ID
     * token sent in X-Authentication-Proof (amr contains mfa, auth_time within
     * API_OPERATOR_MFA_MAX_AGE_SECONDS) instead of by the access token's amr.
     */
    API_OPERATOR_OIDC_PROOF_AUDIENCE: z.string().min(1).max(500).optional(),
    API_OPERATOR_MFA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
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
    if (!PRODUCTION_LIKE.has(env.APP_ENV)) return;
    for (const domain of OIDC_DOMAINS) {
      for (const f of OIDC_FIELDS) {
        const value = env[`API_${domain}_OIDC_${f}`];
        const mustBeHttps = f !== 'AUDIENCE';
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
