import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  backProjectFoot,
  backProjectToHeight,
  footPixel,
  backProjectPlayers,
} from '../web/src/authoring/photo-overlay/back-project.js';
import { RINK_L, HALF_W } from '../web/src/constants.js';

// Camera looking straight down at the rink centre - every downward ray
// hits the floor, so this exercises the happy path only.
function topDownCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 100, 100000);
  cam.position.set(0, 10000, RINK_L / 2);
  cam.lookAt(0, 0, RINK_L / 2);
  cam.updateMatrixWorld(true);
  return cam;
}

// Camera at floor level looking horizontally down +Z - the top half of
// the image points above the horizon and produces no floor intersection.
function horizonCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 100, 100000);
  cam.position.set(0, 1500, 0);
  cam.lookAt(0, 1500, 10000);
  cam.updateMatrixWorld(true);
  return cam;
}

const IMG = [1000, 1000];

// --- footPixel -----------------------------------------------------------

test('footPixel returns bottom-center of the bbox', () => {
  assert.deepEqual(footPixel([100, 200, 40, 80]), [120, 280]);
});

test('footPixel handles a zero-size bbox without dividing by zero', () => {
  assert.deepEqual(footPixel([50, 50, 0, 0]), [50, 50]);
});

// --- backProjectFoot -----------------------------------------------------

test('backProjectFoot at image centre hits the rink under a top-down camera', () => {
  const cam = topDownCamera();
  const [x, y, z] = backProjectFoot(IMG[0] / 2, IMG[1] / 2, cam, IMG);
  assert.ok(Math.abs(x) < 1, `x=${x}`);
  assert.equal(y, 0);
  assert.ok(Math.abs(z - RINK_L / 2) < 1, `z=${z}`);
});

test('backProjectFoot at bottom-of-image with a horizon camera lands on the floor in front', () => {
  const cam = horizonCamera();
  const world = backProjectFoot(IMG[0] / 2, IMG[1] - 1, cam, IMG);
  assert.ok(world, 'expected a floor hit for a below-horizon ray');
  const [, y, z] = world;
  assert.equal(y, 0);
  assert.ok(z > 0, `z should be in front of the camera (got ${z})`);
});

test('backProjectFoot returns null for a pixel above the horizon', () => {
  const cam = horizonCamera();
  const world = backProjectFoot(IMG[0] / 2, 0, cam, IMG);
  assert.equal(world, null);
});

// --- backProjectToHeight -------------------------------------------------

test('backProjectToHeight intersects a lifted plane instead of the floor', () => {
  const cam = topDownCamera();
  const worldFloor = backProjectFoot(IMG[0] / 2, IMG[1] / 2, cam, IMG);
  const worldHead = backProjectToHeight(IMG[0] / 2, IMG[1] / 2, cam, IMG, 1500);
  assert.equal(worldFloor[1], 0);
  assert.equal(worldHead[1], 1500);
  // Under a straight-down camera the XZ landing point is identical at every height.
  assert.ok(Math.abs(worldFloor[0] - worldHead[0]) < 1);
  assert.ok(Math.abs(worldFloor[2] - worldHead[2]) < 1);
});

// --- backProjectPlayers --------------------------------------------------

test('backProjectPlayers drops boxes whose foot lands off the rink', () => {
  const cam = topDownCamera();
  // One box in the middle of the frame (on-rink), one far off to the side
  // whose foot will back-project well beyond HALF_W + margin.
  // Under a straight-down camera, a pixel at x=IMG[0]-1 sits far outside
  // the rink extents in world x - the camera is above (0,y,RINK_L/2) so
  // 60deg vertical FOV covers +/-5773mm at the floor at 10000mm height.
  // Widen the outlier by placing the camera far enough that the outlier
  // still lands outside HALF_W.
  const onRink = { bbox: [IMG[0] / 2 - 20, IMG[1] / 2 - 40, 40, 80], score: 0.9 };
  // Use a huge margin outlier by supplying a very negative Y so its foot
  // lands beyond RINK_L + margin (simulate camera-only artefacts).
  // Simpler: force via a wide-FOV camera at low altitude.
  const wideCam = new THREE.PerspectiveCamera(120, 1, 100, 100000);
  wideCam.position.set(0, 3000, RINK_L / 2);
  wideCam.lookAt(0, 0, RINK_L / 2);
  wideCam.updateMatrixWorld(true);
  const outlier = { bbox: [0, IMG[1] / 2 - 40, 40, 80], score: 0.9 };

  const kept = backProjectPlayers([onRink], cam, IMG);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 0);
  assert.equal(kept[0].world[1], 0);

  const filtered = backProjectPlayers([outlier], wideCam, IMG, { margin: 0 });
  // Outlier's foot pixel is at x=20, which back-projects to a very negative
  // world X - well beyond HALF_W with margin=0.
  const [wx] = backProjectFoot(20, IMG[1] / 2, wideCam, IMG);
  if (Math.abs(wx) > HALF_W) {
    assert.equal(filtered.length, 0);
  }
});

test('backProjectPlayers assigns sequential ids and preserves extra box fields', () => {
  const cam = topDownCamera();
  const boxes = [
    { bbox: [IMG[0] / 2 - 30, IMG[1] / 2 - 40, 40, 80], score: 0.9, team: 'home' },
    { bbox: [IMG[0] / 2 + 30, IMG[1] / 2 - 40, 40, 80], score: 0.8, team: 'away' },
  ];
  const out = backProjectPlayers(boxes, cam, IMG);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 0);
  assert.equal(out[1].id, 1);
  assert.equal(out[0].team, 'home');
  assert.equal(out[1].team, 'away');
  assert.equal(out[0].score, 0.9);
});
