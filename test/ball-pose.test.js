import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ballPoseAt, passFlightPos, BALL_CARRY_OFFSET, PASS_FLIGHT_S } = await import('../web/src/authoring/ball-pose.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const OFF = BALL_CARRY_OFFSET;
const frame = (players, ball) => ({ players, balls: ball ? { main: ball } : {} });
const P7a = { id: 'p7', x: 0, z: 10000 };
const P7b = { id: 'p7', x: 2000, z: 14000 };
const P9 = { id: 'p9', x: 4000, z: 20000 };

test('no ball in the frame -> null', () => {
  assert.equal(ballPoseAt(frame({}, null), frame({}, null), 0.5, () => null), null);
});

test('loose in both frames -> lerp of the stored positions', () => {
  const p = ballPoseAt(frame({}, { x: 0, z: 0, carrier: null }), frame({}, { x: 1000, z: 2000, carrier: null }), 0.25, () => null);
  assert.ok(close(p.x, 250) && close(p.z, 500));
});

test('same carrier in both frames -> ball follows the live (interpolated) carrier', () => {
  const fa = frame({ p7: P7a }, { x: -1, z: -1, carrier: 'p7' });
  const fb = frame({ p7: P7b }, { x: -1, z: -1, carrier: 'p7' });
  const p = ballPoseAt(fa, fb, 0.5, (id) => (id === 'p7' ? { x: 1234, z: 5678 } : null));
  assert.ok(close(p.x, 1234 + OFF.x) && close(p.z, 5678 + OFF.z));
});

test('carrier changes (a pass) -> flies from old carrier in frame A to new carrier in frame B', () => {
  const fa = frame({ p7: P7a, p9: P9 }, { x: -1, z: -1, carrier: 'p7' });
  const fb = frame({ p7: P7b, p9: P9 }, { x: -1, z: -1, carrier: 'p9' });
  const at = (t) => ballPoseAt(fa, fb, t, () => null);
  assert.ok(close(at(0).x, P7a.x + OFF.x) && close(at(0).z, P7a.z + OFF.z));
  assert.ok(close(at(1).x, P9.x + OFF.x) && close(at(1).z, P9.z + OFF.z));
  const mid = at(0.5);
  assert.ok(close(mid.x, (P7a.x + P9.x) / 2 + OFF.x) && close(mid.z, (P7a.z + P9.z) / 2 + OFF.z));
});

test('loose -> picked up flies from the stored spot to the new carrier', () => {
  const fa = frame({ p9: P9 }, { x: 0, z: 0, carrier: null });
  const fb = frame({ p9: P9 }, { x: 0, z: 0, carrier: 'p9' });
  const p = ballPoseAt(fa, fb, 1, () => null);
  assert.ok(close(p.x, P9.x + OFF.x) && close(p.z, P9.z + OFF.z));
});

test('carrier id missing from the frame falls back to the stored position', () => {
  const fa = frame({}, { x: 100, z: 200, carrier: 'gone' });
  const p = ballPoseAt(fa, fa, 0.5, () => null);
  assert.ok(close(p.x, 100) && close(p.z, 200));
});

test('frame B without a ball holds frame A', () => {
  const p = ballPoseAt(frame({}, { x: 5, z: 6, carrier: null }), frame({}, null), 0.7, () => null);
  assert.ok(close(p.x, 5) && close(p.z, 6));
});

test('passFlightPos: starts at from, ends at to, eases, and reports done', () => {
  const from = { x: 0, z: 0 }, to = { x: 1000, z: 0 };
  assert.deepEqual(passFlightPos(from, to, 0).pos, { x: 0, z: 0 });
  const mid = passFlightPos(from, to, PASS_FLIGHT_S / 2);
  assert.ok(mid.pos.x > 500 && mid.pos.x < 1000, `ease-out: ${mid.pos.x}`);
  assert.equal(mid.done, false);
  const end = passFlightPos(from, to, PASS_FLIGHT_S * 2);
  assert.deepEqual(end, { pos: { x: 1000, z: 0 }, done: true });
});
