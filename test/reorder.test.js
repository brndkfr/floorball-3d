import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderAtSlots } from '../web/src/authoring/reorder.js';

test('reorderAtSlots: reordering a subset keeps the absolute slots of untouched entries', () => {
  // ['a','b','c','d','e'], reorder [a,c,e] -> [c,e,a]: slots 0,2,4 keep
  // their positions, but now hold c,e,a in that order. b and d untouched.
  const next = reorderAtSlots(['a', 'b', 'c', 'd', 'e'], ['c', 'e', 'a']);
  assert.deepEqual(next, ['c', 'b', 'e', 'd', 'a']);
});

test('reorderAtSlots: full-list reorder is a plain permutation', () => {
  const next = reorderAtSlots(['a', 'b', 'c'], ['c', 'a', 'b']);
  assert.deepEqual(next, ['c', 'a', 'b']);
});

test('reorderAtSlots: no-op reorder (same order) returns an equivalent array', () => {
  const next = reorderAtSlots(['a', 'b', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(next, ['a', 'b', 'c']);
});

test('reorderAtSlots: reordering a subset leaves the rest of the list untouched', () => {
  // A caller (e.g. a single layers-panel section) may legitimately reorder
  // only part of the list - the ids left out keep their own slot.
  const next = reorderAtSlots(['a', 'b', 'c'], ['b', 'a']);
  assert.deepEqual(next, ['b', 'a', 'c']);
});

test('reorderAtSlots: returns null when orderedIds references an id not in items', () => {
  assert.equal(reorderAtSlots(['a', 'b', 'c'], ['a', 'b', 'x']), null); // foreign id
  assert.equal(reorderAtSlots(['a', 'b', 'c'], ['a', 'b', 'c', 'd']), null); // extra unknown id
});

test('reorderAtSlots: does not mutate the input array', () => {
  const input = ['a', 'b', 'c'];
  reorderAtSlots(input, ['c', 'a', 'b']);
  assert.deepEqual(input, ['a', 'b', 'c']);
});

test('reorderAtSlots: works over objects via a getId accessor (shapes.js usage)', () => {
  const shapes = [{ id: 'x', v: 1 }, { id: 'y', v: 2 }, { id: 'z', v: 3 }];
  const next = reorderAtSlots(shapes, ['z', 'x', 'y'], (s) => s.id);
  assert.deepEqual(next.map((s) => s.id), ['z', 'x', 'y']);
  // Objects themselves are the same references, not copies.
  assert.equal(next[0], shapes[2]);
});
