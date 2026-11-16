// A-BACK-046: the KATA section in the Train panel. Four rows (body pending
// until goalie poses exist), the expected action (Auto from the play, or a
// manual Shot / Pass / Dribble), coverage %, and one hint for the worst
// dimension. updateGoalieZones / updateShotReadout / updateKataReadout are
// called directly: rAF-driven frames are unreliable in Playwright tabs.

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && !!state.goalies.A && state.goalInstances.length === 2;
  });
  await page.locator('#appRail [data-mode="train"]').click();
}

// Put goalie A `leftMm` to its left of the shooting line, `depthMm` out, square
// to the shot plus `turnDeg` to its left; run one update of everything.
const placeGoalie = (page, { leftMm = 0, depthMm = 1000, turnDeg = 0 } = {}) => page.evaluate(async ([l, d, t]) => {
  const { state, getBallWorldCenter } = await import('/src/state.js');
  const { GOAL_CENTER_LOCAL } = await import('/src/constants.js');
  const { GOAL_Z } = await import('/src/authoring/ball-pose.js');
  const { updateGoalieZones } = await import('/src/goalie-zones-layer.js');
  const { updateShotReadout } = await import('/src/shot-readout.js');
  const { updateKataReadout } = await import('/src/kata-readout.js');
  const ball = getBallWorldCenter();
  const gc = state.goalInstances[0].localToWorld(GOAL_CENTER_LOCAL.clone());
  const z = GOAL_Z.A + d;
  const lineX = ball.x + ((z - ball.z) / (gc.z - ball.z)) * (gc.x - ball.x);
  const g = state.goalies.A;
  g.position.set(lineX + l, 0, z);
  g.rotation.y = Math.atan2(ball.x - gc.x, ball.z - gc.z) + (t * Math.PI) / 180;
  g.updateMatrixWorld(true);
  updateGoalieZones(ball);
  updateShotReadout();
  updateKataReadout();
  return state.kataReadout;
}, [leftMm, depthMm, turnDeg]);

const section = (page) => page.locator('#trainPanel .kata');
const row = (page, dim) => section(page).locator(`.kata-row[data-dim="${dim}"]`);
const action = (page, name) => section(page).getByRole('radiogroup').getByRole('radio', { name, exact: true });

test('the KATA section lists four rows, body pending, Auto on, coverage shown', async ({ page }) => {
  await boot(page);
  await placeGoalie(page);
  await expect(section(page)).toBeVisible();
  for (const [dim, label] of [['body', 'Body (Körper)'], ['placement', 'Placement (Ausrichtung)'], ['depth', 'Depth (Tiefe)'], ['axis', 'Axis (Achse)']]) {
    await expect(row(page, dim)).toContainText(label);
  }
  await expect(row(page, 'body')).toHaveAttribute('data-status', 'pending');
  await expect(row(page, 'body')).toContainText('needs goalie poses');
  await expect(action(page, 'Auto')).toHaveAttribute('aria-checked', 'true');
  await expect(section(page).locator('.kata-pct')).toContainText('% of the goal covered');
});

test('square on the line 1 m out is good for a shot; off to the left the hint says step right', async ({ page }) => {
  await boot(page);
  const r = await placeGoalie(page);
  expect(r).toMatchObject({ zone: 'slot', action: 'shot' });
  await expect(section(page).locator('.kata-hint')).toHaveText('Good position for this situation.');
  for (const dim of ['placement', 'depth', 'axis']) await expect(row(page, dim)).toHaveAttribute('data-status', 'ok');

  await placeGoalie(page, { leftMm: 500 });
  await expect(row(page, 'placement')).toHaveAttribute('data-status', 'adjust');
  await expect(row(page, 'placement')).toHaveClass(/worst/);
  await expect(section(page).locator('.kata-hint')).toHaveText('Step 0.5 m to your right.');
});

test('Pass changes the targets: deep and parallel; Auto goes back to the play', async ({ page }) => {
  await boot(page);
  await placeGoalie(page);
  await action(page, 'Pass').click();
  await expect(action(page, 'Pass')).toHaveAttribute('aria-checked', 'true');
  await placeGoalie(page);
  await expect(row(page, 'depth')).toHaveAttribute('data-status', 'adjust');
  await expect(section(page).locator('.kata-hint')).toHaveText('Step 0.5 m back towards the goal line.');
  await action(page, 'Auto').click();
  const r = await placeGoalie(page);
  expect(r.action).toBe('shot');
});

test('the KATA text follows the app language', async ({ page }) => {
  await boot(page);
  await placeGoalie(page, { turnDeg: 30 });
  await page.locator('#langBtn').click();
  await page.locator('#langMenu').getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await expect(row(page, 'axis')).toContainText('Achse');
  await expect(section(page).locator('.kata-hint')).toHaveText('30° nach rechts drehen, frontal zur Schusslinie.');
  await expect(action(page, 'Schuss')).toBeVisible();
});
