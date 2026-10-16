// Broadcast first run (design canvas "first run"): on a first visit the
// stage shows two entry points - start a play, or analyze a photo - plus
// the guided play, shortcuts and Library as secondary links. Any choice
// marks onboarding done.
import { test, expect } from './fixtures.js';

test.use({ showOnboarding: true, viewport: { width: 1440, height: 900 } });

test('first visit shows the two entry cards', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  const card = page.locator('#onboardingTip');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-x="ok"]')).toHaveText('New play');
  await expect(card.locator('[data-x="analyze"]')).toHaveText('Choose photo');
  await expect(card.locator('[data-x="tutorial"]')).toBeVisible();
  await expect(card.locator('[data-x="library"]')).toBeVisible();
});

test('New play closes it and remembers the choice', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('#onboardingTip [data-x="ok"]').click();
  await expect(page.locator('#onboardingTip')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('floorball-3d:onboarded'))).toBe('1');
});

test('Choose photo switches to Analyze', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('#onboardingTip [data-x="analyze"]').click();
  await expect(page.locator('#onboardingTip')).toHaveCount(0);
  await expect(page.locator('#appRail [data-mode="analyze"]')).toHaveClass(/active/);
  await expect(page.locator('#photoPanel')).toBeVisible();
});
