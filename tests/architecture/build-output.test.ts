// Audit R-01 outcome check: production build output must contain no test
// files. A runtime import of a test file (now rejected by the
// no-runtime-imports-of-test-files rule) would make tsc emit that test file
// into dist/, even though tsconfig.build.json excludes test files, because
// `exclude` only filters entry points. Runs against the real build output;
// turbo builds every workspace package before this suite (`^build`).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Node-run build outputs (the web app's .next output is produced by Next.js). */
const BUILD_OUTPUTS = ['packages/contracts/dist', 'apps/api/dist'];

const TEST_ARTIFACT = /\.(test|spec)\.[cm]?[jt]sx?(\.map)?$|\.(test|spec)\.d\.[cm]?ts(\.map)?$/;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe.each(BUILD_OUTPUTS)('build output %s', (relative) => {
  const dir = join(repoRoot, relative);

  it('exists and is not empty (guards against a vacuous pass)', () => {
    expect(existsSync(dir)).toBe(true);
    expect(listFiles(dir).filter((f) => f.endsWith('.js')).length).toBeGreaterThan(0);
  });

  it('contains no emitted test files and no __tests__ directory', () => {
    const offending = listFiles(dir)
      .map((f) => f.slice(dir.length + 1))
      .filter((f) => TEST_ARTIFACT.test(f) || f.split('/').includes('__tests__'));
    expect(offending).toEqual([]);
  });
});
