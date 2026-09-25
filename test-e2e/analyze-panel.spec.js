// Broadcast Analyze panel (S-BACK-021, design canvas "Analyze step 2/4"):
// docked 360 px column under the top bar, always open, a four-segment
// stepper (bar + label, done / current in brand blue) and styled buttons.
import { test, expect } from './fixtures.js';

test.use({ viewport: { width: 1440, height: 900 } });

test('Analyze panel is docked, open, with a bar stepper', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('#appRail [data-mode="analyze"]').click();
  const panel = page.locator('#photoPanel');
  await expect(panel).toBeVisible();
  const g = await page.evaluate(() => {
    const p = document.getElementById('photoPanel');
    const r = p.getBoundingClientRect();
    const active = document.querySelector('#photoStepper .ps-step.active');
    const bar = getComputedStyle(active, '::before');
    const btn = getComputedStyle(document.getElementById('photoAutoDetectBtn'));
    return {
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.bottom)],
      collapsed: p.classList.contains('collapsed'),
      toggle: !!p.querySelector('.hud-toggle'),
      barHeight: bar.height, barColor: bar.backgroundColor,
      btnRadius: btn.borderRadius, btnFont: btn.fontFamily.split(',')[0].replace(/["']/g, ''),
    };
  });
  expect(g).toEqual({
    rect: [1440 - 360, 52, 360, 900], collapsed: false, toggle: false,
    barHeight: '3px', barColor: 'rgb(46, 107, 255)',
    btnRadius: '6px', btnFont: 'Archivo',
  });
});
