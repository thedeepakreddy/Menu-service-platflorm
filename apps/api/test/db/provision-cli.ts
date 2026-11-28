// CLI for CI/e2e: provisions a migrated throwaway database and prints the API runtime URL
// (or appends it to $GITHUB_ENV as E2E_API_DATABASE_URL). Usage:
//   TEST_DATABASE_ADMIN_URL=... node apps/api/test/db/provision-cli.ts platform_e2e
// With E2E_SEED_OWNER_ISSUER and E2E_SEED_OWNER_SUBJECT set, it also seeds one owner account and
// the tenant `e2e-cafe` for the browser login test, plus the public-entry fixtures (Phase 3).
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { provisionDatabase } from './provision.ts';

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? '';
const name = process.argv[2] ?? 'platform_e2e';
const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));
const db = await provisionDatabase(adminUrl, name, migrationsDir);
// Optional e2e seed (synthetic): one owner account for the browser login test and its tenant.
const seedIssuer = process.env.E2E_SEED_OWNER_ISSUER;
const seedSubject = process.env.E2E_SEED_OWNER_SUBJECT;
if (seedIssuer !== undefined && seedSubject !== undefined) {
  const admin = new pg.Client({ connectionString: db.adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `WITH a AS (INSERT INTO app.accounts (issuer, subject, kind) VALUES ($1, $2, 'owner') RETURNING id),
            t AS (INSERT INTO app.tenants (slug, display_name) VALUES ('e2e-cafe', 'E2E Cafe') RETURNING id)
       INSERT INTO app.memberships (tenant_id, account_id) SELECT t.id, a.id FROM t, a`,
      [seedIssuer, seedSubject],
    );
    // Public-entry fixtures (Phase 3): a second active tenant, one whose display name is hostile
    // markup (rendered as text, never as HTML), and one suspended and one retired tenant, which
    // must be indistinguishable from an unknown slug, and one with a long name that has very long
    // words (layout at 320 px). Synthetic names only.
    await admin.query(
      `INSERT INTO app.tenants (slug, display_name, status) VALUES
         ('e2e-bistro', 'E2E Bistro', 'active'),
         ('e2e-markup', '<script>window.__pwned=1</script> & <b>Bold</b>', 'active'),
         ('e2e-closed', 'E2E Closed Venue', 'suspended'),
         ('e2e-gone', 'E2E Retired Venue', 'retired'),
         ('e2e-long', 'Legendás Hagyományőrző Kézműves Kávéház és Cukrászda a Régi Piactér Sarkán — Egészségszolgáltatásmegszervezhetetlenségeskedéseitekért', 'active'),
         ('e2e-toggle-desktop', 'E2E Toggle Desktop', 'active'),
         ('e2e-toggle-mobile', 'E2E Toggle Mobile', 'active'),
         ('e2e-toggle-tablet', 'E2E Toggle Tablet', 'active')`,
    );
  } finally {
    await admin.end();
  }
  process.stderr.write('seeded the e2e owner account and tenant\n');
}
const line = `E2E_API_DATABASE_URL=${db.runtimeUrl}\n`;
if (process.env.GITHUB_ENV !== undefined) appendFileSync(process.env.GITHUB_ENV, line);
else process.stdout.write(line);
process.stderr.write(`provisioned and migrated ${db.database}\n`);
