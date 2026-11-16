// KATA marks on the rink (A-BACK-046 follow-up): the target band on the
// reference line, the ideal footprint, the facing rays with the turn arc and
// the placement offset. Pure geometry in world mm; left / right and turning
// follow kata.js (goal A faces +z, its left is +x; yaw grows turning left).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { kataMarks, RAY_MM, MIN_BAND_HALF_MM } = await import('../web/src/kata-visuals.js');
const { kataOf, kataTargets, judgeKata, POST_OFFSET_MM } = await import('../web/src/kata.js');
const { GOAL_Z } = await import('../web/src/authoring/ball-pose.js');
const { RINK_L } = await import('../web/src/constants.js');

const GC = { A: { x: 0, z: GOAL_Z.A }, B: { x: 0, z: GOAL_Z.B } };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Build the marks the way kata-readout.js will: measure, judge, draw.
function marks({ goal = 'A', ball, goalie, zone = 'slot', action = 'shot' }) {
  const targets = kataTargets(zone, action);
  const k = kataOf({ ball, goal, goalCenter: GC[goal], goalie });
  return kataMarks({ ball, goal, goalCenter: GC[goal], goalie, targets, judged: judgeKata(k, targets) });
}
const lineXAt = (ball, gc, z) => ball.x + ((z - ball.z) / (gc.z - ball.z)) * (gc.x - ball.x);

test('shot: the band lies on the shooting line 0.7 to 1.6 m out, at least 150 mm each side', () => {
  const ball = { x: 1500, z: GOAL_Z.A + 6000 };
  const m = marks({ ball, goalie: { x: 900, z: GOAL_Z.A + 800, yaw: 0 } });
  assert.equal(m.band.corners.length, 4);
  const [n0, n1, f1, f0] = m.band.corners;
  near(n0.z, GOAL_Z.A + 700); near(f0.z, GOAL_Z.A + 1600);
  const half = Math.max(100, MIN_BAND_HALF_MM);
  near((n0.x + n1.x) / 2, lineXAt(ball, GC.A, GOAL_Z.A + 700));
  near(n1.x - n0.x, 2 * half);
  near((f0.x + f1.x) / 2, lineXAt(ball, GC.A, GOAL_Z.A + 1600));
  near(m.footprint.z, GOAL_Z.A + 1150);
  near(m.footprint.x, lineXAt(ball, GC.A, GOAL_Z.A + 1150));
  assert.equal(m.band.inside, false);          // 0.9 m out but well off the line
});

test('pass: the band moves to the goal line, 0 to 0.5 m, 300 mm each side', () => {
  const ball = { x: 1500, z: GOAL_Z.A + 6000 };
  const m = marks({ ball, goalie: { x: 0, z: GOAL_Z.A + 300, yaw: 0 }, action: 'pass' });
  const [n0, n1, , f0] = m.band.corners;
  near(n0.z, GOAL_Z.A); near(f0.z, GOAL_Z.A + 500);
  near(n1.x - n0.x, 600);
});

test('inside the band and square: green band, one ray, no offset', () => {
  const ball = { x: 1500, z: GOAL_Z.A + 6000 };
  const z = GOAL_Z.A + 1100;
  const yaw = Math.atan2(ball.x - GC.A.x, ball.z - GC.A.z);
  const m = marks({ ball, goalie: { x: lineXAt(ball, GC.A, z), z, yaw } });
  assert.equal(m.band.inside, true);
  assert.equal(m.band.status, 'ok');
  assert.equal(m.offset, null);
  near(m.rays.turnDeg, 0, 1e-9);
  assert.equal(m.rays.status, 'ok');
  near(m.rays.target.to.x, m.rays.current.to.x, 1e-6);
});

test('rays: 2 m long; the turn is signed like kata.js (positive = turn left) and the arc runs the short way', () => {
  const ball = { x: 1500, z: GOAL_Z.A + 6000 };
  const g = { x: 900, z: GOAL_Z.A + 800, yaw: 0 };
  const m = marks({ ball, goalie: g });
  near(Math.hypot(m.rays.current.to.x - g.x, m.rays.current.to.z - g.z), RAY_MM);
  near(m.rays.current.to.x, g.x); near(m.rays.current.to.z, g.z + RAY_MM);
  const want = Math.atan2(1500, 6000) * 180 / Math.PI;      // square to the shot is to the goalie's left
  near(m.rays.turnDeg, want, 1e-9);
  assert.equal(m.rays.status, 'adjust');
  assert.ok(m.rays.arc.length >= 6);
  const first = m.rays.arc[0], last = m.rays.arc[m.rays.arc.length - 1];
  assert.ok(first.x < last.x, 'arc sweeps from the current ray toward +x (the left of goalie A)');
});

test('offset: from the goalie to the line at the goalie\'s depth, only when placement is off', () => {
  const ball = { x: 1500, z: GOAL_Z.A + 6000 };
  const g = { x: 900, z: GOAL_Z.A + 800, yaw: 0 };
  const m = marks({ ball, goalie: g });
  near(m.offset.from.x, 900); near(m.offset.to.z, g.z);
  near(m.offset.to.x, lineXAt(ball, GC.A, g.z));
  near(m.offset.m, (900 - lineXAt(ball, GC.A, g.z)) / 1000);
});

test('attention centres the band on the goal; passing-first sits by the ball-side post; parallel target ray', () => {
  const g = { x: 0, z: GOAL_Z.A + 200, yaw: 0.4 };
  let m = marks({ ball: { x: 4000, z: GOAL_Z.A + 15000 }, goalie: g, zone: 'attention' });
  near((m.band.corners[0].x + m.band.corners[1].x) / 2, 0);
  near(m.rays.target.to.x, g.x); near(m.rays.target.to.z, g.z + RAY_MM);   // knees parallel: straight out
  m = marks({ ball: { x: -6000, z: GOAL_Z.A - 1000 }, goalie: g, zone: 'passing', action: 'pass' });
  near((m.band.corners[0].x + m.band.corners[1].x) / 2, -POST_OFFSET_MM);   // ball on the -x side
});

test('awareness: no band, no footprint, no target ray, no offset', () => {
  const m = marks({ ball: { x: 0, z: 35000 }, goalie: { x: 0, z: GOAL_Z.A + 500, yaw: 0 }, zone: 'awareness' });
  assert.equal(m.band, null);
  assert.equal(m.footprint, null);
  assert.equal(m.rays.target, null);
  assert.equal(m.offset, null);
  assert.ok(m.rays.current);
});

test('goal B mirrors goal A', () => {
  const ballA = { x: 1500, z: GOAL_Z.A + 6000 };
  const gA = { x: 900, z: GOAL_Z.A + 800, yaw: 0.1 };
  const a = marks({ ball: ballA, goalie: gA });
  const b = marks({ goal: 'B', ball: { x: 1500, z: RINK_L - ballA.z }, goalie: { x: 900, z: RINK_L - gA.z, yaw: Math.PI - 0.1 } });
  a.band.corners.forEach((c, i) => { near(b.band.corners[i].x, c.x); near(b.band.corners[i].z, RINK_L - c.z); });
  near(b.footprint.z, RINK_L - a.footprint.z);
  near(b.rays.turnDeg, -a.rays.turnDeg, 1e-9);   // mirrored world: the same move is a turn the other way
  near(b.offset.m, a.offset.m);
});

test('Marks choice: on by default, stored as 1 / 0', async () => {
  const { KATA_MARKS_STORAGE_KEY, parseKataMarksShown } = await import('../web/src/kata-visuals.js');
  assert.equal(KATA_MARKS_STORAGE_KEY, 'floorball3d.kataMarks');
  assert.equal(parseKataMarksShown(null), true);
  assert.equal(parseKataMarksShown('0'), false);
  assert.equal(parseKataMarksShown('1'), true);
});
