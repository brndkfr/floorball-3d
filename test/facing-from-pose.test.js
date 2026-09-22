import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { facingFromKeypoints } from '../web/src/authoring/photo-overlay/facing-from-pose.js';
import {
  KP_NOSE,
  KP_LEFT_SHOULDER,
  KP_RIGHT_SHOULDER,
  KP_LEFT_HIP,
  KP_RIGHT_HIP,
} from '../web/src/authoring/photo-overlay/detect-pose.js';

// Round-trip: synthesise a pose in world space at a chosen facing angle,
// project to image pixels through a known camera, feed the pixels to
// facingFromKeypoints, verify the returned facingDeg equals the input.
//
// The facing convention (see facing-from-pose.js) is
//   facingDeg = atan2(dx, dz)  -  0deg = +Z, 90deg = +X.
// Anatomical LEFT/RIGHT follow the COCO rule: when the player faces the
// camera, their anatomical LEFT is on the image RIGHT (u_L > u_R).
// LEFT = up x forward, so at alpha=0 (forward=+Z) LEFT = +X in world.

const IMG = [1000, 1000];

function tiltedCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 100, 100000);
  cam.position.set(0, 8000, -3000);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

function project(worldPos, cam) {
  const v = new THREE.Vector3(...worldPos).project(cam);
  return {
    x: (v.x + 1) * 0.5 * IMG[0],
    y: (1 - v.y) * 0.5 * IMG[1],
  };
}

function synthKeypoints(alphaDeg, cam, {
  shoulderConf = 0.9,
  hipConf = 0.9,
  noseConf = 0.9,
} = {}) {
  const a = (alphaDeg * Math.PI) / 180;
  // LEFT anatomical direction in world (see comment above).
  const leftDir = [Math.cos(a), 0, -Math.sin(a)];
  const rightDir = [-leftDir[0], 0, -leftDir[2]];
  const SHOULDER_H = 1400, HIP_H = 900, NOSE_H = 1650;
  const SHOULDER_HALF = 220, HIP_HALF = 180, NOSE_FORWARD = 40;
  const forward = [Math.sin(a), 0, Math.cos(a)];
  const LS = [leftDir[0] * SHOULDER_HALF, SHOULDER_H, leftDir[2] * SHOULDER_HALF];
  const RS = [rightDir[0] * SHOULDER_HALF, SHOULDER_H, rightDir[2] * SHOULDER_HALF];
  const LH = [leftDir[0] * HIP_HALF, HIP_H, leftDir[2] * HIP_HALF];
  const RH = [rightDir[0] * HIP_HALF, HIP_H, rightDir[2] * HIP_HALF];
  const NOSE = [forward[0] * NOSE_FORWARD, NOSE_H, forward[2] * NOSE_FORWARD];
  const kps = new Array(17).fill(null);
  const toKp = (w, conf) => {
    const p = project(w, cam);
    return { x: p.x, y: p.y, conf };
  };
  kps[KP_NOSE] = toKp(NOSE, noseConf);
  kps[KP_LEFT_SHOULDER] = toKp(LS, shoulderConf);
  kps[KP_RIGHT_SHOULDER] = toKp(RS, shoulderConf);
  kps[KP_LEFT_HIP] = toKp(LH, hipConf);
  kps[KP_RIGHT_HIP] = toKp(RH, hipConf);
  return kps;
}

// --- cardinal round-trip -------------------------------------------------

for (const alpha of [0, 45, 90, 135, 180, -45, -90, -135]) {
  test(`facingFromKeypoints round-trips alpha=${alpha}deg`, () => {
    const cam = tiltedCamera();
    const kps = synthKeypoints(alpha, cam);
    const result = facingFromKeypoints(kps, cam, IMG);
    assert.ok(result, 'expected a facing result');
    // Angles wrap - +180 and -180 are the same direction.
    const diff = Math.abs(((result.facingDeg - alpha + 540) % 360) - 180);
    assert.ok(diff < 0.5, `alpha=${alpha}, got ${result.facingDeg} (diff ${diff})`);
  });
}

// --- refusal cases -------------------------------------------------------

test('facingFromKeypoints returns null when both torso lines are missing', () => {
  const cam = tiltedCamera();
  const kps = new Array(17).fill(null);
  assert.equal(facingFromKeypoints(kps, cam, IMG), null);
});

test('facingFromKeypoints returns null when shoulder confidence is too low and no hips', () => {
  const cam = tiltedCamera();
  const kps = synthKeypoints(0, cam, { shoulderConf: 0.1 });
  // Also strip hips + nose so no other cue is available
  kps[KP_LEFT_HIP] = null;
  kps[KP_RIGHT_HIP] = null;
  kps[KP_NOSE] = null;
  assert.equal(facingFromKeypoints(kps, cam, IMG), null);
});

test('facingFromKeypoints uses nose when both torso lines project edge-on', () => {
  const cam = tiltedCamera();
  const kps = synthKeypoints(90, cam); // alpha=90 makes torso edge-on to this camera
  const result = facingFromKeypoints(kps, cam, IMG);
  assert.ok(result);
  assert.equal(result.cue, 'nose');
});

test('facingFromKeypoints reports shoulders+hips when both agree on a non-edge-on stance', () => {
  const cam = tiltedCamera();
  const kps = synthKeypoints(0, cam);
  const result = facingFromKeypoints(kps, cam, IMG);
  assert.ok(result);
  assert.equal(result.cue, 'shoulders+hips');
});
