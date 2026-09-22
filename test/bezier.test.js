import { test } from 'node:test';
import assert from 'node:assert/strict';

const { bezierPos, segmentControls, lerpAngle } = await import('../web/src/authoring/bezier.js');

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('bezierPos endpoints hit p0 and p1', () => {
  assert.ok(close(bezierPos(0, 100, undefined, undefined, 0), 0));
  assert.ok(close(bezierPos(0, 100, undefined, undefined, 1), 100));
});

test('bezierPos with no controls degenerates to lerp', () => {
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const lerp = 100 * t;
    assert.ok(close(bezierPos(0, 100, undefined, undefined, t), lerp),
      `t=${t}: ${bezierPos(0, 100, undefined, undefined, t)} != ${lerp}`);
    assert.ok(close(bezierPos(0, 100, null, null, t), lerp));
  }
});

test('bezierPos with symmetric controls bows toward the control axis', () => {
  // Both controls pushed to +50 on a 0->0 baseline: curve should bulge to +37.5 at t=0.5
  const y = bezierPos(0, 0, 50, 50, 0.5);
  assert.ok(close(y, 37.5), `expected 37.5, got ${y}`);
});

test('segmentControls returns undefineds when no im1/im2 offsets present', () => {
  const pa = { x: 100, z: 200 };
  const pb = { x: 400, z: 800 };
  const out = segmentControls(pa, pb);
  assert.deepEqual(out, [undefined, undefined, undefined, undefined]);
});

test('segmentControls resolves im1 offset from pa and im2 offset from pb', () => {
  const pa = { x: 100, z: 200, im1: { dx: 30, dz: 40 } };
  const pb = { x: 500, z: 900, im2: { dx: -50, dz: -60 } };
  const [c1x, c1z, c2x, c2z] = segmentControls(pa, pb);
  assert.equal(c1x, 130);
  assert.equal(c1z, 240);
  assert.equal(c2x, 450);
  assert.equal(c2z, 840);
});

test('segmentControls tolerates missing pa or pb', () => {
  assert.deepEqual(segmentControls(null, { x: 0, z: 0 }), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(segmentControls({ x: 0, z: 0 }, null), [undefined, undefined, undefined, undefined]);
});

test('lerpAngle at t=0 and t=1 hits the endpoints', () => {
  assert.ok(close(lerpAngle(0.3, 1.5, 0), 0.3));
  assert.ok(close(lerpAngle(0.3, 1.5, 1), 1.5));
});

test('lerpAngle takes the short way around -PI/+PI', () => {
  // From +170deg to -170deg (=190deg wrap): straight lerp would go the long way through 0.
  const from = Math.PI * (170 / 180);
  const to = -Math.PI * (170 / 180);
  const mid = lerpAngle(from, to, 0.5);
  // Short-path midpoint is +180deg (== -180deg), NOT 0.
  assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 1e-9, `mid=${mid}`);
});

test('lerpAngle handles opposite-sign inputs across zero as a normal lerp', () => {
  const mid = lerpAngle(-0.5, 0.5, 0.5);
  assert.ok(close(mid, 0));
});
