// Public/auth boundary (Phase 3 M3.5; P3-13; Doc 04 §21, Doc 03 §24): nothing a customer page or
// the proxy loads may reach the login/session code or its libraries. The walker follows every
// static and dynamic relative import transitively; a self-check proves it really finds auth code
// where it IS used, so the main assertion cannot pass vacuously.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;
const AUTH_DIR = join(SRC, 'auth') + sep;
const AUTH_ROUTES = join(SRC, 'app', 'auth') + sep;
const AUTH_PACKAGES = ['openid-client', 'jose'];
/** A package or any of its subpaths (`jose`, `jose/jwt/verify`). */
const isAuthPackage = (spec: string) =>
  AUTH_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`));
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function resolveRelative(from: string, spec: string): string | undefined {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/** Every file and package reachable from the entries. */
function closure(entries: string[]) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? '';
      if (spec.startsWith('.')) {
        const target = resolveRelative(file, spec);
        if (target === undefined) throw new Error(`unresolved ${spec} in ${file}`);
        queue.push(target);
      } else {
        packages.add(spec);
      }
    }
  }
  return { files, packages };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Customer-facing entry points: every route outside /auth, the root layout and the proxy. */
const PUBLIC_ENTRIES = [
  ...walk(join(SRC, 'app')).filter((f) => !f.startsWith(AUTH_ROUTES) && !/\.test\.tsx?$/.test(f)),
  join(SRC, 'proxy.ts'),
];

describe('public pages never reach auth code (P3-13)', () => {
  const { files, packages } = closure(PUBLIC_ENTRIES);

  it('covers the customer routes, the resolver and the proxy', () => {
    const rel = [...files].map((f) => relative(SRC, f));
    for (const expected of [
      'app/[tenant]/layout.tsx',
      'app/[tenant]/menu/page.tsx',
      'app/platform/locale/route.ts',
      'public/tenant-resolver.ts',
      'proxy.ts',
    ]) {
      expect(rel).toContain(expected);
    }
  });

  it('no file under src/auth is reachable', () => {
    const reached = [...files].filter((f) => f.startsWith(AUTH_DIR)).map((f) => relative(SRC, f));
    expect(reached).toEqual([]);
  });

  it('no login/token library is reachable', () => {
    expect([...packages].filter(isAuthPackage)).toEqual([]);
  });

  it('matches auth packages by subpath, and only the auth route directory is excluded', () => {
    expect(isAuthPackage('jose/jwt/verify')).toBe(true);
    expect(isAuthPackage('openid-client/passport')).toBe(true);
    expect(isAuthPackage('josefine')).toBe(false);
    expect(join(SRC, 'app', 'authors', 'page.tsx').startsWith(AUTH_ROUTES)).toBe(false);
  });

  it('self-check: the walker does find auth code from the login routes', () => {
    const login = closure(walk(AUTH_ROUTES));
    expect([...login.files].some((f) => f.startsWith(AUTH_DIR))).toBe(true);
    expect([...login.packages].some(isAuthPackage)).toBe(true);
  });
});
