// S-BACK-029 H4: updateTrajectory() used to raycast the goalie every frame
// while the trajectory checkbox was on. It is now gated on its inputs and
// reports whether anything changed. Calls updateTrajectory() directly:
// rAF-driven frames are unreliable in Playwright tabs (CLAUDE.md).

import { test, expect, waitForAssets } from './fixtures.js';

test('trajectory lines recompute only when an input changes, and the verdict follows the goalie', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#rinkCheckbox')).toBeVisible();
  await waitForAssets(page);

  const r = await page.evaluate(async () => {
    const { state, getBallWorldCenter, goalieForGoal } = await import('/src/state.js');
    const { updateTrajectory } = await import('/src/trajectory.js');
    const { scene } = await import('/src/scene.js');
    const { GOAL_CENTER_LOCAL } = await import('/src/constants.js');
    const { shotLineXAtZ } = await import('/src/insights.js');
    // trajectory.js's dashed shot line: 2 points, dashSize 120 (other dashed
    // lines in the scene belong to markup / pass overlays).
    const shootingLine = scene.children.find((o) => o.isLineSegments && o.material?.isLineDashedMaterial
      && o.material.dashSize === 120 && o.geometry.attributes.position.count === 2);
    const color = () => shootingLine.material.color.getHexString();

    state.targetGoal = state.goalInstances[0];
    const goalie = goalieForGoal(state.targetGoal);
    goalie.visible = true;
    const cb = document.getElementById('trajectoryCheckbox');
    cb.checked = true;
    const out = {};

    out.first = updateTrajectory(getBallWorldCenter());
    out.idle = updateTrajectory(getBallWorldCenter());
    out.visible = shootingLine.visible;

    // Goalie squarely on the shot line: blocked.
    const goalCenter = state.targetGoal.localToWorld(GOAL_CENTER_LOCAL.clone());
    goalie.position.x = shotLineXAtZ(getBallWorldCenter(), goalCenter, goalie.position.z);
    out.afterMoveIn = updateTrajectory(getBallWorldCenter());
    out.blockedColor = color();

    // Goalie far off the line: open.
    goalie.position.x += 5000;
    out.afterMoveOut = updateTrajectory(getBallWorldCenter());
    out.openColor = color();
    out.idleAgain = updateTrajectory(getBallWorldCenter());

    cb.checked = false;
    out.hide = updateTrajectory(getBallWorldCenter());
    out.hidden = !shootingLine.visible;
    cb.checked = true;
    out.reshow = updateTrajectory(getBallWorldCenter());
    out.reshownVisible = shootingLine.visible;
    return out;
  });

  expect(r.first).toBe(true);
  expect(r.idle).toBe(false);
  expect(r.visible).toBe(true);
  expect(r.afterMoveIn).toBe(true);
  expect(r.afterMoveOut).toBe(true);
  expect(r.openColor).not.toBe(r.blockedColor);
  expect(r.idleAgain).toBe(false);
  expect(r.hide).toBe(true);
  expect(r.hidden).toBe(true);
  expect(r.reshow).toBe(true);
  expect(r.reshownVisible).toBe(true);
});
