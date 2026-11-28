/**
 * Headline size for a venue name (Phase 3 M3.3). Display names may be up to 200 characters
 * (`publicTenantSchema`) and Hungarian words are long, so one size cannot fit every name: a short
 * name is set large like a sign, a long one steps down so that ordinary words never break mid-word
 * at 320 px. Only a word longer than the line itself (no real venue name) still wraps anywhere.
 */
export type NameSize = 'sign' | 'large' | 'medium' | 'small';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Length as a reader sees it: user-perceived characters, not UTF-16 code units. */
function visibleLength(text: string): number {
  return [...graphemes.segment(text)].length;
}

export function nameSize(name: string): NameSize {
  const longestWord = Math.max(0, ...name.split(/\s+/).map(visibleLength));
  const length = visibleLength(name);
  if (length <= 24 && longestWord <= 10) return 'sign';
  if (length <= 48 && longestWord <= 13) return 'large';
  if (length <= 96 && longestWord <= 18) return 'medium';
  return 'small';
}

/** Tailwind classes per size; each tier fits its longest word at 320 px (checked by screenshot). */
export const NAME_SIZE_CLASS: Record<NameSize, string> = {
  sign: 'text-[clamp(2.5rem,10vw,4.75rem)] leading-[1.02] tracking-[-0.03em]',
  large: 'text-[clamp(2rem,7.5vw,3.75rem)] leading-[1.05] tracking-[-0.025em]',
  medium: 'text-[clamp(1.625rem,6vw,3rem)] leading-[1.1] tracking-[-0.02em]',
  small: 'text-[clamp(1.375rem,5vw,2.25rem)] leading-[1.15] tracking-[-0.015em]',
};
