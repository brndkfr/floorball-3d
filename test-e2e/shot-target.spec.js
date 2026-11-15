// The shot overlays (ball-to-goal lines, shooting line, coverage) show as
// soon as their box is ticked, aimed at the goal nearer the ball; picking a
// goal or its goalie (Layers panel or canvas) overrides that. Before, they
// showed nothing until a goal was clicked on the canvas, which the goalie
// in front of it made close to impossible in the fitted 3D view.

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

// What the overlays show now: which goal, lines visible, coverage text.
async function overlays(page) {
  await page.evaluate(async () => {
    const { updateTrajectory } = await import('/src/trajectory.js');
    const { updateCoverage } = await import('/src/coverage.js');
    const { getBallWorldCenter } = await import('/src/state.js');
    const c = getBallWorldCenter();
    updateTrajectory(c);
    updateCoverage(c);
  });
  return page.evaluate(async () => {
    const { state, shotGoal } = await import('/src/state.js');
    const { scene } = await import('/src/scene.js');
    const lines = scene.children.filter((o) => o.isLineSegments && o.frustumCulled === false && o.geometry.attributes.position.count <= 8);
    return {
      goal: state.goalInstances.indexOf(shotGoal()) === 1 ? 'B' : 'A',
      linesVisible: lines.length > 0 && lines.every((l) => l.visible),
      coverage: document.getElementById('coveragePct').textContent,
    };
  });
}

const placeBall = (page, z) => page.evaluate(async (z) => {
  const { state } = await import('/src/state.js');
  state.targetGoal = null;
  state.ballGroup.position.set(0, 0, z);
  state.ballGroup.updateMatrixWorld(true);
}, z);

test('a fresh page shows no shot overlay until one is switched on', async ({ page }) => {
  await boot(page);
  await placeBall(page, 9000);
  const o = await overlays(page);
  expect(o.linesVisible).toBe(false);
  expect(o.coverage).toBe('-');
  expect(await page.locator('#coverageCheckbox').isChecked()).toBe(false);
});

test('a fresh page selects nothing, so the target follows the ball to the far end', async ({ page }) => {
  // activateGoalieModel() once read `undefined === undefined` as "the goalie
  // was selected" and selected the home goalie on load, which also pinned
  // the shot target to goal A.
  await boot(page);
  await page.locator('#trajectoryCheckbox').check();
  const sel = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { selected: !!state.selected, picked: !!state.targetGoal };
  });
  expect(sel).toEqual({ selected: false, picked: false });
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.ballGroup.position.set(0, 0, 32000);   // no reset of the pick here
  });
  expect((await overlays(page)).goal).toBe('B');
});

test('ticking the lines shows them at once, aimed at the goal nearer the ball', async ({ page }) => {
  await boot(page);
  await page.locator('#trajectoryCheckbox').check();
  await page.locator('#coverageCheckbox').check();
  await placeBall(page, 9000);   // goal A end
  let o = await overlays(page);
  expect(o.goal).toBe('A');
  expect(o.linesVisible).toBe(true);
  expect(o.coverage).toMatch(/% blocked/);
  await placeBall(page, 32000);  // goal B end
  o = await overlays(page);
  expect(o.goal).toBe('B');
  expect(o.linesVisible).toBe(true);
});

test('picking a goal or a goalie in the Layers panel aims the overlays there', async ({ page }) => {
  await boot(page);
  await page.locator('#trajectoryCheckbox').check();
  await placeBall(page, 9000);   // nearer A
  await page.evaluate(async () => {
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    selectObject(state.goalies.B);
  });
  expect((await overlays(page)).goal).toBe('B');
  await page.evaluate(async () => {
    const { selectObject } = await import('/src/selection.js');
    const { state } = await import('/src/state.js');
    selectObject(state.goalInstances[0]);
  });
  expect((await overlays(page)).goal).toBe('A');
  // the goal rows in the Layers panel go through the same path
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.targetGoal = null;
  });
  await placeBall(page, 9000);
  await page.locator('#layersPanel, [data-section="layers"], #rightPanel').getByText('Away', { exact: true }).first().click();
  expect((await overlays(page)).goal).toBe('B');
});

// A-BACK-045 step 4: state.shotReadout (verdict + % blocked) follows the
// ball and the goalie, for the Inspector card and the rink chip.
test('the shot readout follows the goalie: squared up, then open when it steps aside', async ({ page }) => {
  await boot(page);
  await placeBall(page, 9500);   // straight in front of goal A
  // rAF can stall in a background tab: run the loop's update directly.
  const goalieAt = (x) => page.evaluate(async (x) => {
    const { state } = await import('/src/state.js');
    const { updateShotReadout } = await import('/src/shot-readout.js');
    let events = 0;
    const count = () => { events++; };
    window.addEventListener('shotReadoutChanged', count);
    state.goalies.A.position.x = x;
    updateShotReadout();
    window.removeEventListener('shotReadoutChanged', count);
    return { ...state.shotReadout, events };
  }, x);
  const centred = await goalieAt(0);
  expect(centred.goal).toBe('A');
  expect(centred.key).toBe('blocked-centred');
  expect(centred.pctBlocked).toBeGreaterThan(30);
  expect(centred.events).toBe(1);
  const open = await goalieAt(2500);
  expect(open.key).toBe('open');
  expect(open.pctBlocked).toBeLessThan(1);
});
