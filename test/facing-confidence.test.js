import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLowConfidenceFacing, POSE_LOW_CONFIDENCE } from '../web/src/authoring/photo-overlay/facing-confidence.js';

test('a manual facing is never low-confidence, regardless of quality/cue fields', () => {
  assert.equal(isLowConfidenceFacing({ facingSource: 'manual', facingQuality: 0.1, facingCue: 'nose' }), false);
  assert.equal(isLowConfidenceFacing({ facingQuality: 0.1, facingCue: 'nose' }), false); // no facingSource at all
});

test('a nose-cue pose facing is always low-confidence, even at high quality', () => {
  assert.equal(isLowConfidenceFacing({ facingSource: 'pose', facingCue: 'nose', facingQuality: 0.99 }), true);
});

test('a pose facing below the confidence threshold is flagged', () => {
  assert.equal(isLowConfidenceFacing({ facingSource: 'pose', facingCue: 'shoulders', facingQuality: POSE_LOW_CONFIDENCE - 0.01 }), true);
});

test('a pose facing at or above the confidence threshold is not flagged', () => {
  assert.equal(isLowConfidenceFacing({ facingSource: 'pose', facingCue: 'shoulders', facingQuality: POSE_LOW_CONFIDENCE }), false);
  assert.equal(isLowConfidenceFacing({ facingSource: 'pose', facingCue: 'shoulders+hips', facingQuality: 0.95 }), false);
});

test('a pose facing with no recorded quality is not flagged (missing data is not treated as uncertain)', () => {
  assert.equal(isLowConfidenceFacing({ facingSource: 'pose', facingCue: 'shoulders' }), false);
});
