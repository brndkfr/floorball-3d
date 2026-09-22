import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidFrameIndex,
  clampInsertIndex,
  canRemoveFrame,
  clampCurrentAfterRemoval,
} from '../web/src/authoring/frame-list.js';

test('isValidFrameIndex accepts 0..length-1, rejects out of range', () => {
  assert.equal(isValidFrameIndex(3, 0), true);
  assert.equal(isValidFrameIndex(3, 2), true);
  assert.equal(isValidFrameIndex(3, 3), false);
  assert.equal(isValidFrameIndex(3, -1), false);
  assert.equal(isValidFrameIndex(0, 0), false);
});

test('clampInsertIndex allows appending at the end (index == length)', () => {
  assert.equal(clampInsertIndex(3, 3), 3);
});

test('clampInsertIndex clamps negative and past-the-end values', () => {
  assert.equal(clampInsertIndex(3, -5), 0);
  assert.equal(clampInsertIndex(3, 99), 3);
});

test('clampInsertIndex passes through an in-range value unchanged', () => {
  assert.equal(clampInsertIndex(5, 2), 2);
});

test('canRemoveFrame refuses to remove the last remaining frame', () => {
  assert.equal(canRemoveFrame(1, 0), false);
});

test('canRemoveFrame refuses an out-of-range index', () => {
  assert.equal(canRemoveFrame(3, 3), false);
  assert.equal(canRemoveFrame(3, -1), false);
});

test('canRemoveFrame allows removing any valid index when more than one frame exists', () => {
  assert.equal(canRemoveFrame(3, 0), true);
  assert.equal(canRemoveFrame(3, 2), true);
});

test('clampCurrentAfterRemoval keeps the pointer when still in range', () => {
  assert.equal(clampCurrentAfterRemoval(3, 1), 1);
});

test('clampCurrentAfterRemoval pulls the pointer back when it now points past the end', () => {
  // e.g. deleting the last frame while it was the current one
  assert.equal(clampCurrentAfterRemoval(2, 2), 1);
});
