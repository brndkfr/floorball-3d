// B-BACK-005: occluded-goalie detection - pose-based fallback when the
// object detector (Layer 1) finds nothing in the crease.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFootInCrease,
  projectCreaseRoi,
  footPixelFromKeypoints,
  pickGoalieCandidate,
} from '../web/src/authoring/photo-overlay/detect-goalie.js';
import { RINK_L, GOAL_LINE_FROM_BOARD } from '../web/src/constants.js';

test('isFootInCrease: goal A - centre of the crease is inside', () => {
  assert.equal(isFootInCrease([0, 0, GOAL_LINE_FROM_BOARD + 1000], 'A'), true);
});

test('isFootInCrease: goal A - just behind the goal line but within CREASE_BACK is inside', () => {
  assert.equal(isFootInCrease([0, 0, GOAL_LINE_FROM_BOARD - 900], 'A'), true);
});

test('isFootInCrease: goal A - far in front of the crease is outside', () => {
  assert.equal(isFootInCrease([0, 0, GOAL_LINE_FROM_BOARD + 5000], 'A'), false);
});

test('isFootInCrease: goal A - outside the lateral half-width is outside', () => {
  assert.equal(isFootInCrease([3000, 0, GOAL_LINE_FROM_BOARD], 'A'), false);
});

test('isFootInCrease: goal B mirrors goal A (facing flips)', () => {
  const goalBZ = RINK_L - GOAL_LINE_FROM_BOARD;
  assert.equal(isFootInCrease([0, 0, goalBZ - 1000], 'B'), true);
  assert.equal(isFootInCrease([0, 0, goalBZ + 5000], 'B'), false);
});

test('isFootInCrease: null world is outside', () => {
  assert.equal(isFootInCrease(null, 'A'), false);
});

test('projectCreaseRoi: null when fewer than 4 corners project in front of the camera', () => {
  const camera = { projectWorld: () => null };
  assert.equal(projectCreaseRoi(camera, 'A', [1920, 1080]), null);
});

test('projectCreaseRoi: builds a clipped, padded bbox from projected corners', () => {
  // A trivial "camera" that just maps world x/z to image px 1:1, ignoring y
  // and z depth - enough to exercise the bbox math without a real pose.
  const camera = { projectWorld: (x, y, z) => [x + 500, z] };
  const roi = projectCreaseRoi(camera, 'A', [5000, 5000]);
  assert.ok(roi);
  assert.ok(roi.w > 0 && roi.h > 0);
  assert.ok(roi.x >= 0 && roi.y >= 0);
});

test('projectCreaseRoi: null when clipping to a tiny image leaves a degenerate box', () => {
  const camera = { projectWorld: () => [10, 10] }; // every corner collapses to one point
  // A 5x5 "image" clips the (already point-sized, then padded) box down
  // to well under the 20px minimum on both axes.
  assert.equal(projectCreaseRoi(camera, 'A', [5, 5]), null);
});

test('footPixelFromKeypoints: averages both ankles when both confident', () => {
  const keypoints = new Array(17).fill({ x: 0, y: 0, conf: 0 });
  keypoints[15] = { x: 100, y: 200, conf: 0.8 }; // left ankle
  keypoints[16] = { x: 120, y: 210, conf: 0.7 }; // right ankle
  assert.deepEqual(footPixelFromKeypoints(keypoints), [110, 205]);
});

test('footPixelFromKeypoints: falls back to the single confident ankle', () => {
  const keypoints = new Array(17).fill({ x: 0, y: 0, conf: 0 });
  keypoints[15] = { x: 100, y: 200, conf: 0.8 };
  keypoints[16] = { x: 999, y: 999, conf: 0.05 }; // below threshold
  assert.deepEqual(footPixelFromKeypoints(keypoints), [100, 200]);
});

test('footPixelFromKeypoints: null when neither ankle is confident (kneeling/occluded)', () => {
  const keypoints = new Array(17).fill({ x: 0, y: 0, conf: 0.1 });
  assert.equal(footPixelFromKeypoints(keypoints), null);
});

test('footPixelFromKeypoints: null on missing/short keypoint arrays', () => {
  assert.equal(footPixelFromKeypoints(null), null);
  assert.equal(footPixelFromKeypoints([]), null);
});

test('pickGoalieCandidate: prefers the object-detector candidate over pose when both exist', () => {
  const objectCandidates = [{ score: 0.4, foot: [0, 0, 4000], source: 'yolo' }];
  const poseCandidates = [{ score: 0.9, foot: [0, 0, 4000], source: 'pose' }];
  const best = pickGoalieCandidate(objectCandidates, poseCandidates);
  assert.equal(best.source, 'yolo');
});

test('pickGoalieCandidate: falls back to the best pose candidate when the object detector found nothing', () => {
  const poseCandidates = [
    { score: 0.3, foot: [0, 0, 4000], source: 'pose' },
    { score: 0.6, foot: [100, 0, 4100], source: 'pose' },
  ];
  const best = pickGoalieCandidate([], poseCandidates);
  assert.equal(best.source, 'pose');
  assert.equal(best.score, 0.6);
});

test('pickGoalieCandidate: null when both are empty', () => {
  assert.equal(pickGoalieCandidate([], []), null);
});
