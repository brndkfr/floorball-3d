import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryStack,
  pushSnapshot,
  stepUndo,
  stepRedo,
  resetHistoryStack,
  canUndo,
  canRedo,
  serializeHistoryStack,
  hydrateHistoryStack,
} from '../web/src/authoring/history-stack.js';

test('pushSnapshot grows the stack and advances the cursor to the newest entry', () => {
  const hs = createHistoryStack(100);
  pushSnapshot(hs, 'a');
  pushSnapshot(hs, 'b');
  pushSnapshot(hs, 'c');
  assert.deepEqual(hs.stack, ['a', 'b', 'c']);
  assert.equal(hs.cursor, 2);
});

test('pushSnapshot after undo truncates the redo-able future', () => {
  const hs = createHistoryStack(100);
  pushSnapshot(hs, 'a');
  pushSnapshot(hs, 'b');
  pushSnapshot(hs, 'c');
  stepUndo(hs); // cursor -> 1 ('b')
  pushSnapshot(hs, 'd');
  assert.deepEqual(hs.stack, ['a', 'b', 'd']);
  assert.equal(hs.cursor, 2);
});

test('pushSnapshot evicts the oldest entry once max is exceeded, cursor still points at the newest', () => {
  const hs = createHistoryStack(3);
  pushSnapshot(hs, 'a');
  pushSnapshot(hs, 'b');
  pushSnapshot(hs, 'c');
  pushSnapshot(hs, 'd'); // over capacity - 'a' evicted
  assert.deepEqual(hs.stack, ['b', 'c', 'd']);
  assert.equal(hs.cursor, 2);
  assert.equal(hs.stack[hs.cursor], 'd');
});

test('stepUndo/stepRedo return null at the stack boundaries', () => {
  const hs = createHistoryStack(100);
  assert.equal(stepUndo(hs), null); // empty stack
  pushSnapshot(hs, 'a');
  assert.equal(stepUndo(hs), null); // only one entry, already at cursor 0
  pushSnapshot(hs, 'b');
  assert.equal(stepUndo(hs), 'a');
  assert.equal(stepUndo(hs), null); // can't go further back
  assert.equal(stepRedo(hs), 'b');
  assert.equal(stepRedo(hs), null); // already at the newest entry
});

test('canUndo / canRedo reflect cursor position', () => {
  const hs = createHistoryStack(100);
  pushSnapshot(hs, 'a');
  assert.equal(canUndo(hs), false);
  assert.equal(canRedo(hs), false);
  pushSnapshot(hs, 'b');
  assert.equal(canUndo(hs), true);
  assert.equal(canRedo(hs), false);
  stepUndo(hs);
  assert.equal(canUndo(hs), false);
  assert.equal(canRedo(hs), true);
});

test('resetHistoryStack clears, and optionally reseeds with one snapshot', () => {
  const hs = createHistoryStack(100);
  pushSnapshot(hs, 'a');
  pushSnapshot(hs, 'b');
  resetHistoryStack(hs);
  assert.deepEqual(hs.stack, []);
  assert.equal(hs.cursor, -1);
  resetHistoryStack(hs, 'seed');
  assert.deepEqual(hs.stack, ['seed']);
  assert.equal(hs.cursor, 0);
});

test('serializeHistoryStack / hydrateHistoryStack round-trip', () => {
  const hs = createHistoryStack(100);
  pushSnapshot(hs, 'a');
  pushSnapshot(hs, 'b');
  stepUndo(hs);
  const data = serializeHistoryStack(hs);

  const hs2 = createHistoryStack(100);
  const ok = hydrateHistoryStack(hs2, data);
  assert.equal(ok, true);
  assert.deepEqual(hs2.stack, ['a', 'b']);
  assert.equal(hs2.cursor, 0);
});

test('hydrateHistoryStack rejects malformed/foreign data instead of throwing', () => {
  const hs = createHistoryStack(100);
  assert.equal(hydrateHistoryStack(hs, null), false);
  assert.equal(hydrateHistoryStack(hs, {}), false);
  assert.equal(hydrateHistoryStack(hs, { stack: [], cursor: 0 }), false); // empty stack
  assert.equal(hydrateHistoryStack(hs, { stack: ['a'], cursor: 5 }), false); // cursor out of range
  assert.equal(hydrateHistoryStack(hs, { stack: ['a'], cursor: -1 }), false);
  assert.equal(hydrateHistoryStack(hs, { stack: 'not-an-array', cursor: 0 }), false);
  assert.deepEqual(hs.stack, []); // untouched by every rejected call
});

test('hydrateHistoryStack truncates a persisted stack longer than the current max', () => {
  const hs = createHistoryStack(3);
  const data = { stack: ['a', 'b', 'c', 'd', 'e'], cursor: 3 }; // points at 'd'
  const ok = hydrateHistoryStack(hs, data);
  assert.equal(ok, true);
  assert.deepEqual(hs.stack, ['c', 'd', 'e']);
  assert.equal(hs.cursor, 1); // 'd' is now at index 1
  assert.equal(hs.stack[hs.cursor], 'd');
});
