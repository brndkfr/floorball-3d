// Broadcast phone layout (design canvas "phone", < 768 px): the rail becomes
// a bottom tab bar, the tool palette a horizontal strip above it, the top
// bar spans the width, and the side panels are drawers (the < 1200 px rule).
// Emulates a touch phone: the old coarse-pointer rule hid the whole shell.
import { test, expect, waitForAssets } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('rail is a bottom tab bar and the palette a horizontal strip', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await expect(page.locator('#appRail')).toBeVisible();
  await expect(page.locator('#toolPalette')).toBeVisible();
  const g = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const rail = r('appRail'), top = r('appTopbar'), pal = r('toolPalette');
    return {
      rail: [Math.round(rail.left), Math.round(rail.bottom), Math.round(rail.width)],
      railRow: getComputedStyle(document.getElementById('appRail')).flexDirection,
      topbar: [Math.round(top.left), Math.round(top.width)],
      paletteRow: getComputedStyle(document.getElementById('toolPalette')).flexDirection,
      paletteAboveRail: pal.bottom <= rail.top && pal.top > rail.top - 120,   // sits right above the tab bar
      paletteInView: pal.left >= 0 && pal.right <= 390,
    };
  });
  expect(g).toEqual({
    rail: [0, 844, 390], railRow: 'row',
    topbar: [0, 390],
    paletteRow: 'row', paletteAboveRail: true, paletteInView: true,
  });
});

test('the tab bar still switches modes', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('#appRail [data-mode="analyze"]').tap();
  await expect(page.locator('#appRail [data-mode="analyze"]')).toHaveClass(/active/);
});

// Design canvas "phone": Analyze steps live in a bottom sheet above the tab
// bar - a peek with the grab bar and the stepper, tap the grab to expand.
test('Analyze is a bottom sheet: peek above the tab bar, grab expands it', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.locator('#appRail [data-mode="analyze"]').tap();
  const sheet = page.locator('#photoPanel');
  const grab = page.locator('#photoSheetGrab');
  await expect(sheet).toBeVisible();
  await expect(grab).toBeVisible();
  await expect(grab).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#photoStepper')).toBeInViewport();
  const box = async () => page.evaluate(() => {
    const r = document.getElementById('photoPanel').getBoundingClientRect();
    const tab = document.getElementById('appRail').getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom), tabTop: Math.round(tab.top), height: Math.round(r.height) };
  });
  const peek = await box();
  expect(peek.left).toBe(0);
  expect(peek.width).toBe(390);
  expect(peek.bottom).toBe(peek.tabTop);
  expect(peek.height).toBeLessThanOrEqual(180);
  // Nothing to walk around with in Analyze, and the sheet replaces the drawer toggle.
  await expect(page.locator('#touchDpad')).toBeHidden();
  await expect(page.locator('#appTopbar [data-action="toggle-panel"]')).toBeHidden();

  await grab.tap();
  await expect(grab).toHaveAttribute('aria-expanded', 'true');
  const open = await box();
  expect(open.height).toBeGreaterThan(500);
  expect(open.bottom).toBe(open.tabTop);
  await expect(page.locator('#photoDrop')).toBeInViewport();

  await grab.tap();
  await expect(grab).toHaveAttribute('aria-expanded', 'false');
  expect((await box()).height).toBeLessThanOrEqual(180);

  // Back in Plan the sheet is gone.
  await page.locator('#appRail [data-mode="plan"]').tap();
  await expect(sheet).toBeHidden();
});
