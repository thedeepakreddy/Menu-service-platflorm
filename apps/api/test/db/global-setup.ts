// Vitest global setup for the `db` project: provisions a fresh, migrated test database once per
// run and hands the role-specific connection strings to the tests through `inject()`.
import { fileURLToPath } from 'node:url';

import type { TestProject } from 'vitest/node';

import { provisionDatabase } from './provision.ts';
import type { ProvisionedDatabase } from './provision.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    database: ProvisionedDatabase;
    migrationsDir: string;
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (adminUrl === undefined || adminUrl === '') {
    throw new Error(
      'TEST_DATABASE_ADMIN_URL is required for `pnpm test:db` (a superuser URL of a throwaway, ' +
        'loopback PostgreSQL cluster). The database tests never skip.',
    );
  }
  const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));
  const database = await provisionDatabase(adminUrl, 'platform_test', migrationsDir);
  project.provide('database', database);
  project.provide('migrationsDir', migrationsDir);
}
