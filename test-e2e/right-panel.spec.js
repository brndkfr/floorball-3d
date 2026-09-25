// Broadcast right panel (S-BACK-021, design canvas "Plan"): a 320 px column
// docked under the top bar, stacking Inspector, Layers and a View section
// with the scene toggles that used to live in the floating Info panel.
import { test, expect, waitForAssets } from './fixtures.js';

test('Inspector, Layers and View are docked in the right column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  const layout = await page.evaluate(() => {
    const r = document.getElementById('rightPanel').getBoundingClientRect();
    const inside = (id) => !!document.getElementById('rightPanel').querySelector(`#${id}`);
    return {
      panel: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.bottom)],
      inspector: inside('inspector'), layers: inside('layersPanel'), view: inside('rinkCheckbox'),
      grips: document.querySelectorAll('#rightPanel .floatable-grip').length,
      info: !!document.getElementById('info'),
    };
  });
  expect(layout).toEqual({
    panel: [1440 - 320, 52, 320, 900],
    inspector: true, layers: true, view: true, grips: 0, info: false,
  });
});

test('View section toggles still drive the scene', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  const rink = page.locator('#rightPanel #rinkCheckbox');
  await expect(rink).toBeChecked();
  await rink.uncheck();
  // layers.js hides the rink mesh; the checkbox is the only thing that moved.
  await expect.poll(() => page.evaluate(async () => {
    const { scene } = await import('/src/scene.js');
    let visible = null;
    scene.traverse((o) => { if (o.userData?.wireframeSource === 'rink') visible = o.visible; });
    return visible;
  })).not.toBe(true);
});

test('the right panel is Plan-only', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('#appRail [data-mode="analyze"]').click();
  await expect(page.locator('#rightPanel')).toBeHidden();
  await page.locator('#appRail [data-mode="plan"]').click();
  await expect(page.locator('#rightPanel')).toBeVisible();
});

// Design canvas breakpoints: below 1200 px the right panel is a slide-over
// drawer, closed by default, opened from the top bar, so the stage keeps
// its width (the timeline test on a 700 px window relies on it).
test.describe('below 1200 px', () => {
  test.use({ viewport: { width: 1000, height: 700 } });
  test('the right panel is a drawer toggled from the top bar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const toggle = page.locator('#appTopbar [data-action="toggle-panel"]');
    const edge = () => page.evaluate(() => Math.round(document.getElementById('rightPanel').getBoundingClientRect().left));
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#rightPanel')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(edge).toBe(1000 - 320);
    await toggle.click();
    await expect(page.locator('#rightPanel')).toBeHidden();
  });
});

test('at 1200 px and wider the panel is docked and the toggle is hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#appTopbar [data-action="toggle-panel"]')).toBeHidden();
});

// The 2D fit used the whole window, so the docked panel covered the right
// end of the rink. It now fits the stage between rail, top bar and panel.
test('2D view centres the whole rink in the stage, clear of the docked panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.locator('#appTopbar [data-view-mode="2d"]').click();
  const pts = await page.evaluate(async () => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const { RINK_L, HALF_W } = await import('/src/constants.js');
    const cam = state.activeCamera;
    cam.updateMatrixWorld();
    const at = (x, z) => {
      const v = new THREE.Vector3(x, 0, z).project(cam);
      return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
    };
    return { centre: at(0, RINK_L / 2), ends: [at(0, 0), at(0, RINK_L)], sides: [at(-HALF_W, RINK_L / 2), at(HALF_W, RINK_L / 2)] };
  });
  const stage = { left: 64, right: 1440 - 320, top: 52, bottom: 900 };
  expect(pts.centre[0]).toBeCloseTo((stage.left + stage.right) / 2, 0);
  expect(pts.centre[1]).toBeCloseTo((stage.top + stage.bottom) / 2, 0);
  for (const [x, y] of [...pts.ends, ...pts.sides]) {
    expect(x).toBeGreaterThanOrEqual(stage.left);
    expect(x).toBeLessThanOrEqual(stage.right);
    expect(y).toBeGreaterThanOrEqual(stage.top);
    expect(y).toBeLessThanOrEqual(stage.bottom);
  }
});
