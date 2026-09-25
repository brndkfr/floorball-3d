// Broadcast top bar (S-BACK-021, design canvas "Plan"): project name, a
// "frame n / m" crumb, a 2D / 3D segmented control and Export. The controls
// call the same functions as the old dock, and follow view changes made
// anywhere else (dock button, keyboard).
import { test, expect, waitForAssets } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
}

test('crumb follows frame changes', async ({ page }) => {
  await boot(page);
  const crumb = page.locator('#appTopbar [data-topbar="crumb"]');
  await expect(crumb).toHaveText('frame 1 / 1');
  await page.evaluate(async () => (await import('/src/authoring/frames.js')).duplicateFrame());
  await expect(crumb).toHaveText('frame 2 / 2');
  await page.evaluate(async () => (await import('/src/authoring/frames.js')).selectFrame(0));
  await expect(crumb).toHaveText('frame 1 / 2');
});

test('2D / 3D control switches the view and follows the dock button', async ({ page }) => {
  await boot(page);
  const two = page.locator('#appTopbar [data-view-mode="2d"]');
  const three = page.locator('#appTopbar [data-view-mode="3d"]');
  const topDown = () => page.evaluate(async () => (await import('/src/authoring/topdown-camera.js')).isTopDown());

  await two.click();
  expect(await topDown()).toBe(true);
  await expect(two).toHaveAttribute('aria-pressed', 'true');
  await expect(three).toHaveAttribute('aria-pressed', 'false');

  await three.click();
  expect(await topDown()).toBe(false);
  await expect(three).toHaveAttribute('aria-pressed', 'true');

  // Changed elsewhere: the segmented control catches up.
  await page.locator('#dock [data-dock="view"]').click();
  expect(await topDown()).toBe(true);
  await expect(two).toHaveAttribute('aria-pressed', 'true');
});

test('Export opens the export dialog', async ({ page }) => {
  await boot(page);
  await page.locator('#appTopbar [data-action="export-video"]').click();
  await expect(page.locator('#exportOverlay')).toBeVisible();
});
