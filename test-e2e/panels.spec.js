// A-BACK-044: at >= 1200 px the right panel collapses to a 40 px icon strip
// (top bar button or "\"), sections and the recorder fold, and Present
// hides everything but the stage and a small transport. Below 1200 px the
// panel stays a drawer (right-panel.spec.js, phone.spec.js).

import { test, expect, waitForAssets } from './fixtures.js';

test.use({ viewport: { width: 1440, height: 900 } });

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
}

const toggle = (page) => page.locator('#appTopbar [data-action="toggle-panel"]');

// Rink width on screen in the 2D view, px.
async function rink2dWidth(page) {
  return page.evaluate(async () => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const { HALF_W, RINK_L } = await import('/src/constants.js');
    const td = await import('/src/authoring/topdown-camera.js');
    if (!td.isTopDown()) td.enterTopDown();
    const cam = state.activeCamera;
    cam.updateMatrixWorld();
    const xs = [[-HALF_W, 0], [HALF_W, RINK_L], [-HALF_W, RINK_L], [HALF_W, 0]].map(([x, z]) => (new THREE.Vector3(x, 0, z).project(cam).x + 1) / 2 * innerWidth);
    return Math.max(...xs) - Math.min(...xs);
  });
}

test('the top bar button collapses the panel to an icon strip and the rink gets the room', async ({ page }) => {
  await boot(page);
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  const before = await rink2dWidth(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#rightPanel')).toBeHidden();
  const strip = await page.locator('#panelStrip').boundingBox();
  expect(Math.round(strip.width)).toBe(40);
  expect(Math.round(strip.x + strip.width)).toBe(1440);
  expect(await rink2dWidth(page)).toBeGreaterThan(before + 20);
});

test('the untouched 3D view re-fits when the panel collapses', async ({ page }) => {
  await boot(page);
  const right = () => page.evaluate(async () => {
    const THREE = await import('three');
    const { camera } = await import('/src/scene.js');
    const { RINK_L, HALF_W } = await import('/src/constants.js');
    camera.updateMatrixWorld();
    const xs = [];
    for (const x of [-HALF_W, HALF_W]) for (const z of [0, RINK_L]) xs.push((new THREE.Vector3(x, 0, z).project(camera).x + 1) / 2 * innerWidth);
    return Math.max(...xs);
  });
  const before = await right();
  expect(before).toBeLessThanOrEqual(1440 - 320 + 1);
  await toggle(page).click();
  await expect.poll(right).toBeGreaterThan(before + 20);
  expect(await right()).toBeLessThanOrEqual(1440 - 40 + 1);
});

test('a strip icon opens the panel at that section; the state survives a reload; "\\" toggles', async ({ page }) => {
  await boot(page);
  await toggle(page).click();
  await page.reload({ waitUntil: 'load' });
  await waitForAssets(page);
  await expect(page.locator('#panelStrip')).toBeVisible();
  await expect(page.locator('#rightPanel')).toBeHidden();
  await page.locator('#panelStrip [data-open="viewPanel"]').click();
  await expect(page.locator('#rightPanel')).toBeVisible();
  await expect(page.locator('#viewPanel')).toBeInViewport();
  await page.keyboard.press('Backslash');
  await expect(page.locator('#rightPanel')).toBeHidden();
  await page.keyboard.press('Backslash');
  await expect(page.locator('#rightPanel')).toBeVisible();
});
