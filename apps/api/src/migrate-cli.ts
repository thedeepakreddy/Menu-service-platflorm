import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { migrate } from './infrastructure/database/migrate.js';
import { redactString } from './logging/redact.js';

/**
 * Migration job entry point (D-024, D-029): `pnpm --filter @platform/api migrate`.
 * Uses MIGRATION_DATABASE_URL, the migration role's credentials, which the API runtime never
 * receives. Output names the problem, never the connection string.
 */
const postgresUrl = z
  .string()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a postgres:// URL');

async function main(): Promise<void> {
  const parsed = postgresUrl.safeParse(process.env.MIGRATION_DATABASE_URL);
  if (!parsed.success) {
    const missing = process.env.MIGRATION_DATABASE_URL === undefined;
    process.stderr.write(
      `MIGRATION_DATABASE_URL ${missing ? 'is required' : 'is invalid'}; refusing to migrate\n`,
    );
    process.exitCode = 1;
    return;
  }
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  try {
    const result = await migrate(parsed.data, dir);
    process.stdout.write(
      `${JSON.stringify({ event: 'migrate', applied: result.applied, alreadyApplied: result.alreadyApplied.length })}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stderr.write(`migration failed: ${redactString(message)}\n`);
    process.exitCode = 1;
  }
}

await main();
