import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * Source directories of the real repository (what `pnpm arch` cruises). All of
 * tests/ is included (audit R-04); its fixtures are excluded by the config.
 */
const REPO_PATHS = ['apps', 'packages', 'tests'];

/** Same test-file convention as the config's TEST_FILE (R-01). */
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/__tests__\/)/;

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
    // R-02: files directly under src/modules/ (a registry and a re-exporting barrel).
    'apps/api/src/modules/barrel.ts',
    'apps/api/src/modules/registry.ts',
    'apps/api/src/root.test.ts',
    'apps/api/vitest.config.ts',
  ],
  // R-01: re-export, value, type-only, dynamic and `typeof import()` forms, plus
  // the *.spec.*, __tests__/ and .tsx naming conventions.
  'no-runtime-imports-of-test-files': [
    'apps/api/src/dynamic.ts',
    'apps/api/src/type-only.ts',
    'apps/api/src/type-query.ts',
    'apps/api/src/uses-spec.ts',
    'apps/api/src/uses-tests-dir.ts',
    // N-01: test-tooling config is exempt from the devDependency rule, so it is not importable.
    'apps/api/src/uses-tooling-config.ts',
    'apps/api/src/value.ts',
    'apps/web/src/component.tsx',
    'packages/contracts/src/laundered.ts',
  ],
  'not-to-unresolvable': ['packages/shared/src/unresolvable.ts'],
  // F-02: undeclared packages (typed npm-no-pkg), e.g. a hoisted root devDependency,
  // in every import form and every workspace location, tests included.
  'no-undeclared-dependencies': [
    'apps/api/src/dynamic-undeclared.ts',
    'apps/api/src/type-only-undeclared.ts',
    'apps/api/src/uses-root-devdep.ts',
    'apps/web/lib/uses-root-devdep.ts',
    'packages/shared/src/uses-phantom.ts',
    'tests/helper.test.ts',
  ],

  'no-dev-deps-in-production-code': [
    'apps/api/src/dynamic-dev.ts',
    'apps/api/src/uses-dev.ts',
    // N-01: runtime files outside src/, including runtime config.
    'apps/web/lib/helper.ts',
    'apps/web/next.config.ts',
  ],
};

describe('rule inventory', () => {
  // Found while verifying F-02: a rule downgraded to `warn` still reports in the
  // fixtures, but `pnpm arch` exits 0 on warnings, so CI would stop enforcing it.
  it('every rule is an error, so `pnpm arch` fails on any violation', () => {
    expect(rules.filter((rule) => rule.severity !== 'error').map((rule) => rule.name)).toEqual([]);
  });

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
        // N-01 positive cases: tooling config may use devDependencies; lib/ may use dependencies.
        'apps/api/vitest.config.ts',
        'apps/web/lib/util.ts',
      ]),
    );
    const deps = result.modules.flatMap((m) => m.dependencies);
    expect(deps.length).toBeGreaterThanOrEqual(9);
    expect(deps.filter((d) => d.couldNotResolve)).toEqual([]);
  });
});

describe('architecture CLI scope (audit N-02)', () => {
  /** Positional (scan-target) arguments of the depcruise invocation in a script. */
  function depcruiseTargets(script: string): string[] {
    const tokens = script
      .slice(script.indexOf('depcruise') + 'depcruise'.length)
      .trim()
      .split(/\s+/);
    const targets: string[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i] ?? '';
      if (token === '&&' || token === ';') break;
      if (token.startsWith('--')) {
        // --flag value, unless written as --flag=value.
        if (!token.includes('=')) i += 1;
        continue;
      }
      targets.push(token.replace(/\/+$/, ''));
    }
    return targets;
  }

  const pkg = JSON.parse(readFileSync(`${repoRoot}tests/package.json`, 'utf8')) as {
    scripts: Record<string, string>;
  };
  const archScript = pkg.scripts.arch ?? '';

  it('`pnpm arch` scans exactly the directories the real-tree tests scan', () => {
    expect(archScript).toContain('depcruise');
    expect(archScript).toContain('--config tests/architecture/dependency-cruiser.config.cjs');
    expect([...depcruiseTargets(archScript)].sort()).toEqual([...REPO_PATHS].sort());
  });

  it('the scan scope covers every workspace root declared in pnpm-workspace.yaml', () => {
    const workspace = readFileSync(`${repoRoot}pnpm-workspace.yaml`, 'utf8');
    const roots = [...workspace.matchAll(/^\s+-\s+['"]?([^/'"*\s]+)/gm)].map((m) => m[1]);
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) expect(REPO_PATHS).toContain(root);
  });

  it('CI runs the architecture CLI', () => {
    const ci = readFileSync(`${repoRoot}.github/workflows/ci.yml`, 'utf8');
    expect(ci).toMatch(/^\s+run: pnpm arch\s*$/m);
  });

  // Audit F-10: a gate that is run but whose failure is swallowed is not a gate.
  it('every required gate runs in CI and no CI step can swallow a failure', () => {
    const ci = readFileSync(`${repoRoot}.github/workflows/ci.yml`, 'utf8');
    for (const gate of [
      'pnpm install --frozen-lockfile',
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm arch',
      'pnpm build',
      'pnpm test:e2e',
    ]) {
      expect(ci).toMatch(
        new RegExp(`^\\s+run: ${gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'),
      );
    }
    expect(ci).not.toMatch(/continue-on-error/);
    expect(ci).not.toMatch(/\|\|\s*(true|:|exit 0)/);
    expect(ci).not.toMatch(/^\s+if:\s*(false|always\(\))/m);
  });

  /** Splits a regex source on `|` at group depth 0, honouring escapes and character classes. */
  function topLevelAlternatives(source: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inClass = false;
    let current = '';
    for (let i = 0; i < source.length; i += 1) {
      const ch = source.charAt(i);
      if (ch === '\\') {
        current += ch + source.charAt(i + 1);
        i += 1;
        continue;
      }
      if (inClass) {
        if (ch === ']') inClass = false;
      } else if (ch === '[') inClass = true;
      else if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === '|' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    parts.push(current);
    return parts;
  }

  it('the alternative splitter is not vacuous', () => {
    expect(topLevelAlternatives('^a/(b|c)/|^d[|]e|x\\|y|node_modules/')).toEqual([
      '^a/(b|c)/',
      '^d[|]e',
      'x\\|y',
      'node_modules/',
    ]);
  });

  it('every configured exclusion is anchored to a workspace path (H-01)', () => {
    const exclude = config.options?.exclude;
    const pattern = typeof exclude === 'object' && !Array.isArray(exclude) ? exclude.path : exclude;
    expect(typeof pattern).toBe('string');
    const alternatives = topLevelAlternatives(String(pattern));
    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives.filter((alternative) => !alternative.startsWith('^'))).toEqual([]);
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
        // R-04: every tests/ area is scanned, not only architecture/ and e2e/.
        'tests/startup/env-rejection.test.ts',
        'tests/policy/supply-chain-policy.ts',
        'tests/vitest.config.ts',
      ]),
    );
    // ...and the fixtures must not be.
    expect(sources(result).filter((s) => s.startsWith('tests/architecture/fixtures/'))).toEqual([]);
  });

  it('no non-test workspace file reaches a test file through any chain of imports (R-01)', async () => {
    const result = await run(repoRoot, REPO_PATHS);
    const byId = new Map(result.modules.map((m) => [m.source, m]));
    const isWorkspace = (s: string) => /^(apps|packages)\//.test(s);
    const runtimeRoots = result.modules
      .map((m) => m.source)
      .filter((s) => isWorkspace(s) && !TEST_FILE.test(s));
    expect(runtimeRoots.length).toBeGreaterThan(0);
    const reached = new Set<string>();
    const queue = [...runtimeRoots];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined || reached.has(current)) continue;
      reached.add(current);
      for (const dep of byId.get(current)?.dependencies ?? []) {
        if (isWorkspace(dep.resolved)) queue.push(dep.resolved);
      }
    }
    expect([...reached].filter((s) => TEST_FILE.test(s))).toEqual([]);
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
        /^tests\/(architecture|e2e|startup|policy)\//.test(e.from);
      const key = (e: Edge) => `${e.from} -> ${e.resolved}`;
      const configured = new Set((await edges(config.options)).filter(isSource).map(key));
      const baseline = (await edges(baselineOptions)).filter(isSource).map(key);
      expect(baseline.length).toBeGreaterThan(0);
      expect(baseline.filter((k) => !configured.has(k))).toEqual([]);
    });
  });
});
