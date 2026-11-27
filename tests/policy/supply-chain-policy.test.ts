import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkSupplyChainPolicy } from './supply-chain-policy.js';
import type { PolicyInput } from './supply-chain-policy.js';

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
