// CLI for CI/e2e: provisions a migrated throwaway database and prints the API runtime URL
// (or appends it to $GITHUB_ENV as E2E_API_DATABASE_URL). Usage:
//   TEST_DATABASE_ADMIN_URL=... node apps/api/test/db/provision-cli.ts platform_e2e
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { provisionDatabase } from './provision.ts';

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? '';
const name = process.argv[2] ?? 'platform_e2e';
const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));
const db = await provisionDatabase(adminUrl, name, migrationsDir);
const line = `E2E_API_DATABASE_URL=${db.runtimeUrl}\n`;
if (process.env.GITHUB_ENV !== undefined) appendFileSync(process.env.GITHUB_ENV, line);
else process.stdout.write(line);
process.stderr.write(`provisioned and migrated ${db.database}\n`);
