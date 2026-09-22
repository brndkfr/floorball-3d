import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTrappedIndex } from '../web/src/focus-trap.js';

test('nextTrappedIndex returns null when there are no focusable elements', () => {
  assert.equal(nextTrappedIndex(0, -1, false), null);
  assert.equal(nextTrappedIndex(0, -1, true), null);
});

test('nextTrappedIndex jumps to first when nothing inside is focused (forward)', () => {
  assert.equal(nextTrappedIndex(3, -1, false), 0);
});

test('nextTrappedIndex jumps to last when nothing inside is focused (backward)', () => {
  assert.equal(nextTrappedIndex(3, -1, true), 2);
});

test('nextTrappedIndex wraps last->first on Tab', () => {
  assert.equal(nextTrappedIndex(3, 2, false), 0);
});

test('nextTrappedIndex wraps first->last on Shift+Tab', () => {
  assert.equal(nextTrappedIndex(3, 0, true), 2);
});

test('nextTrappedIndex hands off to browser default in the middle', () => {
  // Middle-of-list Tab / Shift+Tab: the browser's own tab-order handles it,
  // no need to preventDefault + focus manually.
  assert.equal(nextTrappedIndex(3, 1, false), null);
  assert.equal(nextTrappedIndex(3, 1, true), null);
});

test('nextTrappedIndex wraps a single-element trap onto itself', () => {
  assert.equal(nextTrappedIndex(1, 0, false), 0);
  assert.equal(nextTrappedIndex(1, 0, true), 0);
});
