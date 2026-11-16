// A-BACK-052 / A-Q-010: one app-wide language switch, a globe button at the
// bottom of the left rail with English / Deutsch. The choice is remembered
// per browser; the first default follows the browser language. Goalie
// training (Train mode, A-BACK-054) is the first text that follows it.

import { test, expect, waitForAssets } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
}

const langBtn = (page) => page.locator('#appRail #langBtn');
const menu = (page) => page.locator('#langMenu');

test('the globe button sits at the bottom of the rail and shows EN on an English browser', async ({ page }) => {
  await boot(page);
  await expect(langBtn(page)).toBeVisible();
  await expect(langBtn(page)).toContainText('EN');
  await expect(langBtn(page)).toHaveAttribute('aria-label', 'Language: English');
  await expect(menu(page)).toBeHidden();
  const rail = await page.locator('#appRail').boundingBox();
  const btn = await langBtn(page).boundingBox();
  const lib = await page.locator('#appRail [data-mode="library"]').boundingBox();
  expect(btn.y).toBeGreaterThan(lib.y + lib.height);                   // below the modes
  expect(btn.y + btn.height).toBeGreaterThan(rail.y + rail.height - 80); // pinned near the bottom
});

test('choosing Deutsch switches, is remembered across a reload, and English switches back', async ({ page }) => {
  await boot(page);
  await langBtn(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
  await menu(page).getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await expect(menu(page)).toBeHidden();
  await expect(langBtn(page)).toContainText('DE');
  await expect(langBtn(page)).toHaveAttribute('aria-label', 'Sprache: Deutsch');
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.lang)).toBe('de');

  await boot(page);
  await expect(langBtn(page)).toContainText('DE');
  await langBtn(page).click();
  await menu(page).getByRole('menuitemradio', { name: 'English' }).click();
  await expect(langBtn(page)).toContainText('EN');
  expect(await page.evaluate(() => localStorage.getItem('floorball3d.lang'))).toBe('en');
});

test('Esc and a click elsewhere close the menu', async ({ page }) => {
  await boot(page);
  await langBtn(page).click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(langBtn(page)).toBeFocused();
  await langBtn(page).click();
  await page.mouse.click(600, 400);
  await expect(menu(page)).toBeHidden();
});

test('the menu fits on screen', async ({ page }) => {
  await boot(page);
  await langBtn(page).click();
  const m = await menu(page).boundingBox();
  const vp = page.viewportSize();
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.y).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(vp.width);
  expect(m.y + m.height).toBeLessThanOrEqual(vp.height);
});

test.describe('on a German browser', () => {
  test.use({ locale: 'de-CH' });
  test('the first default is German', async ({ page }) => {
    await boot(page);
    await expect(langBtn(page)).toContainText('DE');
  });
});
