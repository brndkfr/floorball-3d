// S-BACK-030 step 3: soft blob shadows under figures, goalies and balls in
// the 3D view. The sizing / fading math is pure; the meshes are built in
// the same module but need three and a DOM canvas, so only the math is
// tested here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blobRadiusFor, blobAt, BLOB_KINDS } from '../web/src/blob-shadow-math.js';

test('every kind has a radius, ordered ball < figure < goalie', () => {
  for (const kind of BLOB_KINDS) assert.ok(blobRadiusFor(kind) > 0, kind);
  assert.ok(blobRadiusFor('ball') < blobRadiusFor('figure'));
  assert.ok(blobRadiusFor('figure') < blobRadiusFor('goalie'));
  assert.throws(() => blobRadiusFor('cone'));
});

test('a ball is real size, so its shadow is not much wider than the ball', () => {
  // ball radius is 36 mm; a shadow several times wider reads as a plate
  assert.ok(blobRadiusFor('ball') >= 36 && blobRadiusFor('ball') <= 120);
});

test('on the floor the shadow has its full size and strength', () => {
  const b = blobAt('ball', 0);
  assert.equal(b.radius, blobRadiusFor('ball'));
  assert.ok(b.opacity > 0.3 && b.opacity <= 1);
});

test('a ball in the air throws a wider, fainter shadow', () => {
  const low = blobAt('ball', 0), mid = blobAt('ball', 600), high = blobAt('ball', 1200);
  assert.ok(mid.radius > low.radius && high.radius > mid.radius);
  assert.ok(mid.opacity < low.opacity && high.opacity < mid.opacity);
  assert.ok(high.opacity > 0);                       // never vanishes at goal height
  // and it stays bounded far above anything a shot reaches
  const sky = blobAt('ball', 1e6);
  assert.ok(Number.isFinite(sky.radius) && sky.radius <= blobRadiusFor('ball') * 4);
  assert.ok(sky.opacity >= 0);
});

test('below the floor counts as on the floor', () => {
  assert.deepEqual(blobAt('figure', -50), blobAt('figure', 0));
});
