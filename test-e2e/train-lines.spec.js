// A-BACK-054 follow-up: in Train the projection lines (ball to the four goal
// corners) and the shooting line come on by themselves; a Lines button in
// the KATA card switches both. Plan's own choice (ball Inspector, stored
// per browser) is never changed by Train and comes back on the way out.
// updateTrajectory is called directly: rAF frames are unreliable here.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && state.goalInstances.length === 2 && !!state.goalies.A;
  });
}

const lines = (page) => page.evaluate(async () => {
  const { updateTrajectory } = await import('/src/trajectory.js');
  const { getBallWorldCenter } = await import('/src/state.js');
  const { scene } = await import('/src/scene.js');
  updateTrajectory(getBallWorldCenter());
  const corner = scene.children.find((o) => o.isLineSegments && o.frustumCulled === false && o.geometry.attributes.position.count === 8);
  const shot = scene.children.find((o) => o.isLineSegments && o.material?.isLineDashedMaterial && o.material.dashSize === 120);
  return { lines: corner.visible, shotLine: shot.visible };
});
const linesBtn = (page) => page.locator('#trainPanel .kata').getByRole('button', { name: /^(Lines|Linien)$/ });
const rail = (page, mode) => page.locator(`#appRail [data-mode="${mode}"]`);

test('Train shows the corner lines and the shooting line; Plan keeps its own (off) choice', async ({ page }) => {
  await boot(page);
  expect(await lines(page)).toEqual({ lines: false, shotLine: false });
  await rail(page, 'train').click();
  expect(await lines(page)).toEqual({ lines: true, shotLine: true });
  await expect(linesBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await rail(page, 'plan').click();
  expect(await lines(page)).toEqual({ lines: false, shotLine: false });
  expect(await page.evaluate(() => localStorage.getItem('floorball3d.shotView'))).toBeNull();
});

test('the Lines button switches both in Train without touching Plan\'s stored choice', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('floorball3d.shotView', JSON.stringify({ lines: true, shotLine: false, coverage: true })); sessionStorage.setItem('seeded', '1'); } });
  await boot(page);
  await rail(page, 'train').click();
  await linesBtn(page).click();
  await expect(linesBtn(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await lines(page)).toEqual({ lines: false, shotLine: false });
  await linesBtn(page).click();
  expect(await lines(page)).toEqual({ lines: true, shotLine: true });
  await rail(page, 'plan').click();
  expect(await lines(page)).toEqual({ lines: true, shotLine: false });   // Plan's own choice is back
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('floorball3d.shotView')))).toEqual({ lines: true, shotLine: false, coverage: true });
});
