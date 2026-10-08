// A-BACK-032: animated player figures. Pure gait math: which clip plays at
// which speed, where in its cycle it is (from distance covered, so feet
// don't slide), how fast / where a chip moves at a playback time, and
// which way the figure faces.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  GAIT_CLIPS,
  gaitWeights,
  clipPhase,
  chipMotionAt,
  facingYaw,
} = await import('../web/src/authoring/figure-gait.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const sum = (w) => Object.values(w).reduce((s, v) => s + v, 0);

test('gaitWeights: pure clip at rest and at each clip\'s native speed', () => {
  assert.deepEqual(gaitWeights(0), { idle: 1, walk: 0, jog: 0, sprint: 0 });
  assert.equal(gaitWeights(GAIT_CLIPS.walk.speedMps).walk, 1);
  assert.equal(gaitWeights(4).jog, 1);
  assert.equal(gaitWeights(GAIT_CLIPS.sprint.speedMps).sprint, 1);
  assert.equal(gaitWeights(20).sprint, 1);
});

test('gaitWeights: always sums to 1 and never blends more than two clips', () => {
  for (let v = 0; v <= 12; v += 0.05) {
    const w = gaitWeights(v);
    assert.ok(close(sum(w), 1), `sum at ${v} = ${sum(w)}`);
    assert.ok(Object.values(w).filter((x) => x > 0).length <= 2, `at ${v}: ${JSON.stringify(w)}`);
    for (const x of Object.values(w)) assert.ok(x >= 0 && x <= 1);
  }
});

test('gaitWeights: faster never shifts weight back to a slower gait', () => {
  const order = ['idle', 'walk', 'jog', 'sprint'];
  const score = (w) => order.reduce((s, k, i) => s + w[k] * i, 0);
  let prev = -1;
  for (let v = 0; v <= 12; v += 0.05) {
    const s = score(gaitWeights(v));
    assert.ok(s >= prev - 1e-9, `gait went backwards at ${v}`);
    prev = s;
  }
});

test('clipPhase: one loop per stride, wraps into [0, duration)', () => {
  const { strideM, durationS } = GAIT_CLIPS.jog;
  assert.equal(clipPhase(0, GAIT_CLIPS.jog), 0);
  assert.ok(close(clipPhase(strideM / 2, GAIT_CLIPS.jog), durationS / 2));
  assert.ok(close(clipPhase(strideM * 3 + strideM / 4, GAIT_CLIPS.jog), durationS / 4));
  assert.ok(clipPhase(strideM, GAIT_CLIPS.jog) < 1e-9); // a full loop wraps to 0
});

test('GAIT_CLIPS strides come from the root-motion export (distance per loop)', () => {
  assert.ok(close(GAIT_CLIPS.walk.strideM / GAIT_CLIPS.walk.durationS, GAIT_CLIPS.walk.speedMps));
  assert.ok(GAIT_CLIPS.walk.speedMps < GAIT_CLIPS.jog.speedMps);
  assert.ok(GAIT_CLIPS.jog.speedMps < GAIT_CLIPS.sprint.speedMps);
});

// Two frames: chip p1 runs 10 m along +x in 2 s; p2 stands still.
const frames = [
  { duration: 2000, scheme: { players: { p1: { x: 0, z: 0, angle: 0 }, p2: { x: 5000, z: 5000, angle: 1 } } } },
  { duration: 1000, scheme: { players: { p1: { x: 10000, z: 0, angle: 0 }, p2: { x: 5000, z: 5000, angle: 1 } } } },
  { duration: 1000, scheme: { players: { p1: { x: 10000, z: 3000, angle: 0 }, p2: { x: 5000, z: 5000, angle: 1 } } } },
];

test('chipMotionAt: straight run gives constant speed, heading along the path', () => {
  const m = chipMotionAt(frames, 'p1', 1000);
  assert.ok(close(m.speedMps, 5, 1e-3), `speed ${m.speedMps}`);
  // +x in the scene's yaw convention (rotation.y = atan2(dx, dz)) is +pi/2
  assert.ok(close(m.heading, Math.PI / 2, 1e-6));
  assert.ok(close(m.distanceM, 5, 1e-3), `distance ${m.distanceM}`);
});

test('chipMotionAt: distance accumulates across frames', () => {
  const m = chipMotionAt(frames, 'p1', 2500);  // 10 m + half of 3 m in 1 s
  assert.ok(close(m.distanceM, 11.5, 1e-2), `distance ${m.distanceM}`);
  assert.ok(close(m.speedMps, 3, 1e-2), `speed ${m.speedMps}`);
  assert.ok(close(m.heading, 0, 1e-6)); // +z
});

test('chipMotionAt: a standing chip has zero speed and distance', () => {
  const m = chipMotionAt(frames, 'p2', 1500);
  assert.equal(m.speedMps, 0);
  assert.equal(m.distanceM, 0);
});

test('chipMotionAt: past the end, single frame or unknown chip -> at rest', () => {
  assert.equal(chipMotionAt(frames, 'p1', 99999).speedMps, 0);
  assert.equal(chipMotionAt([frames[0]], 'p1', 0).speedMps, 0);
  assert.equal(chipMotionAt(frames, 'nope', 500).speedMps, 0);
});

test('chipMotionAt: bezier curve is longer than its chord', () => {
  const curved = [
    { duration: 1000, scheme: { players: { p: { x: 0, z: 0, im1: { dx: 0, dz: 4000 } } } } },
    { duration: 1000, scheme: { players: { p: { x: 6000, z: 0, im2: { dx: 0, dz: 4000 } } } } },
  ];
  assert.ok(chipMotionAt(curved, 'p', 999.9).distanceM > 6.5);
});

test('facingYaw: standing keeps the authored angle, running faces the run', () => {
  assert.equal(facingYaw(0.3, 2.0, 0), 0.3);
  assert.ok(close(facingYaw(0.3, 2.0, 3), 2.0));
  // halfway through the blend band it is between the two, the short way round
  const mid = facingYaw(3.0, -3.0, 0.5);
  assert.ok(Math.abs(Math.atan2(Math.sin(mid - Math.PI), Math.cos(mid - Math.PI))) < 0.3, `mid ${mid}`);
});
