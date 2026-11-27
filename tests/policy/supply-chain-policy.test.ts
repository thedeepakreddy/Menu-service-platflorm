import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkSupplyChainPolicy, findPolicyOverrides } from './supply-chain-policy.js';
import type { PolicyInput, TextFile } from './supply-chain-policy.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Effective pnpm setting for this repository (reads pnpm-workspace.yaml). */
function pnpmSetting(key: string): unknown {
  const out = execFileSync('pnpm', ['config', 'get', key, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  }).trim();
  return out === '' || out === 'undefined' ? undefined : (JSON.parse(out) as unknown);
}

const SAMPLE_HASH = 'a'.repeat(128);
const compliant: PolicyInput = {
  minimumReleaseAge: 10080,
  minimumReleaseAgeExclude: null,
  engineStrict: true,
  packageManager: `pnpm@12.22.0+sha512.${SAMPLE_HASH}`,
  enginesNode: '>=24.22.3 <25',
  decisions: '**D-005 override log**\n| — | — |\n**Limits (what D-005 does not cover).**',
};
const logWith = (row: string) =>
  `**D-005 override log**\n| Id | Date | Package@version |\n${row}\n**Limits (what D-005 does not cover).**`;

describe('supply-chain policy checker (negative cases)', () => {
  it('accepts a compliant configuration', () => {
    expect(checkSupplyChainPolicy(compliant)).toEqual([]);
  });

  it.each([
    ['release age lowered', { minimumReleaseAge: 1440 }, /minimumReleaseAge/],
    ['release age removed', { minimumReleaseAge: undefined }, /minimumReleaseAge/],
    ['engine-strict disabled', { engineStrict: false }, /engineStrict/],
    ['engines.node missing', { enginesNode: undefined }, /engines\.node/],
    ['packageManager without hash', { packageManager: 'pnpm@12.22.0' }, /packageManager/],
    ['wildcard exclusion', { minimumReleaseAgeExclude: ['@nestjs/*'] }, /exact name@version/],
    ['range exclusion', { minimumReleaseAgeExclude: ['zod@^4.0.0'] }, /exact name@version/],
    [
      'package-wide exclusion',
      { minimumReleaseAgeExclude: ['@nestjs/common'] },
      /exact name@version/,
    ],
    [
      'exclusion missing from the override log',
      { minimumReleaseAgeExclude: ['@nestjs/common@12.6.3'] },
      /no OV-### row/,
    ],
  ])('rejects: %s', (_label, change, message) => {
    const problems = checkSupplyChainPolicy({ ...compliant, ...change });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(message);
  });

  it('accepts an exact exclusion that has an override-log row', () => {
    const problems = checkSupplyChainPolicy({
      ...compliant,
      minimumReleaseAgeExclude: ['@nestjs/common@12.6.3'],
      decisions: logWith(
        '| OV-001 | 2026-11-27 | `@nestjs/common@12.6.3` | CVE fix | owner | … | |',
      ),
    });
    expect(problems).toEqual([]);
  });
});

describe('supply-chain policy (this repository)', () => {
  it('pnpm-workspace.yaml, package.json and the D-005 override log comply', () => {
    const pkg = JSON.parse(readFileSync(`${repoRoot}package.json`, 'utf8')) as {
      packageManager?: unknown;
      engines?: { node?: unknown };
    };
    const problems = checkSupplyChainPolicy({
      minimumReleaseAge: pnpmSetting('minimumReleaseAge'),
      minimumReleaseAgeExclude: pnpmSetting('minimumReleaseAgeExclude'),
      engineStrict: pnpmSetting('engineStrict'),
      packageManager: pkg.packageManager,
      enginesNode: pkg.engines?.node,
      decisions: readFileSync(`${repoRoot}docs/DECISIONS.md`, 'utf8'),
    });
    expect(problems).toEqual([]);
  });
});

describe('per-command policy overrides (R-06, negative cases)', () => {
  const workflow = (text: string): TextFile[] => [{ path: 'ci.yml', text }];
  const pkg = (scripts: Record<string, string>): TextFile[] => [
    { path: 'package.json', text: JSON.stringify({ scripts }) },
  ];

  it('accepts a clean workflow and scripts', () => {
    expect(
      findPolicyOverrides(
        workflow('steps:\n  - run: pnpm install --frozen-lockfile'),
        pkg({ build: 'turbo run build' }),
      ),
    ).toEqual([]);
  });

  it.each([
    ['step-level env var', "    env:\n      pnpm_config_minimum_release_age: '0'"],
    ['CLI flag', '      run: pnpm install --frozen-lockfile --config.minimumReleaseAge=0'],
    ['kebab-case flag', '      run: pnpm install --config.minimum-release-age=0'],
    ['exclusion via CLI', '      run: pnpm install --config.minimumReleaseAgeExclude=foo@1.0.0'],
    ['engine-strict disabled', "      env:\n        pnpm_config_engine_strict: 'false'"],
  ])('rejects a workflow %s', (_label, text) => {
    expect(findPolicyOverrides(workflow(text), [])).toHaveLength(1);
  });

  it('rejects a package.json script override', () => {
    expect(
      findPolicyOverrides([], pkg({ ci: 'pnpm install --config.minimumReleaseAge=0' })),
    ).toEqual(['package.json script "ci" overrides a supply-chain setting (R-06)']);
  });
});

describe('per-command policy overrides (this repository)', () => {
  it('no workflow or workspace package.json script overrides a supply-chain setting', () => {
    const read = (path: string): TextFile => ({
      path,
      text: readFileSync(`${repoRoot}${path}`, 'utf8'),
    });
    const workflows = readdirSync(`${repoRoot}.github/workflows`)
      .filter((name) => /\.ya?ml$/.test(name))
      .map((name) => read(`.github/workflows/${name}`));
    const workspaceDirs = ['apps', 'packages'].flatMap((dir) =>
      readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${dir}/${entry.name}`),
    );
    const packageJsons = [
      'package.json',
      'tests/package.json',
      ...workspaceDirs.map((d) => `${d}/package.json`),
    ].map(read);
    expect(workflows.length).toBeGreaterThan(0);
    expect(packageJsons.length).toBeGreaterThanOrEqual(5);
    expect(findPolicyOverrides(workflows, packageJsons)).toEqual([]);
  });
});
