import { z } from 'zod';

/**
 * API runtime configuration (decision P-107). Every variable is required and
 * validated at startup; there are no silent defaults. Secrets management is
 * not decided yet (docs/GAPS.md G-08), so no secret-bearing variables exist.
 */
export const apiEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
  API_HOST: z.string().trim().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535),
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
