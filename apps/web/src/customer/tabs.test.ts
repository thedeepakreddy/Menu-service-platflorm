// Customer tabs (Phase 3; D-040 O-4): four fixed tabs, each a real page of the same tenant.
import { describe, expect, it } from 'vitest';

import { TABS, activeTab, tabHref } from './tabs';

describe('tabs', () => {
  it('are exactly Home, Menu, Offers and Info, in that order (O-4)', () => {
    expect(TABS).toEqual(['home', 'menu', 'offers', 'info']);
  });

  it('link only within the same tenant', () => {
    expect(TABS.map((t) => tabHref('cafe-roma', t))).toEqual([
      '/cafe-roma',
      '/cafe-roma/menu',
      '/cafe-roma/offers',
      '/cafe-roma/info',
    ]);
  });

  it.each([
    ['/cafe-roma', 'home'],
    ['/cafe-roma/menu', 'menu'],
    ['/cafe-roma/offers', 'offers'],
    ['/cafe-roma/info', 'info'],
    ['/cafe-roma/menu/extra', undefined],
    ['/other-cafe/menu', undefined],
    ['/cafe-roma-2', undefined],
    ['/', undefined],
  ])('%s → %s', (path, expected) => {
    expect(activeTab('cafe-roma', path)).toBe(expected);
  });
});
