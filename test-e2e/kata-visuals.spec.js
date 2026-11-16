// KATA marks on the rink and Focus goalie (A-BACK-046 follow-up): the target
// band, footprint, facing rays and offset in Train, a Marks toggle remembered
// per browser, and a Focus goalie camera. Update functions are called
// directly: rAF-driven frames are unreliable in Playwright tabs.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && !!state.goalies.A && state.goalInstances.length === 2;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });   // camera blends land at once
  await page.locator('#appRail [data-mode="train"]').click();
}

// Goalie A `leftMm` to its left of the shooting line, `depthMm` out, square
// plus `turnDeg` to its left; run one update; return what the marks show.
const placeGoalie = (page, { leftMm = 0, depthMm = 1000, turnDeg = 0 } = {}) => page.evaluate(async ([l, d, t]) => {
  const { state, getBallWorldCenter } = await import('/src/state.js');
  const { GOAL_CENTER_LOCAL } = await import('/src/constants.js');
  const { GOAL_Z } = await import('/src/authoring/ball-pose.js');
  const ball = getBallWorldCenter();
  const gc = state.goalInstances[0].localToWorld(GOAL_CENTER_LOCAL.clone());
  const z = GOAL_Z.A + d;
  const lineX = ball.x + ((z - ball.z) / (gc.z - ball.z)) * (gc.x - ball.x);
  const g = state.goalies.A;
  g.position.set(lineX + l, 0, z);
  g.rotation.y = Math.atan2(ball.x - gc.x, ball.z - gc.z) + (t * Math.PI) / 180;
  g.updateMatrixWorld(true);
  (await import('/src/goalie-zones-layer.js')).updateGoalieZones(ball);
  (await import('/src/shot-readout.js')).updateShotReadout();
  (await import('/src/kata-readout.js')).updateKataReadout();
  (await import('/src/kata-marks-layer.js')).updateKataMarks();
  const layer = state.kataMarksLayer;
  const named = (n) => layer.getObjectByName(n);
  return {
    visible: !!layer?.visible,
    names: layer ? layer.children.filter((c) => c.visible).map((c) => c.name).sort() : [],
    marks: state.kataMarks,
    bandColor: named('band')?.material.color.getHex() ?? null,
    goalLineZ: GOAL_Z.A,
  };
}, [leftMm, depthMm, turnDeg]);

const GREEN = 0x2ecc55, YELLOW = 0xffd21a;
const card = (page) => page.locator('#trainPanel .kata');

test('in Train the marks show: band, footprint, both rays, the arc and the offset', async ({ page }) => {
  await boot(page);
  const r = await placeGoalie(page, { leftMm: 600, turnDeg: 20 });
  expect(r.visible).toBe(true);
  for (const n of ['band', 'footprint', 'ray-current', 'ray-target', 'arc', 'offset']) expect(r.names).toContain(n);
  expect(r.bandColor).toBe(YELLOW);
  expect(r.marks.offset.m).toBeCloseTo(0.6, 2);
  expect(r.marks.rays.turnDeg).toBeCloseTo(-20, 5);
});

test('standing in the band and square: the band turns green, one ray, no offset', async ({ page }) => {
  await boot(page);
  const r = await placeGoalie(page, { depthMm: 1100 });
  expect(r.marks.band.inside).toBe(true);
  expect(r.bandColor).toBe(GREEN);
  expect(r.names).not.toContain('offset');
  expect(r.names).not.toContain('arc');
  expect(Math.abs(r.marks.rays.turnDeg)).toBeLessThan(0.5);
});

test('Pass moves the band to the goal line', async ({ page }) => {
  await boot(page);
  await card(page).getByRole('radio', { name: 'Pass', exact: true }).click();
  const r = await placeGoalie(page);
  const zs = r.marks.band.corners.map((c) => c.z);
  expect(Math.min(...zs)).toBeCloseTo(r.goalLineZ, 0);
  expect(Math.max(...zs) - r.goalLineZ).toBeCloseTo(500, 0);
});

test('the Marks toggle hides them and is remembered', async ({ page }) => {
  await boot(page);
  const marksBtn = card(page).getByRole('button', { name: /^(Marks|Markierungen)$/ });
  await expect(marksBtn).toHaveAttribute('aria-pressed', 'true');
  await marksBtn.click();
  await expect(marksBtn).toHaveAttribute('aria-pressed', 'false');
  expect((await placeGoalie(page)).visible).toBe(false);
  await boot(page);
  expect((await placeGoalie(page)).visible).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('floorball3d.kataMarks'))).toBe('0');
  await card(page).getByRole('button', { name: /^(Marks|Markierungen)$/ }).click();
  expect((await placeGoalie(page)).visible).toBe(true);
});

test('Focus goalie brings the camera close to the goalie and back out', async ({ page }) => {
  await boot(page);
  await placeGoalie(page);
  const camToGoalie = () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const c = state.activeCamera.position, g = state.goalies.A.position;
    return { d: Math.hypot(c.x - g.x, c.z - g.z), z: c.z };
  });
  const far = await camToGoalie();
  const focus = card(page).getByRole('button', { name: /^(Focus goalie|Goalie fokussieren)$/ });
  await expect(focus).toHaveAttribute('aria-pressed', 'false');
  await focus.click();
  await expect(focus).toHaveAttribute('aria-pressed', 'true');
  const near = await camToGoalie();
  expect(near.d).toBeLessThan(9000);
  expect(near.d).toBeLessThan(far.d - 3000);
  await focus.click();
  await expect(focus).toHaveAttribute('aria-pressed', 'false');
  expect((await camToGoalie()).z).toBeCloseTo(far.z, 0);
});
