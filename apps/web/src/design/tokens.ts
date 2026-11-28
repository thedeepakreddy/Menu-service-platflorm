/**
 * Platform design tokens and the one default preset (Phase 3; D-040 O-3, O-9; Doc 01 §15).
 *
 * Components use only these semantic roles (`bg-surface`, `text-ink-muted`, `border-line`, …),
 * never raw colours, so a later approved theme mechanism can swap the values in one place. There
 * is no tenant theme selection, storage or schema (O-3): this is the platform default only.
 *
 * `apps/web/src/app/globals.css` declares the same values in its `@theme` block; a test keeps the
 * two identical and checks every text/background pairing against WCAG 2.2 contrast minimums.
 *
 * The preset ("Porcelain"): cool porcelain surfaces, green-black ink and a bottle-green accent, the
 * colours of a well-kept dining room (table linen, glassware, a painted shopfront). Quiet enough to
 * sit behind any venue's own content; legible in dim or bright light.
 */
export const COLOR_TOKENS = {
  /** Page background. */
  surface: '#f6f6f3',
  /** Cards and raised panels. */
  'surface-raised': '#ffffff',
  /** Recessed areas: navigation bar, empty-state art backdrop. */
  'surface-sunken': '#eaece7',
  /** Primary text. */
  ink: '#17211c',
  /** Secondary text. */
  'ink-muted': '#48544d',
  /** Tertiary text (hints, captions); still meets 4.5:1 on every surface. */
  'ink-subtle': '#5a6660',
  /** Decorative dividers only (never the sole boundary of a control). */
  line: '#dce0da',
  /** Boundaries of interactive controls (3:1 against surfaces, WCAG 1.4.11). */
  'line-strong': '#78837c',
  /** Brand accent: links, active navigation, primary buttons. */
  accent: '#1f5c45',
  /** Accent hover / pressed. */
  'accent-strong': '#174836',
  /** Text and icons on the accent colour. */
  'on-accent': '#ffffff',
  /** Tinted accent background (selected tab, illustration fill). */
  'accent-soft': '#dcebe2',
  /** Accent-coloured text on the tinted background. */
  'accent-ink': '#174836',
  /** Keyboard focus ring (3:1 against every surface). */
  focus: '#1d4ed8',
  /** Error text. */
  danger: '#b42318',
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;

/**
 * Required contrast for every foreground/background pairing the UI uses. Text: 4.5:1 (WCAG 1.4.3,
 * AA). Control boundaries and focus indicators: 3:1 (WCAG 1.4.11, 2.4.13).
 */
export const CONTRAST_REQUIREMENTS: readonly {
  fg: ColorToken;
  bg: ColorToken;
  min: number;
}[] = [
  ...(['surface', 'surface-raised', 'surface-sunken'] as const).flatMap((bg) => [
    { fg: 'ink' as const, bg, min: 7 },
    { fg: 'ink-muted' as const, bg, min: 4.5 },
    { fg: 'ink-subtle' as const, bg, min: 4.5 },
    { fg: 'accent' as const, bg, min: 4.5 },
    { fg: 'danger' as const, bg, min: 4.5 },
    { fg: 'line-strong' as const, bg, min: 3 },
    { fg: 'focus' as const, bg, min: 3 },
  ]),
  { fg: 'on-accent', bg: 'accent', min: 4.5 },
  { fg: 'on-accent', bg: 'accent-strong', min: 4.5 },
  { fg: 'accent-ink', bg: 'accent-soft', min: 4.5 },
  { fg: 'ink', bg: 'accent-soft', min: 4.5 },
  { fg: 'focus', bg: 'accent-soft', min: 3 },
  // The focus ring is offset outside the element (`outline-offset` in globals.css), so it is drawn
  // on the surrounding surface, never on an accent-filled control: `focus` vs `accent` is not a
  // pairing that occurs. A test keeps the offset in place.
];

/** System font stack: no web-font download, no third-party font host, every glyph Hungarian needs. */
export const FONT_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

/** WCAG 2.x relative-luminance contrast ratio of two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = channels.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}
