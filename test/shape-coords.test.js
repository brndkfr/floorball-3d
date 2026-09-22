import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateShapeCoords } from '../web/src/authoring/shape-coords.js';

test('translateShapeCoords shifts arrow/freehand points', () => {
  const shape = { points: [{ x: 0, z: 0 }, { x: 10, z: 20 }] };
  translateShapeCoords(shape, 5, -5);
  assert.deepEqual(shape.points, [{ x: 5, z: -5 }, { x: 15, z: 15 }]);
});

test('translateShapeCoords shifts a rect/triangle/text anchor (x, z)', () => {
  const shape = { x: 100, z: 200, w: 50, h: 60 };
  translateShapeCoords(shape, 10, 10);
  assert.equal(shape.x, 110);
  assert.equal(shape.z, 210);
  // size fields untouched
  assert.equal(shape.w, 50);
  assert.equal(shape.h, 60);
});

test('translateShapeCoords shifts a circle centre (cx, cz), leaves radius alone', () => {
  const shape = { cx: 0, cz: 0, r: 40 };
  translateShapeCoords(shape, -20, 30);
  assert.equal(shape.cx, -20);
  assert.equal(shape.cz, 30);
  assert.equal(shape.r, 40);
});

test('translateShapeCoords is a no-op on fields the shape does not have', () => {
  const shape = { label: 'zone' };
  translateShapeCoords(shape, 5, 5);
  assert.deepEqual(shape, { label: 'zone' });
});

test('translateShapeCoords handles a shape carrying more than one representation', () => {
  const shape = { points: [{ x: 1, z: 1 }], x: 2, z: 2, cx: 3, cz: 3 };
  translateShapeCoords(shape, 1, 1);
  assert.deepEqual(shape.points, [{ x: 2, z: 2 }]);
  assert.equal(shape.x, 3);
  assert.equal(shape.z, 3);
  assert.equal(shape.cx, 4);
  assert.equal(shape.cz, 4);
});
