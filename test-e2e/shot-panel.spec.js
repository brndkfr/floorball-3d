// A-BACK-045 step 3: the shot overlays are switched from the match ball's
// Inspector (draft variant B), not from rows in the View section. The
// overlays stay on the rink when something else is selected.
// updateTrajectory / updateCoverage / updateShotReadout are called directly:
// rAF-driven frames are unreliable in Playwright tabs (CLAUDE.md).

import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && state.goalInstances.length === 2 && !!state.goalies.A && !!state.goalies.B;
  });
}

const selectBall = (page) => page.evaluate(async () => {
  const { selectObject } = await import('/src/selection.js');
  const { state } = await import('/src/state.js');
  state.ballGroup.position.set(0, 0, 9000);   // goal A end
  selectObject(state.ballGroup);
});

async function overlays(page) {
  return page.evaluate(async () => {
    const { updateTrajectory } = await import('/src/trajectory.js');
    const { updateCoverage } = await import('/src/coverage.js');
    const { updateShotReadout } = await import('/src/shot-readout.js');
    const { state, getBallWorldCenter, shotGoal } = await import('/src/state.js');
    const { scene } = await import('/src/scene.js');
    const c = getBallWorldCenter();
    updateTrajectory(c);
    updateCoverage(c);
    updateShotReadout();
    const corner = scene.children.find((o) => o.isLineSegments && o.frustumCulled === false && o.geometry.attributes.position.count === 8);
    const shot = scene.children.find((o) => o.isLineSegments && o.material?.isLineDashedMaterial && o.material.dashSize === 120);
    return {
      goal: state.goalInstances.indexOf(shotGoal()) === 1 ? 'B' : 'A',
      lines: corner.visible,
      shotLine: shot.visible,
      coverage: state.currentCoveragePct !== null,
    };
  });
}

const section = (page) => page.locator('#inspectorBody .shot-section');
const chip = (page, name) => section(page).getByRole('button', { name, exact: true });

test('the View section no longer holds the shot rows', async ({ page }) => {
  await boot(page);
  for (const id of ['trajectoryCheckbox', 'goalieOutlineCheckbox', 'coverageCheckbox', 'alignGoalieBtn', 'viewFromBallBtn', 'coveragePct']) {
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  }
  await expect(page.locator('#resetViewBtn')).toHaveCount(1);
});

test('selecting the match ball shows the Shot section: target, verdict, toggles, actions', async ({ page }) => {
  await boot(page);
  await expect(section(page)).toHaveCount(0);
  await selectBall(page);
  await expect(section(page)).toBeVisible();
  const target = section(page).getByRole('radiogroup', { name: 'Target goal' });
  await expect(target.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  for (const name of ['Lines', 'Shooting line', 'Coverage']) await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'false');
  await expect(section(page).getByRole('button', { name: 'Align goalie' })).toBeVisible();
  await expect(section(page).getByRole('button', { name: 'From the ball' })).toBeVisible();
  await expect(section(page).locator('.shot-verdict')).toContainText(/Open shot|Blocked off-centre|Squared up/);
  await expect(section(page).locator('.shot-verdict')).toContainText('%');
});

test('the toggles switch each overlay; they stay on with another selection and after a reload', async ({ page }) => {
  await boot(page);
  await selectBall(page);
  expect(await overlays(page)).toEqual({ goal: 'A', lines: false, shotLine: false, coverage: false });
  await chip(page, 'Lines').click();
  await expect(chip(page, 'Lines')).toHaveAttribute('aria-pressed', 'true');
  expect(await overlays(page)).toMatchObject({ lines: true, shotLine: false, coverage: false });
  await chip(page, 'Shooting line').click();
  await chip(page, 'Coverage').click();
  expect(await overlays(page)).toMatchObject({ lines: true, shotLine: true, coverage: true });

  // another selection: the section goes, the overlays stay
  await page.evaluate(async () => {
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    selectObject(state.goalies.B);
  });
  await expect(section(page)).toHaveCount(0);
  expect(await overlays(page)).toMatchObject({ lines: true, shotLine: true, coverage: true });

  await page.reload({ waitUntil: 'load' });
  await waitForAssets(page);
  await selectBall(page);
  for (const name of ['Lines', 'Shooting line', 'Coverage']) await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'true');
});

test('the target control picks Home, Away or Auto', async ({ page }) => {
  await boot(page);
  await selectBall(page);
  const target = section(page).getByRole('radiogroup', { name: 'Target goal' });
  await target.getByRole('radio', { name: 'Away' }).click();
  await expect(target.getByRole('radio', { name: 'Away' })).toHaveAttribute('aria-checked', 'true');
  expect((await overlays(page)).goal).toBe('B');
  await target.getByRole('radio', { name: 'Auto' }).click();
  expect((await overlays(page)).goal).toBe('A');   // ball at the goal A end
  // clicking a goalie elsewhere shows up as that pick when the ball is selected again
  await page.evaluate(async () => {
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    selectObject(state.goalies.B);
    selectObject(state.ballGroup);
  });
  await expect(target.getByRole('radio', { name: 'Away' })).toHaveAttribute('aria-checked', 'true');
});

test('the goalie glow comes with the shooting line, and Align goalie squares it up', async ({ page }) => {
  await boot(page);
  await selectBall(page);
  await chip(page, 'Shooting line').click();
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.goalies.A.position.x = 150;   // in the way, nearly centred
  });
  await section(page).getByRole('button', { name: 'Align goalie' }).click();
  const r = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateTrajectory } = await import('/src/trajectory.js');
    const { updateShotReadout } = await import('/src/shot-readout.js');
    const { getBallWorldCenter } = await import('/src/state.js');
    updateTrajectory(getBallWorldCenter());
    updateShotReadout();
    const outlines = state.goalieOutlinesByModel[state.activeGoalieKey].A;
    return { key: state.shotReadout.key, glow: outlines.some((o) => o.visible), x: state.goalies.A.position.x };
  });
  expect(r.key).toBe('blocked-centred');
  expect(Math.abs(r.x)).toBeLessThan(5);
  expect(r.glow).toBe(true);
  await expect(section(page).locator('.shot-verdict')).toContainText('Squared up');
});

// A-BACK-045 step 5: the verdict chip on the rink (#goalieLabel, which
// Present already hides) shows while any shot overlay is on, next to the
// targeted goal, inside the stage, in 2D too.
test('the verdict chip shows by the targeted goal while an overlay is on', async ({ page }) => {
  await boot(page);
  const chipNow = () => page.evaluate(async () => {
    const { updateShotReadout } = await import('/src/shot-readout.js');
    const { updateShotChip } = await import('/src/ui/shot-chip.js');
    const { renderer } = await import('/src/scene.js');
    updateShotReadout();
    updateShotChip();
    const el = document.getElementById('goalieLabel');
    const r = el.getBoundingClientRect();
    const c = renderer.domElement.getBoundingClientRect();
    return {
      shown: getComputedStyle(el).display !== 'none',
      text: el.textContent,
      x: r.left + r.width / 2, y: r.bottom,
      canvas: { left: c.left, right: c.right, top: c.top, bottom: c.bottom, mid: c.left + c.width / 2 },
    };
  });
  await page.evaluate(async () => {
    const td = await import('/src/authoring/topdown-camera.js');
    if (!td.isTopDown()) td.enterTopDown();
    const { state } = await import('/src/state.js');
    state.ballGroup.position.set(0, 0, 9500);
    state.goalies.A.position.x = 1;
  });
  expect((await chipNow()).shown).toBe(false);
  await selectBall(page);
  await chip(page, 'Shooting line').click();
  const c = await chipNow();
  expect(c.shown).toBe(true);
  expect(c.text).toMatch(/Squared up/);
  expect(c.text).toMatch(/\d+%/);
  // inside the stage, on goal A's (left) half in the top-down view
  expect(c.x).toBeGreaterThan(c.canvas.left);
  expect(c.x).toBeLessThan(c.canvas.mid);
  expect(c.y).toBeGreaterThan(c.canvas.top);
  expect(c.y).toBeLessThan(c.canvas.bottom);
  await chip(page, 'Shooting line').click();
  expect((await chipNow()).shown).toBe(false);
});
