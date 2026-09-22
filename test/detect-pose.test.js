import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPoseToPlayers } from '../web/src/authoring/photo-overlay/detect-pose.js';

// matchPoseToPlayers pairs a Step-3 player chip (with `bbox`) to a
// Step-4 pose detection by 2D IoU. Anything below minIou is unmatched.
// We test the pure IoU logic directly - no ORT / no model needed.

test('matchPoseToPlayers pairs coincident bboxes 1:1', () => {
  const players = [
    { id: 'p1', bbox: [100, 100, 40, 80] },
    { id: 'p2', bbox: [300, 100, 40, 80] },
  ];
  const detections = [
    { bbox: [100, 100, 40, 80], keypoints: [] },
    { bbox: [300, 100, 40, 80], keypoints: [] },
  ];
  const m = matchPoseToPlayers(detections, players);
  assert.equal(m.size, 2);
  assert.equal(m.get('p1'), detections[0]);
  assert.equal(m.get('p2'), detections[1]);
});

test('matchPoseToPlayers drops detections below minIou', () => {
  const players = [{ id: 'p1', bbox: [100, 100, 40, 80] }];
  const detections = [{ bbox: [200, 200, 40, 80], keypoints: [] }]; // no overlap
  const m = matchPoseToPlayers(detections, players);
  assert.equal(m.size, 0);
});

test('matchPoseToPlayers picks the highest-IoU detection when multiple overlap', () => {
  const players = [{ id: 'p1', bbox: [100, 100, 100, 100] }];
  const detections = [
    { bbox: [150, 150, 100, 100], keypoints: [], tag: 'low' },   // overlap ~1/7
    { bbox: [110, 110, 100, 100], keypoints: [], tag: 'high' },  // large overlap
  ];
  const m = matchPoseToPlayers(detections, players);
  assert.equal(m.get('p1').tag, 'high');
});

test('matchPoseToPlayers ignores players missing a bbox', () => {
  const players = [{ id: 'p1' /* no bbox */ }];
  const detections = [{ bbox: [100, 100, 40, 80], keypoints: [] }];
  const m = matchPoseToPlayers(detections, players);
  assert.equal(m.size, 0);
});

test('matchPoseToPlayers respects a custom minIou threshold', () => {
  const players = [{ id: 'p1', bbox: [100, 100, 100, 100] }];
  // 50x50 overlap on a 100x100 vs 100x100 pair -> intersection 2500, union 17500 -> IoU ~0.143
  const detections = [{ bbox: [150, 150, 100, 100], keypoints: [] }];
  assert.equal(matchPoseToPlayers(detections, players, { minIou: 0.3 }).size, 0);
  assert.equal(matchPoseToPlayers(detections, players, { minIou: 0.1 }).size, 1);
});
