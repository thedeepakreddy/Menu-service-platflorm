import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { cruise } from 'dependency-cruiser';
import type { ICruiseResult, IConfiguration } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('./dependency-cruiser.config.cjs') as IConfiguration;

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('./fixtures/violations/', import.meta.url));

async function run(baseDir: string, paths: string[]): Promise<ICruiseResult> {
  const result = await cruise(
    paths,
    {
      ...config.options,
      baseDir,
      ruleSet: { forbidden: config.forbidden ?? [] },
      validate: true,
    },
    undefined,
    { tsConfig: { fileName: `${repoRoot}tsconfig.base.json` } },
  );
  if (typeof result.output === 'string') {
    throw new Error('Unexpected string output from dependency-cruiser');
  }
  return result.output;
}

function violations(result: ICruiseResult): string[] {
  return result.summary.violations.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`);
}

describe('architecture boundaries', () => {
  it('the repository has no boundary violations', async () => {
    const result = await run(repoRoot, ['apps', 'packages', 'tests/architecture', 'tests/e2e']);
    expect(violations(result)).toEqual([]);
    // Guard against a vacuous pass: the real sources must actually be cruised.
    const sources = result.modules.map((m) => m.source);
    expect(sources).toContain('apps/api/src/main.ts');
    expect(sources).toContain('apps/web/src/app/page.tsx');
    expect(sources).toContain('packages/contracts/src/index.ts');
  });

  describe('each rule rejects a deliberate violation', () => {
    let result: ICruiseResult | undefined;
    const get = async () => {
      // Fixture paths are relative to fixtureRoot, so the repo-level fixture exclusion does not apply.
      result ??= await run(fixtureRoot, ['apps', 'packages']);
      return violations(result);
    };

    it.each([
      ['no-cross-app-imports', 'apps/web/src/cross-app.ts -> apps/api/src/secret.ts'],
      [
        'packages-must-not-import-apps',
        'packages/shared/src/imports-app.ts -> apps/web/src/page.ts',
      ],
      ['no-deep-package-imports', 'apps/web/src/deep-import.ts -> packages/shared/src/internal.ts'],
      [
        'api-module-encapsulation',
        'apps/api/src/modules/alpha/alpha.service.ts -> apps/api/src/modules/beta/beta.service.ts',
      ],
      ['no-circular', 'packages/shared/src/cycle-a.ts -> packages/shared/src/cycle-b.ts'],
      ['not-to-unresolvable', 'packages/shared/src/unresolvable.ts -> ./does-not-exist'],
      [
        'contracts-must-be-framework-free',
        'packages/contracts/src/uses-react.ts -> packages/contracts/node_modules/react/index.js',
      ],
    ])('%s', async (rule, edge) => {
      expect(await get()).toContain(`${rule}: ${edge}`);
    });

    it('allows importing another API module through its index.ts', async () => {
      const found = await get();
      expect(found.filter((v) => v.includes('modules/beta/index.ts'))).toEqual([]);
    });
  });
});
