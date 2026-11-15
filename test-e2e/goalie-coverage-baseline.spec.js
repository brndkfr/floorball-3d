// A-BACK-042 step 1: goal coverage (% of the goal mouth the goalie blocks)
// for the current detailed goalie at 12 fixed ball positions, kept in
// goalie-coverage-baseline.json. Step 2 replaces the mesh raycast with a
// capsule / box proxy and must stay within 5 points of these numbers.
//
// Re-record (only on purpose, e.g. when the goalie mesh changes):
//   RECORD_BASELINE=1 pnpm exec playwright test test-e2e/goalie-coverage-baseline.spec.js

import fs from 'node:fs';
import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

const FIXTURE = new URL('./goalie-coverage-baseline.json', import.meta.url);
const TOLERANCE_POINTS = 0.5;   // same mesh, same rays: only float noise

// Ball centre on the floor, x across the rink, dz in front of goal A's line (mm).
const POSITIONS = [
  { name: 'slot 3 m', x: 0, dz: 3000 },
  { name: 'slot 6 m', x: 0, dz: 6000 },
  { name: 'slot 9 m', x: 0, dz: 9000 },
  { name: 'slot 12 m', x: 0, dz: 12000 },
  { name: 'left 6 m, 3 m out', x: -3000, dz: 6000 },
  { name: 'right 6 m, 3 m out', x: 3000, dz: 6000 },
  { name: 'left 6 m, 6 m out', x: -6000, dz: 6000 },
  { name: 'right 6 m, 6 m out', x: 6000, dz: 6000 },
  { name: 'left close', x: -1500, dz: 2500 },
  { name: 'right close', x: 1500, dz: 2500 },
  { name: 'left sharp', x: -4000, dz: 1000 },
  { name: 'right sharp', x: 4000, dz: 1000 },
];

test('goal coverage of the detailed goalie at 12 ball positions matches the baseline', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await waitUntil(page, async () => !!(await import('/src/state.js')).state.goalieModels?.detailed);

  const got = await page.evaluate(async (positions) => {
    const THREE = await import('three');
    const { state } = await import('/src/state.js');
    const { activateGoalieModel } = await import('/src/goalie.js');
    const { coverageGrid } = await import('/src/insights.js');
    const { GOAL_LINE_FROM_BOARD, BALL_RADIUS } = await import('/src/constants.js');
    activateGoalieModel('detailed');
    const goal = state.goalInstances[0];
    const goalie = state.goalies.A;
    goalie.position.set(0, 0, GOAL_LINE_FROM_BOARD + 500);   // goalie.js default spot
    goalie.rotation.set(0, 0, 0);
    goalie.visible = true;
    goalie.updateMatrixWorld(true);
    goal.updateMatrixWorld(true);
    return positions.map((p) => {
      const ballWorld = new THREE.Vector3(p.x, BALL_RADIUS, GOAL_LINE_FROM_BOARD + p.dz);
      const { pctBlocked } = coverageGrid({ ballWorld, targetGoalGroup: goal, goalieMesh: goalie });
      return { ...p, pct: Math.round(pctBlocked * 100) / 100 };
    });
  }, POSITIONS);

  // Sanity: a centred goalie blocks something from the slot, and the
  // numbers vary with the position (else the raycast hit nothing).
  expect(got.find((g) => g.name === 'slot 6 m').pct).toBeGreaterThan(10);
  expect(new Set(got.map((g) => g.pct)).size).toBeGreaterThan(3);

  if (process.env.RECORD_BASELINE) {
    fs.writeFileSync(FIXTURE, JSON.stringify({
      note: 'A-BACK-042 step 1: % of goal A blocked by the detailed goalie at its default spot; ball on the floor, dz = mm in front of the goal line.',
      goalieModel: 'detailed',
      positions: got,
    }, null, 2) + '\n');
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  expect(baseline.positions.map((b) => b.name)).toEqual(POSITIONS.map((p) => p.name));
  for (const g of got) {
    const b = baseline.positions.find((x) => x.name === g.name);
    expect(Math.abs(g.pct - b.pct), `${g.name}: ${g.pct} vs baseline ${b.pct}`).toBeLessThanOrEqual(TOLERANCE_POINTS);
  }
});
