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
    await expect.poll(edge).toBeGreaterThanOrEqual(1000);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(edge).toBe(1000 - 320);
    await toggle.click();
    await expect.poll(edge).toBeGreaterThanOrEqual(1000);
  });
});

test('at 1200 px and wider the panel is docked and the toggle is hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#appTopbar [data-action="toggle-panel"]')).toBeHidden();
});
