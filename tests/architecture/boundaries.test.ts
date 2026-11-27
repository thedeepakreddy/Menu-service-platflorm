import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { cruise } from 'dependency-cruiser';
import type { ICruiseResult, IConfiguration, IForbiddenRuleType } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('./dependency-cruiser.config.cjs') as IConfiguration;
const rules: IForbiddenRuleType[] = config.forbidden ?? [];
const ruleNames = rules.map((rule) => rule.name ?? '(unnamed)');

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturesRoot = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Source directories of the real repository (what `pnpm arch` cruises). */
const REPO_PATHS = ['apps', 'packages', 'tests/architecture', 'tests/e2e'];

async function run(
  baseDir: string,
  paths: string[],
  forbidden: IForbiddenRuleType[] = rules,
  options: IConfiguration['options'] = config.options,
): Promise<ICruiseResult> {
  const result = await cruise(
    paths,
    { ...options, baseDir, ruleSet: { forbidden }, validate: true },
    undefined,
    { tsConfig: { fileName: `${repoRoot}tsconfig.base.json` } },
  );
  if (typeof result.output === 'string') {
    throw new Error('Unexpected string output from dependency-cruiser');
  }
  return result.output;
}

type Violation = { rule: string; from: string; to: string };

function violations(result: ICruiseResult): Violation[] {
  return result.summary.violations.map((v) => ({ rule: v.rule.name, from: v.from, to: v.to }));
}

function sources(result: ICruiseResult): string[] {
  return result.modules.map((m) => m.source);
}

/** Top-level directories inside a fixture tree (what gets cruised). */
function topLevel(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * For each rule: the files in its fixture tree that must be reported, and
 * only those. Value, type-only and dynamic import forms are covered wherever
 * they apply to the rule.
 */
const EXPECTED: Record<string, string[]> = {
  // dependency-cruiser reports a cycle once, from the first module reached.
  'no-circular': ['packages/shared/src/cycle-a.ts'],
  'no-cross-app-imports': [
    'apps/web/src/dynamic.ts',
    'apps/web/src/type-only.ts',
    'apps/web/src/value.ts',
  ],
  'packages-must-not-import-apps': ['packages/shared/src/imports-app.ts'],
  'no-deep-package-imports': ['apps/web/src/deep.ts'],
  'no-workspace-build-output-imports': [
    'apps/web/src/dynamic.ts',
    'apps/web/src/own-next-output.ts',
    'apps/web/src/type-only.ts',
    'apps/web/src/value.ts',
    'packages/other/src/uses-dist.ts',
  ],
  'production-code-must-not-import-tests': [
    'apps/api/src/uses-tests.ts',
    'packages/shared/src/uses-tests.ts',
  ],
  'contracts-allowlist': [
    'packages/contracts/src/uses-framework-types.ts',
    'packages/contracts/src/uses-http-client.ts',
    'packages/contracts/src/uses-node-builtin.ts',
    'packages/contracts/src/uses-orm.ts',
    'packages/contracts/src/uses-other-package.ts',
  ],
  'web-no-db-clients': [
    'apps/web/src/dynamic-cache-client.ts',
    'apps/web/src/uses-orm-types.ts',
    'apps/web/src/uses-pg.ts',
  ],
  'api-module-encapsulation': [
    'apps/api/src/modules/alpha/dynamic.ts',
    'apps/api/src/modules/alpha/type-only.ts',
    'apps/api/src/modules/alpha/value.ts',
  ],
  'api-module-entry-only': [
    'apps/api/src/bootstrap/create-app.ts',
    'apps/api/src/main.ts',
    'apps/api/src/root.test.ts',
    'apps/api/vitest.config.ts',
  ],
  'not-to-unresolvable': ['packages/shared/src/unresolvable.ts'],
  'no-dev-deps-in-production-code': ['apps/api/src/dynamic-dev.ts', 'apps/api/src/uses-dev.ts'],
};

describe('rule inventory', () => {
  it('every configured rule has expectations and a fixture tree, and vice versa', () => {
    const fixtureDirs = topLevel(`${fixturesRoot}rules`).sort();
    expect([...ruleNames].sort()).toEqual(fixtureDirs);
    expect(Object.keys(EXPECTED).sort()).toEqual(fixtureDirs);
  });
});

describe.each(ruleNames)('rule %s', (ruleName) => {
  const root = `${fixturesRoot}rules/${ruleName}/`;
  const expectedFrom = EXPECTED[ruleName] ?? [];

  it('fixture files are actually part of the cruised graph', async () => {
    const result = await run(root, topLevel(root));
    expect(sources(result)).toEqual(expect.arrayContaining(expectedFrom));
  });

  it('rejects the deliberate violations, and only via this rule', async () => {
    const found = violations(await run(root, topLevel(root)));
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found.map((v) => v.rule))).toEqual(new Set([ruleName]));
    expect([...new Set(found.map((v) => v.from))].sort()).toEqual(expectedFrom);
  });

  it('passes once the rule is removed (the rule is what catches it)', async () => {
    const withoutRule = rules.filter((rule) => rule.name !== ruleName);
    expect(violations(await run(root, topLevel(root), withoutRule))).toEqual([]);
  });
});

describe('valid architecture fixture', () => {
  const root = `${fixturesRoot}valid/`;

  it('allowed patterns produce no violations and fully resolve', async () => {
    const result = await run(root, topLevel(root));
    expect(violations(result)).toEqual([]);
    expect(sources(result)).toEqual(
      expect.arrayContaining([
        'apps/api/src/main.ts',
        'apps/api/src/main.test.ts',
        'apps/api/src/modules/alpha/alpha.service.ts',
        'packages/contracts/src/schema.ts',
        'apps/web/src/page.ts',
      ]),
    );
    const deps = result.modules.flatMap((m) => m.dependencies);
    expect(deps.length).toBeGreaterThanOrEqual(9);
    expect(deps.filter((d) => d.couldNotResolve)).toEqual([]);
  });
});

describe('real repository', () => {
  it('has no boundary violations', async () => {
    const result = await run(repoRoot, REPO_PATHS);
    expect(violations(result)).toEqual([]);
    // Guard against a vacuous pass: the real sources must actually be cruised...
    expect(sources(result)).toEqual(
      expect.arrayContaining([
        'apps/api/src/main.ts',
        'apps/web/src/app/page.tsx',
        'packages/contracts/src/index.ts',
      ]),
    );
    // ...and the fixtures must not be.
    expect(sources(result).filter((s) => s.startsWith('tests/architecture/fixtures/'))).toEqual([]);
  });

  describe('graph integrity (H-01)', () => {
    type Edge = { from: string; module: string; resolved: string; types: string[] };

    async function edges(options: IConfiguration['options']): Promise<Edge[]> {
      const result = await run(repoRoot, REPO_PATHS, rules, options);
      return result.modules.flatMap((m) =>
        m.dependencies.map((d) => ({
          from: m.source,
          module: d.module,
          resolved: d.resolved,
          types: d.dependencyTypes,
        })),
      );
    }

    it('third-party and workspace dependencies are present with their real types', async () => {
      const all = await edges(config.options);
      const find = (from: string, module: string) =>
        all.find((e) => e.from === from && e.module === module);

      expect(find('apps/web/src/app/layout.tsx', 'next')?.resolved).toMatch(/node_modules\/next\//);
      expect(find('apps/api/src/app.test.ts', 'vitest')?.types).toContain('npm-dev');
      expect(find('packages/contracts/src/health.ts', 'zod')?.resolved).toMatch(
        /node_modules\/zod\//,
      );
      expect(
        find('apps/api/src/modules/health/health.controller.ts', '@nestjs/common')?.types,
      ).toContain('npm');
      // A workspace package consumed by name resolves into its build output
      // but is not a local (path) import, so M-01 does not flag it.
      const contracts = find('apps/api/src/request-id.ts', '@platform/contracts');
      expect(contracts?.resolved).toMatch(/^packages\/contracts\/dist\//);
      expect(contracts?.types).not.toContain('local');
    });

    it('the configured exclusions drop no dependency edge from source files', async () => {
      // Baseline: the same options with nothing excluded except the fixtures.
      // If an exclusion ever matches a dependency target (as the original
      // unanchored `dist/` pattern did for npm packages), edges go missing
      // from the configured graph and this comparison fails.
      const baselineOptions = {
        ...config.options,
        exclude: { path: '^tests/architecture/fixtures/' },
      };
      const isSource = (e: Edge) =>
        /^(apps|packages)\/[^/]+\/src\//.test(e.from) ||
        /^tests\/(architecture|e2e)\//.test(e.from);
      const key = (e: Edge) => `${e.from} -> ${e.resolved}`;
      const configured = new Set((await edges(config.options)).filter(isSource).map(key));
      const baseline = (await edges(baselineOptions)).filter(isSource).map(key);
      expect(baseline.length).toBeGreaterThan(0);
      expect(baseline.filter((k) => !configured.has(k))).toEqual([]);
    });
  });
});
