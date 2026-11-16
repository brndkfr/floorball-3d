// A-BACK-046: the KATA readout for the goalie (placement, depth, axis; body
// waits for A-BACK-042). Left / right are the goalie's own, facing out of
// the goal: goal A faces +z (left = +x), goal B faces -z (left = -x).
// Target ranges are estimates, commented at their definition.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { kataOf, kataTargets, judgeKata, expectedAction, KATA_DIMS } = await import('../web/src/kata.js');
const { GOAL_Z } = await import('../web/src/authoring/ball-pose.js');

const GC = { A: { x: 0, z: GOAL_Z.A }, B: { x: 0, z: GOAL_Z.B } };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('the three dimensions measured today, body later', () => {
  assert.deepEqual(KATA_DIMS, ['body', 'placement', 'depth', 'axis']);
});

test('kataOf: on the shooting line, 1 m out, facing the ball square', () => {
  const ball = { x: 0, z: GOAL_Z.A + 8000 };
  const k = kataOf({ ball, goal: 'A', goalCenter: GC.A, goalie: { x: 0, z: GOAL_Z.A + 1000, yaw: 0 } });
  near(k.placementLeftMm, 0);
  near(k.depthMm, 1000);
  near(k.axisDeg, 0);
  near(k.axisToLineDeg, 0);
});

test('kataOf: left / right and turns are the goalie\'s own, at both ends', () => {
  // goal A, goalie 300 mm to +x = its left; turned +20 deg = to its left
  const a = kataOf({ ball: { x: 0, z: GOAL_Z.A + 8000 }, goal: 'A', goalCenter: GC.A, goalie: { x: 300, z: GOAL_Z.A + 1000, yaw: 20 * Math.PI / 180 } });
  near(a.placementLeftMm, 300);
  near(a.axisDeg, 20, 1e-9);
  // goal B, goalie 300 mm to -x = its left, facing -z (yaw pi)
  const b = kataOf({ ball: { x: 0, z: GOAL_Z.B - 8000 }, goal: 'B', goalCenter: GC.B, goalie: { x: -300, z: GOAL_Z.B - 1000, yaw: Math.PI } });
  near(b.placementLeftMm, 300);
  near(b.depthMm, 1000);
  near(b.axisDeg, 0, 1e-9);
  near(b.axisToLineDeg, 0, 1e-9);
});

test('kataOf: placement is measured off the shooting line at the goalie\'s depth; the axis against the line', () => {
  // ball 4 m to +x (goalie A's left), 8 m out: the line at 1 m depth is at x = 500
  const k = kataOf({ ball: { x: 4000, z: GOAL_Z.A + 8000 }, goal: 'A', goalCenter: GC.A, goalie: { x: 500, z: GOAL_Z.A + 1000, yaw: 0 } });
  near(k.placementLeftMm, 0);
  near(k.axisDeg, -Math.atan2(4000, 8000) * 180 / Math.PI, 1e-9);   // square would mean turning left
  near(k.axisToLineDeg, 0);
  assert.equal(k.ballSide, 1);   // ball on the goalie's left
});

test('kataTargets: shot square and forward, pass deep and parallel, attention centred, passing-first on the post, awareness free', () => {
  assert.deepEqual(kataTargets('danger', 'shot'), { placement: { ref: 'line', tol: 100 }, depth: { min: 700, max: 1600 }, axis: { ref: 'shot', tol: 10 } });
  assert.deepEqual(kataTargets('slot', 'shot'), kataTargets('danger', 'shot'));
  assert.deepEqual(kataTargets('danger', 'pass'), { placement: { ref: 'line', tol: 300 }, depth: { min: 0, max: 500 }, axis: { ref: 'goalLine', tol: 10 } });
  assert.deepEqual(kataTargets('danger', 'dribble'), { placement: { ref: 'line', tol: 100 }, depth: { min: 700, max: 1600 }, axis: { ref: 'shot', tol: 15 } });
  assert.deepEqual(kataTargets('attention', 'shot'), { placement: { ref: 'goal', tol: 150 }, depth: { min: 0, max: 500 }, axis: { ref: 'goalLine', tol: 15 } });
  assert.deepEqual(kataTargets('passing', 'pass'), { placement: { ref: 'post', tol: 200 }, depth: { min: 0, max: 200 }, axis: { ref: 'goalLine', tol: 10 } });
  assert.deepEqual(kataTargets('awareness', 'shot'), { placement: null, depth: null, axis: null });
});

const kata = (over) => ({ placementLeftMm: 0, depthMm: 1000, axisDeg: 0, axisToLineDeg: 0, offsetFromGoalLeftMm: 0, ballSide: 0, ...over });

test('judgeKata: all in range is ok, body is pending, one "good" hint', () => {
  const j = judgeKata(kata(), kataTargets('danger', 'shot'));
  assert.deepEqual(j.status, { body: 'pending', placement: 'ok', depth: 'ok', axis: 'ok' });
  assert.equal(j.worst, null);
  assert.deepEqual(j.hint, { key: 'goalie.hint.ok', vars: {} });
});

test('judgeKata: awareness is free', () => {
  const j = judgeKata(kata({ depthMm: 5000 }), kataTargets('awareness', 'shot'));
  assert.deepEqual(j.status, { body: 'pending', placement: 'free', depth: 'free', axis: 'free' });
  assert.deepEqual(j.hint, { key: 'goalie.hint.free', vars: {} });
});

test('judgeKata: the worst dimension carries the hint, in the goalie\'s own words', () => {
  const t = kataTargets('danger', 'shot');
  // 0.5 m left of the line (4x the tolerance) beats 5 deg too far turned (0.5x)
  let j = judgeKata(kata({ placementLeftMm: 500, axisDeg: 15 }), t);
  assert.equal(j.status.placement, 'adjust');
  assert.equal(j.status.axis, 'adjust');
  assert.equal(j.worst, 'placement');
  assert.deepEqual(j.hint, { key: 'goalie.hint.placement.right', vars: { m: '0.5' } });

  j = judgeKata(kata({ placementLeftMm: -260 }), t);
  assert.deepEqual(j.hint, { key: 'goalie.hint.placement.left', vars: { m: '0.3' } });

  j = judgeKata(kata({ depthMm: 200 }), t);                          // too deep for a shot
  assert.deepEqual(j.hint, { key: 'goalie.hint.depth.forward', vars: { m: '0.5' } });
  j = judgeKata(kata({ depthMm: 2100 }), t);
  assert.deepEqual(j.hint, { key: 'goalie.hint.depth.back', vars: { m: '0.5' } });

  j = judgeKata(kata({ axisDeg: -30 }), t);                          // turned right of square
  assert.deepEqual(j.hint, { key: 'goalie.hint.axis.square.left', vars: { deg: 30 } });
  j = judgeKata(kata({ axisToLineDeg: 25, depthMm: 300 }), kataTargets('danger', 'pass'));
  assert.equal(j.worst, 'axis');
  assert.deepEqual(j.hint, { key: 'goalie.hint.axis.parallel.right', vars: { deg: 25 } });
});

test('judgeKata: attention centres on the goal, passing-first on the ball-side post', () => {
  let j = judgeKata(kata({ depthMm: 200, placementLeftMm: 900, offsetFromGoalLeftMm: 100 }), kataTargets('attention', 'shot'));
  assert.equal(j.status.placement, 'ok');                            // the shooting line does not matter here
  j = judgeKata(kata({ depthMm: 100, offsetFromGoalLeftMm: 0, ballSide: 1 }), kataTargets('passing', 'pass'));
  assert.equal(j.status.placement, 'adjust');
  assert.deepEqual(j.hint, { key: 'goalie.hint.placement.left', vars: { m: '0.5' } });
  j = judgeKata(kata({ depthMm: 100, offsetFromGoalLeftMm: -450, ballSide: -1 }), kataTargets('passing', 'pass'));
  assert.equal(j.status.placement, 'ok');
});

// --- expected action from the play -----------------------------------------
const frame = (scheme, duration = 1000) => ({ id: Math.random().toString(36), duration, scheme });
const p = (id, x, z) => ({ id, team: 1, number: 1, x, z });

test('expectedAction: the next ball event of the play; a carrier with nothing next dribbles; else a shot', () => {
  const players = { a: p('a', 0, 12000), b: p('b', 4000, 12000) };
  const passThenShot = [
    frame({ players, balls: { main: { x: 0, z: 12000, carrier: 'a' } } }),
    frame({ players, balls: { main: { x: 4000, z: 12000, carrier: 'b' } } }),
    frame({ players, balls: { main: { x: 0, z: GOAL_Z.A - 400, carrier: null, shot: { goal: 'A', aimX: 0, aimY: 500 } } } }),
  ];
  assert.equal(expectedAction(passThenShot, 0), 'pass');
  assert.equal(expectedAction(passThenShot, 1200), 'shot');
  const carry = [frame({ players, balls: { main: { x: 0, z: 12000, carrier: 'a' } } })];
  assert.equal(expectedAction(carry, 0), 'dribble');
  assert.equal(expectedAction([frame({ players: {}, balls: { main: { x: 0, z: 9000, carrier: null } } })], 0), 'shot');
  assert.equal(expectedAction([], 0), 'shot');
});

// Tight angle (A-BACK-049 finding): a ball wide and close to the goal line
// is still the danger zone, but stepping out on the shooting line would put
// the goalie metres to the side. From a tight angle the targets are the
// passing-first ones: on the line at the ball-side post.
test('shotAngleDeg: angle between the shooting line and the goal line, 0 behind it, both ends', async () => {
  const { shotAngleDeg } = await import('../web/src/kata.js');
  const gcA = { x: 0, z: GOAL_Z.A }, gcB = { x: 0, z: GOAL_Z.B };
  near(shotAngleDeg({ x: 0, z: GOAL_Z.A + 5000 }, 'A', gcA), 90);
  near(shotAngleDeg({ x: 4000, z: GOAL_Z.A + 4000 }, 'A', gcA), 45);
  near(shotAngleDeg({ x: -4000, z: GOAL_Z.A + 4000 }, 'A', gcA), 45);
  near(shotAngleDeg({ x: 4000, z: GOAL_Z.B - 4000 }, 'B', gcB), 45);
  assert.equal(shotAngleDeg({ x: 2000, z: GOAL_Z.A - 1000 }, 'A', gcA), 0);
  assert.equal(shotAngleDeg({ x: 2000, z: GOAL_Z.B + 1000 }, 'B', gcB), 0);
});

test('kataTargets: below the tight angle, danger and slot use the passing-first targets; above it and without an angle, unchanged', async () => {
  const { TIGHT_ANGLE_DEG } = await import('../web/src/kata.js');
  for (const zone of ['danger', 'slot']) {
    for (const action of ['shot', 'pass', 'dribble']) {
      assert.deepEqual(kataTargets(zone, action, TIGHT_ANGLE_DEG - 1), kataTargets('passing', action), `${zone} ${action}`);
      assert.deepEqual(kataTargets(zone, action, TIGHT_ANGLE_DEG + 1), kataTargets(zone, action), `${zone} ${action}`);
    }
  }
  assert.deepEqual(kataTargets('attention', 'shot', 5), kataTargets('attention', 'shot'));
  assert.ok(TIGHT_ANGLE_DEG > 10 && TIGHT_ANGLE_DEG < 40);
});
