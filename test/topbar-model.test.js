// Broadcast top bar (S-BACK-021): the crumb next to the project name reads
// "frame 2 / 6" (design canvas "Plan"). Pure so it is node-testable; the
// DOM wiring lives in web/src/ui/topbar.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameCrumb } from '../web/src/ui/topbar-model.js';

test('frameCrumb shows the 1-based current frame and the frame count', () => {
  assert.equal(frameCrumb({ frames: [{}, {}, {}, {}, {}, {}], currentFrame: 1 }), 'frame 2 / 6');
  assert.equal(frameCrumb({ frames: [{}], currentFrame: 0 }), 'frame 1 / 1');
});

test('frameCrumb is empty when there is no usable doc', () => {
  assert.equal(frameCrumb(null), '');
  assert.equal(frameCrumb({ frames: [] , currentFrame: 0 }), '');
});

test('frameCrumb clamps a stale index into range', () => {
  assert.equal(frameCrumb({ frames: [{}, {}], currentFrame: 5 }), 'frame 2 / 2');
});
