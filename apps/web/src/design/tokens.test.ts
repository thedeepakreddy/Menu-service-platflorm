// Design tokens (Phase 3 M3.2; D-040 O-3): one source of values, WCAG contrast for every pairing
// the UI uses, and no raw colour anywhere outside the token definitions.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COLOR_TOKENS, CONTRAST_REQUIREMENTS, FONT_SANS, contrastRatio } from './tokens';

const SRC = join(import.meta.dirname, '..');
const GLOBALS = join(SRC, 'app', 'globals.css');
const css = readFileSync(GLOBALS, 'utf8');

function themeBlock(): string {
  const match = /@theme\s*\{([\s\S]*?)\n\}/.exec(css);
  if (match?.[1] === undefined) throw new Error('globals.css has no @theme block');
  return match[1];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('token values', () => {
  it('globals.css declares exactly the colour tokens of tokens.ts, with the same values', () => {
    const declared: Record<string, string> = {};
    for (const m of themeBlock().matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)) {
      declared[m[1] ?? ''] = m[2] ?? '';
    }
    expect(declared).toEqual(COLOR_TOKENS);
  });

  it('the default Tailwind palette is removed, so raw palette utilities cannot be built', () => {
    expect(themeBlock()).toMatch(/--color-\*:\s*initial;/);
  });

  it('every colour token is a lower-case #rrggbb value', () => {
    for (const value of Object.values(COLOR_TOKENS)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('the font stack matches and loads no web font', () => {
    const normalize = (s: string) => s.replace(/['"\s]/g, '');
    const declared = /--font-sans:\s*([^;]+);/.exec(themeBlock())?.[1] ?? '';
    expect(normalize(declared)).toBe(normalize(FONT_SANS));
    expect(css).not.toMatch(/@font-face|fonts\.googleapis|url\(/);
  });
});

describe('contrast (WCAG 2.2 AA; Doc 01 §15)', () => {
  it('the focus ring is drawn outside the element, on the surrounding surface', () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/outline:\s*3px solid var\(--color-focus\)/);
    expect(rule).toMatch(/outline-offset:\s*3px/);
  });

  it('the ratio function matches known reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it.each(CONTRAST_REQUIREMENTS.map((r) => [r.fg, r.bg, r.min] as const))(
    '%s on %s ≥ %s:1',
    (fg, bg, min) => {
      expect(contrastRatio(COLOR_TOKENS[fg], COLOR_TOKENS[bg])).toBeGreaterThanOrEqual(min);
    },
  );
});

describe('no raw colours outside the tokens', () => {
  const allowed = new Set([GLOBALS, join(SRC, 'design', 'tokens.ts')]);
  const files = sourceFiles(SRC).filter((f) => !allowed.has(f));
  const palette =
    'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
  const forbidden: [string, RegExp][] = [
    ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/],
    ['colour function', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/],
    ['arbitrary colour utility', /\b[a-z-]+-\[(?:#|rgb|hsl|oklch|color)/],
    ['Tailwind palette utility', new RegExp(`\\b[a-z-]+-(?:${palette})(?:-\\d{2,3})?\\b`)],
  ];

  it('scans a non-trivial set of files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each([
    'className="text-neutral-700"',
    'className="bg-white"',
    'className="hover:bg-red-500"',
    'className="bg-[#fff]"',
    "style={{ color: '#ffcc00' }}",
    "style={{ color: 'rgb(1 2 3)' }}",
  ])('the patterns catch %s', (sample) => {
    expect(forbidden.some(([, pattern]) => pattern.test(sample))).toBe(true);
  });

  it.each(['className="bg-surface text-ink-muted"', 'href="#main"', 'border-line-strong'])(
    'the patterns allow %s',
    (sample) => {
      expect(forbidden.some(([, pattern]) => pattern.test(sample))).toBe(false);
    },
  );

  for (const [name, pattern] of forbidden) {
    it(`no ${name} in components`, () => {
      const offenders = files.flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => [line, i] as const)
          .filter(
            ([line]) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'),
          )
          .filter(([line]) => pattern.test(line))
          .map(([line, i]) => `${relative(SRC, file)}:${String(i + 1)}: ${line.trim()}`),
      );
      expect(offenders).toEqual([]);
    });
  }
});
