// Customer shell (Phase 3 M3.3; D-040 O-4; Doc 03 §16): four tabs, current-tab semantics, honest
// empty states, keyboard bypass, same-tenant links only, no horizontal scrolling.
import { expect, test, visitorHeaders } from './fixtures.js';

const SLUG = 'e2e-cafe';
const TABS = [
  ['Home', `/${SLUG}`, 'E2E Cafe'],
  ['Menu', `/${SLUG}/menu`, 'The menu is on its way'],
  ['Offers', `/${SLUG}/offers`, 'No offers right now'],
  ['Info', `/${SLUG}/info`, 'Venue details coming soon'],
] as const;

test.describe('four-tab navigation (O-4)', () => {
  for (const [label, path, heading] of TABS) {
    test(`${label}: one main nav, four tabs in order, this one current`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav).toHaveCount(1);
      const links = nav.getByRole('link');
      await expect(links).toHaveText(TABS.map(([l]) => l));
      await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      // Never wider than the screen (Doc 03 §16; 320–1280 px checked in screenshots).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('every link on a tenant page stays inside that tenant', async ({ page }) => {
    for (const [, path] of TABS) {
      await page.goto(path);
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      for (const href of hrefs.filter((h) => h !== '#main')) {
        expect(href, path).toMatch(new RegExp(`^/${SLUG}(/(menu|offers|info))?$`));
      }
    }
  });

  test('the tabs really navigate, and empty states lead back home', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const [label, path, heading] of TABS.slice(1)) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.locator('main')).not.toContainText('E2E Bistro');
    }
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(`/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E Cafe');
  });

  test('unique page titles per tab (WCAG 2.4.2)', async ({ page }) => {
    const titles = [];
    for (const [, path] of TABS) {
      await page.goto(path);
      titles.push(await page.title());
    }
    expect(titles).toEqual(['E2E Cafe', 'Menu – E2E Cafe', 'Offers – E2E Cafe', 'Info – E2E Cafe']);
  });
});

test.describe('keyboard (Doc 01 §15; WCAG 2.1.1, 2.4.1)', () => {
  test('the skip link is the first stop and moves focus past the navigation', async ({ page }) => {
    await page.goto(`/${SLUG}/menu`);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    // The next Tab stop is inside the main content, not the navigation.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeFocused();
  });

  test('all four tabs are reachable by keyboard and activate with Enter', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const info = nav.getByRole('link', { name: 'Info' });
    for (let i = 0; i < 10 && !(await info.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(info).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/${SLUG}/info`);
  });
});

test.describe('localized shell (O-2, O-10)', () => {
  test('Hungarian visitors get the Hungarian shell, with the venue name untouched', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: 'hu-HU',
      extraHTTPHeaders: visitorHeaders('hu'),
    });
    const page = await context.newPage();
    await page.goto(`/${SLUG}/menu`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
    const nav = page.getByRole('navigation', { name: 'Fő navigáció' });
    await expect(nav.getByRole('link')).toHaveText(['Kezdőlap', 'Étlap', 'Ajánlatok', 'Infó']);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Az étlap hamarosan érkezik');
    await expect(page.getByRole('banner')).toContainText('E2E Cafe');
    await context.close();
  });
});
