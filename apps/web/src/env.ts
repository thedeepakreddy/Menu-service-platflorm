import { z } from 'zod';

/**
 * Web runtime configuration (decisions P-107, D-030, D-034, D-038). Validated when Next.js loads
 * next.config.ts, i.e. on `next dev`, `next build` and `next start`. Error output names variables,
 * never values.
 *
 * Login (M2.6) is optional per trust domain: an unconfigured domain's login routes answer 404
 * (fail closed). A configured domain needs all its variables, plus WEB_PUBLIC_ORIGIN,
 * WEB_SESSION_SECRET, WEB_API_ORIGIN and WEB_API_BFF_CREDENTIAL. Staging and production require https for the origin and the issuers.
 */
const PRODUCTION_LIKE = new Set(['staging', 'production']);

const httpUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}, 'must be an http(s) URL');

const exactOrigin = httpUrl.refine(
  (value) => new URL(value).origin === value,
  'must be an exact origin',
);

/**
 * Exactly 32 random bytes, base64url without padding (43 characters): the A256GCM key that seals
 * the short-lived login-transaction cookie (D-034). Secret. A passphrase or a hex string is
 * refused rather than silently truncated (audit C-10).
 */
const sessionSecret = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'must be 32 random bytes, base64url without padding')
  .refine((value) => Buffer.from(value, 'base64url').length === 32, 'must encode 32 bytes');

/** The credential the BFF presents to the API (D-034). Secret. */
const bffCredential = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43,128}$/, 'must be 43-128 base64url characters');

export const LOGIN_KINDS = ['OWNER', 'OPERATOR'] as const;
const PROVIDER_FIELDS = ['ISSUER', 'CLIENT_ID', 'CLIENT_SECRET'] as const;

export const webEnvSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    WEB_PUBLIC_ORIGIN: exactOrigin.optional(),
    WEB_SESSION_SECRET: sessionSecret.optional(),
    WEB_OWNER_OIDC_ISSUER: httpUrl.optional(),
    WEB_OWNER_OIDC_CLIENT_ID: z.string().min(1).max(500).optional(),
    WEB_OWNER_OIDC_CLIENT_SECRET: z.string().min(1).max(2000).optional(),
    /** Extra scopes, space-separated (e.g. a provider's audience scope). Configuration only. */
    WEB_OWNER_OIDC_SCOPES: z.string().max(1000).default(''),
    WEB_OPERATOR_OIDC_ISSUER: httpUrl.optional(),
    WEB_OPERATOR_OIDC_CLIENT_ID: z.string().min(1).max(500).optional(),
    WEB_OPERATOR_OIDC_CLIENT_SECRET: z.string().min(1).max(2000).optional(),
    WEB_OPERATOR_OIDC_SCOPES: z.string().max(1000).default(''),
    /** Server-to-server API origin used by the BFF (D-034). Required when login is configured. */
    WEB_API_ORIGIN: exactOrigin.optional(),
    /** SECRET (D-034). Must equal the API's API_BFF_CREDENTIAL. */
    WEB_API_BFF_CREDENTIAL: bffCredential.optional(),
    /**
     * Number of trusted reverse proxies in front of the web app that append to X-Forwarded-For
     * (D-038). 0 = none: the per-address login limits then fall back to global limits only.
     */
    WEB_TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Global cap on token requests to the identity provider per instance and minute (C-03). */
    WEB_TOKEN_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(3000).default(600),
  })
  .superRefine((env, ctx) => {
    let anyLogin = false;
    for (const kind of LOGIN_KINDS) {
      const set = PROVIDER_FIELDS.filter((f) => env[`WEB_${kind}_OIDC_${f}`] !== undefined);
      if (set.length > 0) anyLogin = true;
      if (set.length > 0 && set.length < PROVIDER_FIELDS.length) {
        for (const f of PROVIDER_FIELDS.filter((x) => !set.includes(x))) {
          ctx.addIssue({
            code: 'custom',
            path: [`WEB_${kind}_OIDC_${f}`],
            message: 'all variables of a login domain must be set together',
          });
        }
      }
      const issuer = env[`WEB_${kind}_OIDC_ISSUER`];
      if (
        issuer !== undefined &&
        PRODUCTION_LIKE.has(env.APP_ENV) &&
        !issuer.startsWith('https://')
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [`WEB_${kind}_OIDC_ISSUER`],
          message: 'must use https',
        });
      }
    }
    if (!anyLogin) return;
    for (const name of [
      'WEB_PUBLIC_ORIGIN',
      'WEB_SESSION_SECRET',
      'WEB_API_ORIGIN',
      'WEB_API_BFF_CREDENTIAL',
    ] as const) {
      if (env[name] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: 'is required when login is configured',
        });
      }
    }
    if (
      env.WEB_PUBLIC_ORIGIN !== undefined &&
      PRODUCTION_LIKE.has(env.APP_ENV) &&
      !env.WEB_PUBLIC_ORIGIN.startsWith('https://')
    ) {
      ctx.addIssue({ code: 'custom', path: ['WEB_PUBLIC_ORIGIN'], message: 'must use https' });
    }
    if (
      env.WEB_API_ORIGIN !== undefined &&
      PRODUCTION_LIKE.has(env.APP_ENV) &&
      !env.WEB_API_ORIGIN.startsWith('https://')
    ) {
      ctx.addIssue({ code: 'custom', path: ['WEB_API_ORIGIN'], message: 'must use https' });
    }
  });

export type WebEnv = z.infer<typeof webEnvSchema>;

/** Returns the env, or throws listing variable names only (never values). */
export function parseWebEnv(source: Record<string, string | undefined>): WebEnv {
  const result = webEnvSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const lines = result.error.issues.map((issue) => {
    const variable = issue.path.join('.') || '(root)';
    // Presence is checked on the raw source; Zod issue codes differ by schema type.
    const problem = source[variable] === undefined ? 'is required' : `is invalid (${issue.code})`;
    return `  - ${variable} ${problem}`;
  });
  throw new Error(`Invalid web configuration; refusing to start:\n${lines.join('\n')}`);
}
