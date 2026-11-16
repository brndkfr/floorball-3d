// S-BACK-032: Screenshot for the whole app. A camera button in the top bar
// (every mode) and P save a PNG of the visible stage, with the HTML labels
// over the rink painted in; the menu has Copy to clipboard and Clean.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && !!state.goalies.A;
  });
}

const shotBtn = (page) => page.locator('#appTopbar #shotBtn');
const menuBtn = (page) => page.locator('#appTopbar #shotMenuBtn');
const menu = (page) => page.locator('#shotMenu');

// Image size and the stage crop it should match, from the app itself.
const capture = (page, opts) => page.evaluate(async (o) => {
  const { captureStage, currentStageCrop } = await import('/src/screenshot.js');
  const canvas = await captureStage(o);
  const crop = currentStageCrop();
  return { w: canvas.width, h: canvas.height, crop, scale: canvas.width / crop.w };
}, opts);

test('the button is in the top bar in Plan, Train and Analyze', async ({ page }) => {
  await boot(page);
  await expect(shotBtn(page)).toBeVisible();
  await expect(shotBtn(page)).toHaveAttribute('aria-label', 'Screenshot');
  for (const mode of ['train', 'analyze', 'plan']) {
    await page.locator(`#appRail [data-mode="${mode}"]`).click();
    await expect(shotBtn(page)).toBeVisible();
  }
});

test('a click saves a PNG of the visible stage, named after the mode', async ({ page }) => {
  await boot(page);
  const [download] = await Promise.all([page.waitForEvent('download'), shotBtn(page).click()]);
  expect(download.suggestedFilename()).toMatch(/^floorball-plan-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/);
  const r = await capture(page, {});
  expect(r.w).toBe(Math.round(r.crop.w * r.scale));
  expect(r.h).toBe(Math.round(r.crop.h * r.scale));
  expect(r.crop.x).toBeGreaterThanOrEqual(64);     // the rail is not in the picture
  expect(r.crop.y).toBeGreaterThanOrEqual(52);     // nor the top bar
});

test('in Train the zone tags and the hint are painted in; Clean leaves them out', async ({ page }) => {
  await boot(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#appRail [data-mode="train"]').click();
  const diff = await page.evaluate(async () => {
    const { state, getBallWorldCenter } = await import('/src/state.js');
    (await import('/src/goalie-zones-layer.js')).updateGoalieZones(getBallWorldCenter());
    (await import('/src/goalie-zone-labels.js')).placeZoneLabels();
    const { captureStage } = await import('/src/screenshot.js');
    const withLabels = await captureStage({});
    const clean = await captureStage({ clean: true });
    // Compare the area under the big zone tag.
    const tag = document.querySelector('#zoneLabels .zl-tag.current').getBoundingClientRect();
    const { currentStageCrop } = await import('/src/screenshot.js');
    const crop = currentStageCrop();
    const s = withLabels.width / crop.w;
    const x = Math.round((tag.x - crop.x) * s), y = Math.round((tag.y - crop.y) * s);
    const w = Math.max(1, Math.round(tag.width * s)), h = Math.max(1, Math.round(tag.height * s));
    const a = withLabels.getContext('2d').getImageData(x, y, w, h).data;
    const b = clean.getContext('2d').getImageData(x, y, w, h).data;
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) changed++;
    return { changed, total: a.length / 4 };
  });
  expect(diff.changed / diff.total).toBeGreaterThan(0.3);
});

test('the menu has Save, Copy and Clean; Copy puts a PNG on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await boot(page);
  await menuBtn(page).click();
  await expect(menu(page)).toBeVisible();
  for (const name of ['Save PNG', 'Copy to clipboard', 'Save without labels']) await expect(menu(page).getByRole('menuitem', { name })).toBeVisible();
  await menu(page).getByRole('menuitem', { name: 'Copy to clipboard' }).click();
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('#shotToast')).toContainText('Copied');
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
  expect(types).toContain('image/png');
});

test('P takes a screenshot, also in Present where the top bar is hidden', async ({ page }) => {
  await boot(page);
  await page.locator('#appTopbar [data-action="present"]').click();
  await expect(page.locator('#appTopbar')).toBeHidden();
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('p')]);
  expect(download.suggestedFilename()).toMatch(/^floorball-present-/);
  const r = await capture(page, {});
  expect(r.crop.x).toBe(0);
  expect(r.crop.y).toBe(0);
});
