// Accessibility gate (Phase 3 M3.6; Doc 01 §15, Doc 03 §16; D-040 O-8; P3-12): axe finds no
// WCAG 2.2 A/AA violation on any customer page in either language, the keyboard order is
// meaningful (skip link, venue, navigation, content, language: the same on every screen size,
// although the tab bar sits at the bottom on phones), and every focus stop is visibly marked.
import AxeBuilder from '@axe-core/playwright';

import { expect, test, visitorHeaders } from './fixtures.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PAGES = [
  ['platform root', '/'],
  ['tenant home', '/e2e-cafe'],
  ['menu', '/e2e-cafe/menu'],
  ['offers', '/e2e-cafe/offers'],
  ['info', '/e2e-cafe/info'],
  ['long name', '/e2e-long'],
  ['hostile name', '/e2e-markup'],
  ['not found', '/no-such-venue'],
] as const;

test('self-check: axe reports violations when they exist (the gate is not vacuous)', async ({
  page,
}) => {
  await page.goto('/e2e-cafe');
  // Break the page on purpose: an unlabelled image, an empty link and a nameless button. (An
  // inline style attribute cannot be used here: the strict CSP blocks it, as it should.)
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main?.insertAdjacentHTML(
      'beforeend',
      '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><a href="/x"></a>' +
        '<button type="button"></button>',
    );
  });
  const ids = (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations.map(
    (v) => v.id,
  );
  expect(ids).toEqual(expect.arrayContaining(['image-alt', 'link-name', 'button-name']));
});

for (const locale of ['en-GB', 'hu-HU'] as const) {
  test.describe(`axe, ${locale}`, () => {
    for (const [name, path] of PAGES) {
      test(`${name} has no WCAG 2.2 AA violations`, async ({ browser }) => {
        const context = await browser.newContext({
          locale,
          extraHTTPHeaders: visitorHeaders(`${locale}-${name}`),
          viewport: test.info().project.use.viewport ?? null,
        });
        const page = await context.newPage();
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        const summary = results.violations.map(
          (v) =>
            `${v.id} (${v.impact ?? '?'}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        );
        expect(summary).toEqual([]);
        await context.close();
      });
    }
  });
}

test.describe('keyboard (WCAG 2.1.1, 2.4.3, 2.4.7)', () => {
  test('tab order is skip link, venue, navigation, content, language; every stop shows focus', async ({
    page,
  }) => {
    await page.goto('/e2e-cafe');
    const stops: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (el === null || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          name: (el.getAttribute('aria-label') ?? el.textContent).trim().replace(/\s+/g, ' '),
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (stop === null) break;
      expect(stop.outline, `focus indicator on "${stop.name}"`).toBe(true);
      stops.push(stop.name);
    }
    expect(stops).toEqual([
      'Skip to content',
      'E2E Cafe',
      'Home',
      'Menu',
      'Offers',
      'Info',
      'MenuDishes and drinks',
      'OffersCurrent promotions',
      'InfoHours, location and contact',
      'English',
      'Magyar',
    ]);
  });

  test('the empty-state action is reachable and operable by keyboard', async ({ page }) => {
    await page.goto('/e2e-cafe/offers');
    const back = page.getByRole('link', { name: 'Back to home' });
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/e2e-cafe');
  });
});

test.describe('reduced motion (WCAG 2.3.3; P3-12)', () => {
  test('transitions are effectively removed when the visitor prefers reduced motion', async ({
    page,
  }) => {
    const duration = async () =>
      page
        .getByRole('navigation', { name: 'Main' })
        .locator('a span')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/e2e-cafe');
    expect(await duration()).toBeGreaterThanOrEqual(0.1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await duration()).toBeLessThan(0.001);
  });
});
