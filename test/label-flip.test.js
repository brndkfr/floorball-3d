import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldFlipFloorLabel } from '../web/src/authoring/label-flip.js';

test('no flip when text-run direction aligns with camera right', () => {
  assert.equal(shouldFlipFloorLabel({ x: 1, z: 0 }, { x: 1, z: 0 }), false);
  assert.equal(shouldFlipFloorLabel({ x: 0, z: 1 }, { x: 0, z: 1 }), false);
});

test('flip when camera right points against the text-run direction', () => {
  assert.equal(shouldFlipFloorLabel({ x: 1, z: 0 }, { x: -1, z: 0 }), true);
  assert.equal(shouldFlipFloorLabel({ x: 0, z: 1 }, { x: 0, z: -1 }), true);
});

test('perpendicular (dot = 0) keeps current orientation, does not flip', () => {
  assert.equal(shouldFlipFloorLabel({ x: 1, z: 0 }, { x: 0, z: 1 }), false);
  assert.equal(shouldFlipFloorLabel({ x: 0, z: 1 }, { x: 1, z: 0 }), false);
});

test('magnitudes do not matter, only sign of the dot product', () => {
  assert.equal(shouldFlipFloorLabel({ x: 5, z: 0 }, { x: 0.1, z: 0 }), false);
  assert.equal(shouldFlipFloorLabel({ x: 5, z: 0 }, { x: -0.1, z: 0 }), true);
});

test('diagonal cases: flip only when the projection is negative', () => {
  // arrow points NE (+x, +z); camera right = NW (-x, +z): dot = -1 + 1 = 0 -> no flip
  assert.equal(shouldFlipFloorLabel({ x: 1, z: 1 }, { x: -1, z: 1 }), false);
  // arrow points NE; camera right = SW: dot = -2 -> flip
  assert.equal(shouldFlipFloorLabel({ x: 1, z: 1 }, { x: -1, z: -1 }), true);
});
