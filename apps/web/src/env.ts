import { z } from 'zod';

/**
 * Web runtime configuration (decision P-107). Validated when Next.js loads
 * next.config.ts, i.e. on `next dev`, `next build` and `next start`. Phase 1
 * needs no API URL yet: the skeleton page does not call the API.
 */
export const webEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
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
