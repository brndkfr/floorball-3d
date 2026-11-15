// A-BACK-042 step 2: goal coverage tests rays against a proxy of capsules
// and boxes instead of the ~10k-triangle goalie mesh. Pure ray math,
// goalie-local mm.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { rayHitsCapsule, rayHitsBox, rayHitsProxy } = await import('../web/src/goalie-proxy-math.js');

const P = (x, y, z) => ({ x, y, z });
const dir = (x, y, z) => { const l = Math.hypot(x, y, z); return P(x / l, y / l, z / l); };
// vertical capsule, axis x = 0, z = 0, y 0..1000, radius 100
const CAP = { type: 'capsule', a: P(0, 0, 0), b: P(0, 1000, 0), r: 100 };

test('rayHitsCapsule: through the middle of the side hits, beside it misses', () => {
  assert.equal(rayHitsCapsule(P(0, 500, -5000), dir(0, 0, 1), 10000, CAP), true);
  assert.equal(rayHitsCapsule(P(99, 500, -5000), dir(0, 0, 1), 10000, CAP), true);
  assert.equal(rayHitsCapsule(P(101, 500, -5000), dir(0, 0, 1), 10000, CAP), false);
});

test('rayHitsCapsule: the rounded ends count, beyond them nothing', () => {
  assert.equal(rayHitsCapsule(P(0, 1080, -5000), dir(0, 0, 1), 10000, CAP), true);   // top cap
  assert.equal(rayHitsCapsule(P(0, 1101, -5000), dir(0, 0, 1), 10000, CAP), false);
  assert.equal(rayHitsCapsule(P(70, 1070, -5000), dir(0, 0, 1), 10000, CAP), true);  // sqrt(70^2+70^2) < 100
  assert.equal(rayHitsCapsule(P(80, 1080, -5000), dir(0, 0, 1), 10000, CAP), false); // sqrt(80^2+80^2) > 100
});

test('rayHitsCapsule: only hits in front of the origin and before `far`', () => {
  assert.equal(rayHitsCapsule(P(0, 500, -5000), dir(0, 0, -1), 10000, CAP), false);  // pointing away
  assert.equal(rayHitsCapsule(P(0, 500, -5000), dir(0, 0, 1), 4800, CAP), false);    // stops short
  assert.equal(rayHitsCapsule(P(0, 500, -5000), dir(0, 0, 1), 4950, CAP), true);
});

test('rayHitsCapsule: a ray along the axis and a degenerate capsule (sphere)', () => {
  assert.equal(rayHitsCapsule(P(0, -3000, 0), dir(0, 1, 0), 10000, CAP), true);
  const ball = { type: 'capsule', a: P(0, 0, 0), b: P(0, 0, 0), r: 50 };
  assert.equal(rayHitsCapsule(P(-1000, 40, 0), dir(1, 0, 0), 5000, ball), true);
  assert.equal(rayHitsCapsule(P(-1000, 60, 0), dir(1, 0, 0), 5000, ball), false);
});

test('rayHitsBox: slab test with far and direction', () => {
  const box = { type: 'box', min: P(-500, 0, -200), max: P(500, 250, 200) };
  assert.equal(rayHitsBox(P(0, 100, -3000), dir(0, 0, 1), 10000, box), true);
  assert.equal(rayHitsBox(P(0, 300, -3000), dir(0, 0, 1), 10000, box), false);
  assert.equal(rayHitsBox(P(600, 100, -3000), dir(0, 0, 1), 10000, box), false);
  assert.equal(rayHitsBox(P(0, 100, -3000), dir(0, 0, -1), 10000, box), false);
  assert.equal(rayHitsBox(P(0, 100, -3000), dir(0, 0, 1), 2700, box), false);
  // a slanted ray from above, coming down onto the top face
  assert.equal(rayHitsBox(P(0, 1000, -3000), dir(0, -900, 3000), 10000, box), true);
});

test('rayHitsProxy: any shape blocks; an empty proxy blocks nothing', () => {
  const shapes = [CAP, { type: 'box', min: P(400, 0, -50), max: P(600, 100, 50) }];
  assert.equal(rayHitsProxy(P(500, 50, -3000), dir(0, 0, 1), 10000, shapes), true);
  assert.equal(rayHitsProxy(P(0, 500, -3000), dir(0, 0, 1), 10000, shapes), true);
  assert.equal(rayHitsProxy(P(300, 500, -3000), dir(0, 0, 1), 10000, shapes), false);
  assert.equal(rayHitsProxy(P(0, 500, -3000), dir(0, 0, 1), 10000, []), false);
});
