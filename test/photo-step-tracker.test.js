import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentStep,
  stepStatuses,
  guidedHint,
  isPoseUsable,
  STEP_PHOTO,
  STEP_ALIGN,
  STEP_PLAYERS,
  STEP_INSIGHTS,
} from '../web/src/authoring/photo-overlay/photo-step-tracker.js';

// --- currentStep ---------------------------------------------------------

test('currentStep returns 1 (Photo) when no photo is loaded', () => {
  assert.equal(currentStep({ hasPhoto: false }), STEP_PHOTO);
});

test('currentStep returns 2 (Align) when a photo is loaded but no landmarks placed', () => {
  assert.equal(currentStep({ hasPhoto: true, landmarkCount: 0 }), STEP_ALIGN);
});

test('currentStep stays on Align when landmarks are placed but reproj error is unknown', () => {
  assert.equal(currentStep({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: null }), STEP_ALIGN);
});

test('currentStep stays on Align when reproj error is too high', () => {
  assert.equal(currentStep({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: 50 }), STEP_ALIGN);
});

test('currentStep advances to Players when pose is usable and no players yet', () => {
  assert.equal(currentStep({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5 }), STEP_PLAYERS);
});

test('currentStep stays on Players when players are placed but ball is not', () => {
  assert.equal(
    currentStep({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5, playerCount: 4, hasBall: false }),
    STEP_PLAYERS,
  );
});

test('currentStep advances to Insights when pose, players, and ball are all in place', () => {
  assert.equal(
    currentStep({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5, playerCount: 4, hasBall: true }),
    STEP_INSIGHTS,
  );
});

test('currentStep respects custom minLandmarks / maxReprojErrorPx overrides', () => {
  const strict = { hasPhoto: true, landmarkCount: 6, reprojErrorPx: 15, minLandmarks: 8 };
  assert.equal(currentStep(strict), STEP_ALIGN);
  const loose = { hasPhoto: true, landmarkCount: 6, reprojErrorPx: 30, maxReprojErrorPx: 40 };
  assert.equal(currentStep(loose), STEP_PLAYERS);
});

// --- isPoseUsable --------------------------------------------------------

test('isPoseUsable false when landmark count below threshold', () => {
  assert.equal(isPoseUsable({ landmarkCount: 5, reprojErrorPx: 1 }), false);
});

test('isPoseUsable false when reproj error missing or non-finite', () => {
  assert.equal(isPoseUsable({ landmarkCount: 8, reprojErrorPx: null }), false);
  assert.equal(isPoseUsable({ landmarkCount: 8, reprojErrorPx: Infinity }), false);
  assert.equal(isPoseUsable({ landmarkCount: 8, reprojErrorPx: NaN }), false);
});

test('isPoseUsable true at exactly the min-landmarks / max-error boundary', () => {
  assert.equal(isPoseUsable({ landmarkCount: 6, reprojErrorPx: 20 }), true);
});

// --- stepStatuses --------------------------------------------------------

test('stepStatuses marks earlier steps complete, current active, later pending', () => {
  const status = stepStatuses({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5 });
  assert.equal(status[STEP_PHOTO], 'complete');
  assert.equal(status[STEP_ALIGN], 'complete');
  assert.equal(status[STEP_PLAYERS], 'active');
  assert.equal(status[STEP_INSIGHTS], 'pending');
});

test('stepStatuses fresh state marks only Photo active, rest pending', () => {
  const status = stepStatuses({});
  assert.equal(status[STEP_PHOTO], 'active');
  assert.equal(status[STEP_ALIGN], 'pending');
  assert.equal(status[STEP_PLAYERS], 'pending');
  assert.equal(status[STEP_INSIGHTS], 'pending');
});

test('stepStatuses on Step 4 marks Step 4 active (never complete)', () => {
  const status = stepStatuses({
    hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5, playerCount: 4, hasBall: true,
  });
  assert.equal(status[STEP_INSIGHTS], 'active');
});

// --- guidedHint ----------------------------------------------------------

test('guidedHint Step 1 nudges to upload', () => {
  assert.match(guidedHint({}), /upload/i);
});

test('guidedHint Step 2 counts missing landmarks', () => {
  const hint = guidedHint({ hasPhoto: true, landmarkCount: 3, minLandmarks: 6 });
  assert.match(hint, /3 more/);
});

test('guidedHint Step 2 reports reproj error when landmark count is met but error too high', () => {
  const hint = guidedHint({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: 42.7 });
  assert.match(hint, /42\.7/);
});

test('guidedHint Step 3 asks to place players first, then ball', () => {
  const noPlayers = guidedHint({ hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5 });
  assert.match(noPlayers, /player/i);
  const noBall = guidedHint({
    hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5, playerCount: 4, hasBall: false,
  });
  assert.match(noBall, /ball/i);
});

test('guidedHint Step 4 mentions the target goal', () => {
  const hint = guidedHint({
    hasPhoto: true, landmarkCount: 8, reprojErrorPx: 5, playerCount: 4, hasBall: true,
  });
  assert.match(hint, /goal/i);
});
