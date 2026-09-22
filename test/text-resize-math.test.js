import { test } from 'node:test';
import assert from 'node:assert/strict';

const { topdownAxes, textCorners, resizeFromCornerDrag } =
  await import('../web/src/authoring/text-resize-math.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('topdownAxes: default up=(0,0,-1) gives right=(+1,0)', () => {
  const { up, right } = topdownAxes({ x: 0, y: 0, z: -1 });
  assert.ok(close(up.x, 0));
  assert.ok(close(up.z, -1));
  assert.ok(close(right.x, 1));
  assert.ok(close(right.z, 0));
});

test('topdownAxes: 90 deg rotated up=(1,0,0) gives right=(0,+1)', () => {
  const { up, right } = topdownAxes({ x: 1, y: 0, z: 0 });
  assert.ok(close(up.x, 1));
  assert.ok(close(up.z, 0));
  assert.ok(close(right.x, 0));
  assert.ok(close(right.z, 1));
});

test('topdownAxes normalizes a non-unit input', () => {
  const { up, right } = topdownAxes({ x: 3, y: 0, z: 0 });
  assert.ok(close(Math.hypot(up.x, up.z), 1));
  assert.ok(close(Math.hypot(right.x, right.z), 1));
});

test('textCorners: axis-aligned camera (up=-Z) puts NW at (cx-w/2, cz-h/2)', () => {
  const right = { x: 1, z: 0 };
  const up = { x: 0, z: -1 };
  const [nw, ne, se, sw] = textCorners(100, 200, 40, 20, right, up);
  // up.z = -1 means "screen up" = world -Z, so NW has smaller z (190),
  // SE has larger z (210).
  assert.deepEqual(nw, { x: 80, z: 190 });
  assert.deepEqual(ne, { x: 120, z: 190 });
  assert.deepEqual(se, { x: 120, z: 210 });
  assert.deepEqual(sw, { x: 80, z: 210 });
});

test('textCorners: rotated camera (up=+X) swaps world axes', () => {
  // right = (0, +1) (world +Z), up = (1, 0) (world +X)
  const right = { x: 0, z: 1 };
  const up = { x: 1, z: 0 };
  const [nw, ne, se, sw] = textCorners(0, 0, 100, 40, right, up);
  // "wider" direction (w=100) runs along right = +Z: nw.z=-50, ne.z=+50
  // "taller" direction (h=40) runs along up = +X: nw.x=+20, sw.x=-20
  assert.ok(close(nw.z, -50) && close(nw.x, 20));
  assert.ok(close(ne.z, 50) && close(ne.x, 20));
  assert.ok(close(se.z, 50) && close(se.x, -20));
  assert.ok(close(sw.z, -50) && close(sw.x, -20));
});

test('resizeFromCornerDrag: dragging SE to its own corner is a no-op', () => {
  const right = { x: 1, z: 0 };
  const up = { x: 0, z: -1 };
  const [, , se] = textCorners(0, 0, 100, 40, right, up);
  const out = resizeFromCornerDrag({
    cx: 0, cz: 0, w: 100, h: 40, size: 40,
    right, up, cornerIndex: 2, // SE
    worldX: se.x, worldZ: se.z,
    minSize: 10, maxSize: 1000,
  });
  assert.ok(close(out.newSize, 40));
  assert.ok(close(out.newCx, 0));
  assert.ok(close(out.newCz, 0));
});

test('resizeFromCornerDrag: dragging SE outward by 2x scales size 2x, anchor NW stays fixed', () => {
  const right = { x: 1, z: 0 };
  const up = { x: 0, z: -1 };
  const [nw] = textCorners(0, 0, 100, 40, right, up);
  // NW is at (-50, -20). SE original at (50, 20). Doubling diag from
  // NW means dragging SE to NW + 2*(SE-NW) = (150, 60).
  const out = resizeFromCornerDrag({
    cx: 0, cz: 0, w: 100, h: 40, size: 40,
    right, up, cornerIndex: 2,
    worldX: 150, worldZ: 60,
    minSize: 10, maxSize: 1000,
  });
  assert.ok(close(out.newSize, 80), `newSize=${out.newSize}`);
  // Anchor NW at (-50, -20) is fixed; new bbox is 200x80.
  // New centre = NW + halfW*right + (-halfH)*up = (-50,-20)+(100,0)+(0,40) = (50, 20).
  assert.ok(close(out.newCx, 50), `newCx=${out.newCx}`);
  assert.ok(close(out.newCz, 20), `newCz=${out.newCz}`);
  // Verify anchor really is preserved by recomputing corners.
  const [nw2] = textCorners(out.newCx, out.newCz, 100 * 2, 40 * 2, right, up);
  assert.ok(close(nw2.x, nw.x));
  assert.ok(close(nw2.z, nw.z));
});

test('resizeFromCornerDrag: clamps at maxSize and adjusts centre accordingly', () => {
  const right = { x: 1, z: 0 };
  const up = { x: 0, z: -1 };
  const out = resizeFromCornerDrag({
    cx: 0, cz: 0, w: 100, h: 40, size: 40,
    right, up, cornerIndex: 2, // SE
    worldX: 10000, worldZ: -4000,
    minSize: 10, maxSize: 80, // caps at 2x
  });
  assert.ok(close(out.newSize, 80));
});

test('resizeFromCornerDrag: rotated camera (up=+X) still keeps aspect', () => {
  const right = { x: 0, z: 1 };
  const up = { x: 1, z: 0 };
  // Drag NW (index 0) outward: anchor is SE.
  const [, , se] = textCorners(0, 0, 100, 40, right, up);
  // Move NW to 2x the original diag from SE.
  // NW original relative to SE: -(right * w) + (up * h) = (0,-100) + (40, 0) = (40, -100)
  // 2x that from SE (which is at (-20, 50)): SE + 2*(40,-100) = (60, -150)
  const out = resizeFromCornerDrag({
    cx: 0, cz: 0, w: 100, h: 40, size: 40,
    right, up, cornerIndex: 0,
    worldX: 60, worldZ: -150,
    minSize: 10, maxSize: 1000,
  });
  assert.ok(close(out.newSize, 80), `newSize=${out.newSize}`);
  // Anchor SE at (-20, 50) is fixed; new bbox is 200x80.
  // New centre = SE + (-right * newW/2 + up * newH/2) = (-20, 50) + ((0,-100) + (40,0)) = (20, -50)
  assert.ok(close(out.newCx, 20), `newCx=${out.newCx}`);
  assert.ok(close(out.newCz, -50), `newCz=${out.newCz}`);
});
