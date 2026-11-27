// Module-boundary rules (Doc 02 §3, decision P-104; remediated per audit
// findings H-01, M-01, M-02, M-03 (D-010 – D-012) and R-01, R-02, R-04 (D-016 – D-017)).
// Paths are relative to the repository root, or to a fixture root in the
// architecture regression tests. Every rule here must have a fixture directory
// under tests/architecture/fixtures/rules/<rule-name>/; the test suite fails
// otherwise.

/** Workspace build output: kept in the graph as targets, never followed. */
const WORKSPACE_BUILD_OUTPUT = '^(apps|packages)/[^/]+/(dist|\\.next)/';

/**
 * Test files, by any common naming convention: `*.test.*`, `*.spec.*`
 * (js/ts, optionally jsx/tsx, cjs/mjs/cts/mts) and anything under a
 * `__tests__/` directory (audit R-01, D-016).
 */
const TEST_FILE = '(\\.(test|spec)\\.[cm]?[jt]sx?$)|(/__tests__/)';

/**
 * Test-tooling configuration: the only non-test files allowed to import
 * devDependencies (they import `vitest`). Runtime configuration such as
 * `next.config.ts`, which `next start` loads, is deliberately NOT included
 * (audit N-01, D-021).
 */
const TOOLING_CONFIG = '^(apps|packages)/[^/]+/vitest\\.config\\.[cm]?[jt]s$';

/** Database clients and ORMs the web app must never import (M-03, D-012). */
const DB_CLIENTS = [
  '@prisma/client',
  '\\.prisma',
  'prisma',
  '@mikro-orm/[^/]+',
  'drizzle-orm',
  'kysely',
  'knex',
  'typeorm',
  'sequelize',
  'pg',
  'pg-pool',
  'postgres',
  '@neondatabase/serverless',
  '@vercel/postgres',
  'mysql',
  'mysql2',
  'mariadb',
  '@planetscale/database',
  'better-sqlite3',
  'sqlite3',
  '@libsql/client',
  'mongodb',
  'mongoose',
  'redis',
  'ioredis',
].join('|');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies hide coupling between modules.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-app-imports',
      severity: 'error',
      comment: 'Apps are separate deployables; share code through packages/ only.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/[^/]+/', pathNot: '^apps/$1/' },
    },
    {
      name: 'packages-must-not-import-apps',
      severity: 'error',
      comment: 'Shared packages sit below apps in the dependency direction.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-deep-package-imports',
      severity: 'error',
      comment: 'Consume a workspace package through its public entry, never its src/ internals.',
      from: { path: '^apps/' },
      to: { path: '^packages/[^/]+/src/' },
    },
    {
      name: 'no-workspace-build-output-imports',
      severity: 'error',
      comment:
        'Source must never import a workspace build-output directory (dist/, .next/) by path. ' +
        'Workspace packages are consumed by package name through their exports map, which ' +
        'dependency-cruiser reports as a non-local dependency.',
      from: { path: '^(apps|packages|tests)/' },
      to: { path: WORKSPACE_BUILD_OUTPUT, dependencyTypes: ['local'] },
    },
    {
      name: 'no-runtime-imports-of-test-files',
      severity: 'error',
      comment:
        'Non-test workspace code must never import a test file. Test files are exempt from ' +
        'the contracts allowlist and the devDependency rule, and a build follows imports even ' +
        'into files its tsconfig excludes, so such an import would launder forbidden ' +
        'dependencies into production output (audit R-01, D-016). Test files may import ' +
        'other test files.',
      from: { path: '^(apps|packages)/', pathNot: [TEST_FILE, TOOLING_CONFIG] },
      // Test-tooling config is exempt from the devDependency rule, so it must
      // not be importable by runtime code either (N-01).
      to: { path: [TEST_FILE, TOOLING_CONFIG] },
    },
    {
      name: 'production-code-must-not-import-tests',
      severity: 'error',
      from: { path: '^(apps|packages)/' },
      to: { path: '^tests/' },
    },
    {
      name: 'contracts-allowlist',
      severity: 'error',
      comment:
        'packages/contracts runtime code may depend only on its own sources and zod. ' +
        'Node built-ins, frameworks, ORM/database clients, HTTP clients and every other ' +
        'package are rejected, including type-only imports (D-011).',
      from: { path: '^packages/contracts/src/', pathNot: '\\.test\\.ts$' },
      to: { pathNot: ['^packages/contracts/src/', '(^|/)node_modules/zod/'] },
    },
    {
      name: 'web-no-db-clients',
      severity: 'error',
      comment:
        'The web app must not import database clients or ORMs, directly or as types (D-012).',
      from: { path: '^apps/web/' },
      to: { path: `(^|/node_modules/)(${DB_CLIENTS})(/|$)` },
    },
    {
      name: 'api-module-encapsulation',
      severity: 'error',
      comment: "An API domain module may use another module only through that module's index.ts.",
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'api-module-entry-only',
      severity: 'error',
      comment:
        'Every apps/api file outside a module directory (root, bootstrap, tests, config, and ' +
        'files directly under src/modules/ such as a registry or barrel) may use a module ' +
        "only through its index.ts. A module's own files are governed by " +
        'api-module-encapsulation instead (audit M-02, R-02).',
      // Exempt only files inside src/modules/<name>/, not src/modules/ itself (R-02).
      from: { path: '^apps/api/', pathNot: '^apps/api/src/modules/[^/]+/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/',
        pathNot: '^apps/api/src/modules/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-dev-deps-in-production-code',
      severity: 'error',
      comment:
        'No workspace file other than tests and test-tooling config may depend on ' +
        'devDependencies, wherever it lives (src/, lib/, root config such as next.config.ts). ' +
        'Type-only imports are allowed (audit N-01, D-021).',
      from: {
        path: '^(apps|packages)/[^/]+/',
        pathNot: ['\\.test\\.tsx?$', TOOLING_CONFIG],
      },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    // H-01: third-party code and workspace build output stay in the graph as
    // dependency targets but are not followed. Nothing that can be the target
    // of a source import is excluded.
    doNotFollow: { path: ['node_modules', WORKSPACE_BUILD_OUTPUT] },
    // Every exclusion is anchored to a workspace location, so it can never
    // match a path inside node_modules (the H-01 defect).
    exclude: {
      path:
        '^tests/architecture/fixtures/' +
        '|^\\.turbo/' +
        '|^(apps|packages)/[^/]+/(\\.turbo|coverage|test-results|playwright-report)/' +
        '|^tests/(\\.turbo|coverage|test-results|playwright-report)/' +
        // Generated by Next.js (gitignored); it references .next/types by design.
        '|^apps/[^/]+/next-env\\.d\\.ts$',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
