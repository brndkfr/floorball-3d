// A-BACK-047: the shooter's view inset ("Winkelband") and Auto position.
// shooterViewPose: a camera just behind the ball, looking at the goal
// centre, its lens fitting the goal mouth. idealGoaliePose: where and how
// the goalie should stand for the zone and action; standing there, every
// KATA dimension judges ok (the base for later animations, A-BACK-051).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { shooterViewPose, SHOOTER_INSET_STORAGE_KEY, parseShooterInsetShown, idealGoaliePose } = await import('../web/src/shooter-view.js');
const { kataOf, kataTargets, judgeKata } = await import('../web/src/kata.js');
const { GOAL_Z } = await import('../web/src/authoring/ball-pose.js');
const { goalieZoneOf } = await import('../web/src/goalie-zones.js');

const GC = { A: { x: 0, z: GOAL_Z.A }, B: { x: 0, z: GOAL_Z.B } };

test('shooterViewPose: just behind the ball, low, looking at the goal centre', () => {
  const ball = { x: 1500, z: GOAL_Z.A + 6000 };
  const p = shooterViewPose(ball, GC.A, 300 / 170);
  const back = Math.hypot(p.x - ball.x, p.z - ball.z);
  assert.ok(back > 200 && back < 800, `just behind the ball (${back})`);
  assert.ok(Math.hypot(p.x - GC.A.x, p.z - GC.A.z) > Math.hypot(ball.x - GC.A.x, ball.z - GC.A.z), 'further from the goal than the ball');
  assert.ok(p.y > 50 && p.y < 600, `low, near ball height (${p.y})`);
  assert.deepEqual(p.target, { x: GC.A.x, y: 575, z: GC.A.z });
});

test('shooterViewPose: the goal mouth fills about 55% of the width, near or far', () => {
  for (const d of [3000, 6000, 12000]) {
    const ball = { x: 0, z: GOAL_Z.A + d };
    const aspect = 300 / 170;
    const p = shooterViewPose(ball, GC.A, aspect);
    const dist = Math.hypot(p.x - GC.A.x, p.z - GC.A.z, p.y - 575);
    const halfW = Math.tan(((p.fovDeg / 2) * Math.PI) / 180) * aspect * dist;   // half the view width at the goal
    const share = 800 / halfW;
    assert.ok(share > 0.45 && share < 0.65, `${d} mm: ${share.toFixed(2)}`);
    assert.ok(p.fovDeg >= 8 && p.fovDeg <= 70);
  }
});

test('the inset choice: on by default, stored as 1 / 0', () => {
  assert.equal(SHOOTER_INSET_STORAGE_KEY, 'floorball3d.shooterInset');
  assert.equal(parseShooterInsetShown(null), true);
  assert.equal(parseShooterInsetShown('0'), false);
});

const SITUATIONS = [
  { x: 1500, d: 6000 }, { x: -2500, d: 9000 }, { x: 6000, d: 12000 },   // slot, danger
  { x: 0, d: 20000 },                                                    // attention
  { x: 7000, d: 2000 }, { x: -6000, d: 1000 },                           // passing-first, both sides
];

test('idealGoaliePose: standing there, placement, depth and axis all judge ok, every zone and action, both ends', () => {
  for (const goal of ['A', 'B']) {
    for (const s of SITUATIONS) {
      const ball = { x: s.x, z: goal === 'A' ? s.d : 40000 - s.d };
      const zone = goalieZoneOf(ball, goal);
      for (const action of ['shot', 'pass', 'dribble']) {
        const targets = kataTargets(zone, action);
        const start = { x: 3000, z: GC[goal].z + (goal === 'A' ? 2500 : -2500), yaw: 1 };
        const pose = idealGoaliePose({ ball, goal, goalCenter: GC[goal], goalie: start, targets });
        const judged = judgeKata(kataOf({ ball, goal, goalCenter: GC[goal], goalie: pose }), targets);
        for (const dim of ['placement', 'depth', 'axis']) assert.equal(judged.status[dim], 'ok', `${goal} ${zone} ${action} ${dim}`);
      }
    }
  }
});

test('idealGoaliePose: awareness (all free) keeps the goalie where it is', () => {
  const ball = { x: 0, z: 33000 };
  const start = { x: 400, z: 4200, yaw: 0.3 };
  assert.deepEqual(idealGoaliePose({ ball, goal: 'A', goalCenter: GC.A, goalie: start, targets: kataTargets('awareness', 'shot') }), start);
});

// Resizable card: dragged by its bottom-left corner (the card hangs from
// the top-right), clamped so it stays readable and never covers most of
// the rink; remembered per browser.
test('inset size: default, stored size parsed safely, clamped to the stage', async () => {
  const { DEFAULT_INSET_SIZE, INSET_SIZE_STORAGE_KEY, parseInsetSize, clampInsetSize, resizeFromCorner } = await import('../web/src/shooter-view.js');
  assert.deepEqual(DEFAULT_INSET_SIZE, { w: 300, h: 170 });
  assert.equal(INSET_SIZE_STORAGE_KEY, 'floorball3d.shooterInsetSize');
  assert.deepEqual(parseInsetSize(JSON.stringify({ w: 420, h: 240 })), { w: 420, h: 240 });
  for (const bad of [null, '', 'x', '{"w":"a","h":1}', '[]']) assert.deepEqual(parseInsetSize(bad), DEFAULT_INSET_SIZE, String(bad));
  const stage = { w: 1376, h: 848 };
  assert.deepEqual(clampInsetSize({ w: 50, h: 20 }, stage), { w: 200, h: 112 });          // smallest readable
  assert.deepEqual(clampInsetSize({ w: 2000, h: 2000 }, stage), { w: 826, h: 509 });     // 60% of the stage
  assert.deepEqual(clampInsetSize({ w: 420, h: 240 }, stage), { w: 420, h: 240 });
});

test('resizeFromCorner: dragging the bottom-left corner left and down makes it bigger', async () => {
  const { resizeFromCorner } = await import('../web/src/shooter-view.js');
  assert.deepEqual(resizeFromCorner({ w: 300, h: 170 }, -100, 50), { w: 400, h: 220 });
  assert.deepEqual(resizeFromCorner({ w: 300, h: 170 }, 60, -30), { w: 240, h: 140 });
});

test('rectsOverlap: labels that would sit on the inset card are hidden', async () => {
  const { rectsOverlap } = await import('../web/src/shooter-view.js');
  const card = { left: 900, top: 70, right: 1420, bottom: 380 };
  assert.equal(rectsOverlap({ left: 1050, top: 285, right: 1200, bottom: 305 }, card), true);
  assert.equal(rectsOverlap({ left: 770, top: 340, right: 980, bottom: 368 }, card), true);   // the pill reaching under its edge
  assert.equal(rectsOverlap({ left: 230, top: 285, right: 385, bottom: 305 }, card), false);
  assert.equal(rectsOverlap({ left: 900, top: 380, right: 950, bottom: 400 }, card), false);  // touching is not overlapping
  assert.equal(rectsOverlap({ left: 1000, top: 100, right: 1100, bottom: 120 }, null), false);
});
