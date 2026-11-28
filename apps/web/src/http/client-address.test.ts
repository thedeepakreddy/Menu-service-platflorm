// Visitor attribution behind trusted proxies (D-038, D-037; Phase 3 M3.6 review).
import { describe, expect, it } from 'vitest';

import { webClientAddress } from './client-address';

describe('webClientAddress', () => {
  it.each([
    ['no trusted proxy: never trusts the header', '198.51.100.7', 0, 'unknown'],
    ['no header', null, 1, 'unknown'],
    ['one proxy: the entry it appended', '198.51.100.7', 1, '198.51.100.7'],
    ['one proxy: a forged prefix is ignored', '203.0.113.9, 198.51.100.7', 1, '198.51.100.7'],
    [
      'two proxies: second from the right',
      '203.0.113.9, 198.51.100.7, 10.0.0.2',
      2,
      '198.51.100.7',
    ],
    ['fewer entries than proxies', '198.51.100.7', 2, 'unknown'],
    ['garbage in the attributed slot', 'not-an-ip', 1, 'unknown'],
    ['IPv6', '2001:db8::1', 1, '2001:db8::1'],
  ] as const)('%s', (_name, header, hops, expected) => {
    expect(webClientAddress(header, hops)).toBe(expected);
  });

  it('a client cannot choose the shared bucket by sending a very long chain', () => {
    const forged = Array.from({ length: 200 }, (_, i) => `192.0.2.${String(i % 250)}`).join(',');
    expect(webClientAddress(`${forged}, 198.51.100.7`, 1)).toBe('198.51.100.7');
  });
});
