// Module-boundary rules (Doc 02 §3, decision P-104). Paths are relative to
// the repository root (or a fixture root in the negative tests).
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
      name: 'production-code-must-not-import-tests',
      severity: 'error',
      from: { path: '^(apps|packages)/' },
      to: { path: '^tests/' },
    },
    {
      name: 'contracts-must-be-framework-free',
      severity: 'error',
      comment:
        'Contracts are shared by every app; they must not depend on a UI or server framework.',
      from: { path: '^packages/contracts/' },
      to: { path: 'node_modules/(react|react-dom|next|express|@nestjs)/' },
    },
    {
      name: 'api-module-encapsulation',
      severity: 'error',
      comment:
        "An API domain module may use another module only through that module's index.ts, never its internals.",
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
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
      comment: 'Runtime code must not depend on devDependencies.',
      from: {
        path: '^(apps|packages)/[^/]+/src/',
        pathNot: '\\.test\\.tsx?$',
      },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(^|/)(dist|\\.next|\\.turbo|coverage|test-results|playwright-report)/|^tests/architecture/fixtures/',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
