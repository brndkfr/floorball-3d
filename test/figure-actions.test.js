// A-BACK-041 step 2: the ball events each player takes part in, read from
// the doc (figure-actions.js actionsFor). Timing comes from ball-pose.js
// passPlan, never re-derived here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { actionsFor } = await import('../web/src/authoring/figure-actions.js');
const { passPlan, DEFAULT_RELEASE_T } = await import('../web/src/authoring/ball-pose.js');

const D = 1000;
const frame = (players, main, duration = D) => ({ id: 'f', duration, scheme: { players, balls: main ? { main } : {}, shapes: [] } });
const A = { team: 1, x: 0, z: 10000 };
const B = { team: 1, x: 3000, z: 16000 };
const X = { team: 2, x: -8000, z: 30000 };   // far from the lane

// a passes to b over one segment
const passFrames = () => [
  frame({ a: A, b: B, x: X }, { x: 0, z: 10250, carrier: 'a' }),
  frame({ a: A, b: B, x: X }, { x: 3000, z: 16250, carrier: 'b' }),
];

const yawOf = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('a pass gives the passer one pass at the release time, aimed along the flight', () => {
  const frames = passFrames();
  const plan = passPlan(frames[0].scheme, frames[1].scheme, D);
  const { actions } = actionsFor(frames, 'a');
  assert.equal(actions.length, 1);
  const [p] = actions;
  assert.equal(p.kind, 'pass');
  assert.ok(close(p.tMs, plan.releaseT * D), `release at ${p.tMs}`);
  assert.ok(close(plan.releaseT, DEFAULT_RELEASE_T));
  assert.equal(p.partnerId, 'b');
  assert.ok(close(p.speedMps, plan.speedMps));
  assert.ok(close(p.dirYaw, yawOf(plan.from, plan.to)));
});

test('the receiver gets one receive at the arrival time, facing the incoming ball', () => {
  const frames = passFrames();
  const plan = passPlan(frames[0].scheme, frames[1].scheme, D);
  const { actions } = actionsFor(frames, 'b');
  assert.equal(actions.length, 1);
  const [r] = actions;
  assert.equal(r.kind, 'receive');
  assert.ok(close(r.tMs, plan.arriveT * D), `arrival at ${r.tMs}`);
  assert.ok(r.tMs > plan.releaseT * D);
  assert.equal(r.partnerId, 'a');
  assert.ok(close(r.dirYaw, yawOf(plan.to, plan.from)));
});

test('a shot gives the shooter one shot with its aim', () => {
  const frames = [
    frame({ a: A }, { x: 0, z: 10250, carrier: 'a' }),
    frame({ a: A }, { x: 200, z: 21800, carrier: null, shot: { goal: 'B', aimX: 200, aimY: 600 } }),
  ];
  const { actions } = actionsFor(frames, 'a');
  assert.equal(actions.length, 1);
  const [s] = actions;
  assert.equal(s.kind, 'shot');
  assert.deepEqual(s.aim, { goal: 'B', aimX: 200, aimY: 600 });
  assert.equal(s.partnerId, null);
  assert.ok(s.speedMps > 0);
});

test('a doc without ball events gives nothing', () => {
  const frames = [frame({ a: A, b: B }, { x: 5000, z: 5000, carrier: null }), frame({ a: { ...A, z: 12000 }, b: B }, { x: 5000, z: 5000, carrier: null })];
  for (const id of ['a', 'b']) assert.deepEqual(actionsFor(frames, id), { actions: [], carryIntervals: [] });
  assert.deepEqual(actionsFor([], 'a'), { actions: [], carryIntervals: [] });
  assert.deepEqual(actionsFor(passFrames(), 'x'), { actions: [], carryIntervals: [] });
});

test('carry intervals: the passer until the release, the receiver from the arrival on', () => {
  const frames = passFrames();
  const plan = passPlan(frames[0].scheme, frames[1].scheme, D);
  assert.deepEqual(actionsFor(frames, 'a').carryIntervals, [{ fromMs: 0, toMs: plan.releaseT * D }]);
  assert.deepEqual(actionsFor(frames, 'b').carryIntervals, [{ fromMs: plan.arriveT * D, toMs: Infinity }]);
});

test('a carrier who keeps the ball carries throughout, also in a one-frame doc', () => {
  const keep = [frame({ a: A }, { x: 0, z: 10250, carrier: 'a' }), frame({ a: { ...A, z: 14000 } }, { x: 0, z: 14250, carrier: 'a' })];
  assert.deepEqual(actionsFor(keep, 'a'), { actions: [], carryIntervals: [{ fromMs: 0, toMs: Infinity }] });
  assert.deepEqual(actionsFor([keep[0]], 'a').carryIntervals, [{ fromMs: 0, toMs: Infinity }]);
});

test('events over several segments are sorted, with times from the start of playback', () => {
  // a -> b in segment 0 (1000 ms), b -> a in segment 1 (2000 ms)
  const frames = [
    frame({ a: A, b: B }, { x: 0, z: 10250, carrier: 'a' }),
    frame({ a: A, b: B }, { x: 3000, z: 16250, carrier: 'b' }, 2000),
    frame({ a: A, b: B }, { x: 0, z: 10250, carrier: 'a' }),
  ];
  const back = passPlan(frames[1].scheme, frames[2].scheme, 2000);
  const { actions, carryIntervals } = actionsFor(frames, 'a');
  assert.deepEqual(actions.map((x) => x.kind), ['pass', 'receive']);
  assert.ok(actions[0].tMs < actions[1].tMs);
  assert.ok(close(actions[1].tMs, D + back.arriveT * 2000));
  assert.equal(carryIntervals.length, 2);
  assert.equal(carryIntervals[1].toMs, Infinity);
  const b = actionsFor(frames, 'b');
  assert.deepEqual(b.actions.map((x) => x.kind), ['receive', 'pass']);
  assert.ok(close(b.actions[1].tMs, D + back.releaseT * 2000));
  assert.deepEqual(b.carryIntervals.map((c) => [c.fromMs, c.toMs]).length, 1);
});
