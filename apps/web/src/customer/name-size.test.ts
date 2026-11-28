// Venue-name headline sizing (Phase 3 M3.3): short names are set large, long names and long
// words step down so ordinary words never break mid-word on a 320 px screen.
import { describe, expect, it } from 'vitest';

import { nameSize } from './name-size';

describe('nameSize', () => {
  it.each([
    ['E2E Cafe', 'sign'],
    ['Café Roma', 'sign'],
    ['Kávéház a Sarkon', 'sign'],
    ['Hagyományőrző Kávéház', 'large'],
    ['The Old Harbour Fish and Chip Restaurant', 'large'],
    ['Legendás Hagyományőrző Kézműves Kávéház és Cukrászda a Régi Piactér Sarkán', 'medium'],
    ['Egészségszolgáltatásmegszervezhetetlenség', 'small'],
    ['x'.repeat(200), 'small'],
  ])('%s → %s', (name, expected) => {
    expect(nameSize(name)).toBe(expected);
  });

  it('counts what a reader sees, not UTF-16 code units', () => {
    expect(nameSize('🍷'.repeat(10))).toBe('sign');
    // Ten flags: each is two code points and four UTF-16 units, but one visible character.
    expect(nameSize('🇭🇺'.repeat(10))).toBe('sign');
  });
});
