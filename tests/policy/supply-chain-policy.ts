// Supply-chain policy checks (D-005 provisional conditions, audit findings
// L-01, L-06 and L-10). Pure functions so that the negative cases can be
// unit-tested without touching the real configuration.

export const MIN_RELEASE_AGE_MINUTES = 10080; // 7 days

export type PolicyInput = {
  /** Effective pnpm settings, as reported by `pnpm config get <key> --json`. */
  minimumReleaseAge: unknown;
  minimumReleaseAgeExclude: unknown;
  engineStrict: unknown;
  /** Root package.json fields. */
  packageManager: unknown;
  enginesNode: unknown;
  /** Full text of docs/DECISIONS.md. */
  decisions: string;
};

/** Exact `name@version` only: no ranges, tags or wildcards (D-005). */
const EXACT_PACKAGE_VERSION =
  /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** Corepack integrity-pinned pnpm (L-06). */
const PINNED_PACKAGE_MANAGER = /^pnpm@\d+\.\d+\.\d+\+sha512\.[0-9a-f]{128}$/;

/** The D-005 override log section of docs/DECISIONS.md. */
export function overrideLog(decisions: string): string {
  const start = decisions.indexOf('**D-005 override log**');
  if (start === -1) return '';
  const end = decisions.indexOf('**Limits', start);
  return decisions.slice(start, end === -1 ? undefined : end);
}

/** Returns a list of policy violations; empty means compliant. */
export function checkSupplyChainPolicy(input: PolicyInput): string[] {
  const problems: string[] = [];

  if (
    typeof input.minimumReleaseAge !== 'number' ||
    input.minimumReleaseAge < MIN_RELEASE_AGE_MINUTES
  ) {
    problems.push(
      `minimumReleaseAge must be a number >= ${String(MIN_RELEASE_AGE_MINUTES)} (D-005)`,
    );
  }

  if (input.engineStrict !== true) {
    problems.push('engineStrict must be true (L-01)');
  }
  if (typeof input.enginesNode !== 'string' || input.enginesNode.length === 0) {
    problems.push('root package.json must declare engines.node (P-102)');
  }

  if (
    typeof input.packageManager !== 'string' ||
    !PINNED_PACKAGE_MANAGER.test(input.packageManager)
  ) {
    problems.push('packageManager must be pinned as pnpm@<x.y.z>+sha512.<hash> (L-06)');
  }

  const excludes = input.minimumReleaseAgeExclude;
  if (excludes !== null && excludes !== undefined) {
    if (!Array.isArray(excludes)) {
      problems.push('minimumReleaseAgeExclude must be a list (D-005)');
    } else {
      const log = overrideLog(input.decisions);
      for (const entry of excludes) {
        if (typeof entry !== 'string' || !EXACT_PACKAGE_VERSION.test(entry)) {
          problems.push(`exclusion ${JSON.stringify(entry)} is not an exact name@version (D-005)`);
          continue;
        }
        const row = log.split('\n').find((line) => line.includes(entry) && /OV-\d{3}/.test(line));
        if (row === undefined) {
          problems.push(`exclusion ${entry} has no OV-### row in the D-005 override log`);
        }
      }
    }
  }

  return problems;
}
