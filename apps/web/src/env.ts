import { z } from 'zod';

/**
 * Web runtime configuration (decisions P-107, D-030, D-033). Validated when Next.js loads
 * next.config.ts, i.e. on `next dev`, `next build` and `next start`. Error output names variables,
 * never values.
 *
 * Login (M2.6) is optional per trust domain: an unconfigured domain's login routes answer 404
 * (fail closed). A configured domain needs all its variables, plus WEB_PUBLIC_ORIGIN and
 * WEB_SESSION_SECRET. Staging and production require https for the origin and the issuers.
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

/** At least 32 random bytes, base64url-encoded (the A256GCM session key, D-033). Secret. */
const sessionSecret = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => Buffer.from(value, 'base64url').length >= 32, 'must encode at least 32 bytes');

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
    for (const name of ['WEB_PUBLIC_ORIGIN', 'WEB_SESSION_SECRET'] as const) {
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
