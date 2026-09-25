// Broadcast tool palette (design canvas "Plan" + "Tool palette - flyouts"):
// icon-only 40 px tools, the armed tool is the only filled one, tools with
// variants carry a corner mark and a hover flyout whose rows show icon +
// label. Every tool keeps an accessible name.
import { test, expect, waitForAssets } from './fixtures.js';

test('palette tools are 40 px icons with accessible names', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  const tools = await page.evaluate(() => [...document.querySelectorAll('#toolPalette > button, #toolPalette > .tp-group > button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), svg: !!b.querySelector('svg'), name: b.getAttribute('aria-label') };
  }));
  expect(tools.length).toBe(9);
  for (const t of tools) {
    expect(t).toMatchObject({ w: 40, h: 40, svg: true });
    expect(t.name).toBeTruthy();
  }
});

test('only the armed tool is filled, and flyout rows show icon + label', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  const filled = () => page.evaluate(() => [...document.querySelectorAll('#toolPalette button')]
    .filter((b) => getComputedStyle(b).backgroundColor === 'rgb(46, 107, 255)').map((b) => b.dataset.tool));
  expect(await filled()).toEqual(['']);   // Select
  await page.locator('#toolPalette > button[data-tool="arrow"]').click();
  expect(await filled()).toEqual(['arrow']);
  await page.locator('#toolPalette > .tp-group > button[data-tool="zone"]').hover();
  const rows = page.locator('#toolPalette .tp-group:has(> button[data-tool="zone"]) .tp-submenu button');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Freehand');
  expect(await rows.first().locator('svg').count()).toBe(1);
});
