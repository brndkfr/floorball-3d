// S-BACK-009 (remainder): coverage.js's per-frame dirty-check (skip the
// raycast pass when nothing tracked has moved) was hand-rolled and
// untested. Extracted here as a generic, dependency-free comparator so it
// can be reused by other per-frame recomputes (see docs/plan.md
// S-BACK-011 - the main animate() loop has no dirty-check at all today).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotChanged, copySnapshot } from '../web/src/dirty-check.js';

const KEYS = ['x', 'y', 'ref'];

test('snapshotChanged: false when every tracked key is equal', () => {
  const prev = { x: 1, y: 2, ref: 'a' };
  const next = { x: 1, y: 2, ref: 'a' };
  assert.equal(snapshotChanged(prev, next, KEYS), false);
});

test('snapshotChanged: true when any tracked key differs', () => {
  const prev = { x: 1, y: 2, ref: 'a' };
  assert.equal(snapshotChanged(prev, { x: 1, y: 3, ref: 'a' }, KEYS), true);
  assert.equal(snapshotChanged(prev, { x: 1, y: 2, ref: 'b' }, KEYS), true);
});

test('snapshotChanged: ignores keys not listed', () => {
  const prev = { x: 1, y: 2, untracked: 'a' };
  const next = { x: 1, y: 2, untracked: 'different' };
  assert.equal(snapshotChanged(prev, next, ['x', 'y']), false);
});

test('snapshotChanged: NaN sentinels always report changed (first-frame case)', () => {
  // JS: NaN !== NaN. Callers rely on this instead of a separate
  // isFirstFrame flag - seed the "last" snapshot with NaN and the very
  // first real frame always triggers a recompute.
  const prev = { x: NaN, y: NaN, ref: null };
  assert.equal(snapshotChanged(prev, { x: 0, y: 0, ref: null }, KEYS), true);
  // Even a snapshot that's also all-NaN reports "changed" - NaN never
  // equals itself, so two NaN-filled snapshots still compare unequal.
  assert.equal(snapshotChanged(prev, { x: NaN, y: NaN, ref: null }, KEYS), true);
});

test('snapshotChanged: null/undefined refs compare correctly', () => {
  assert.equal(snapshotChanged({ ref: null }, { ref: null }, ['ref']), false);
  assert.equal(snapshotChanged({ ref: null }, { ref: undefined }, ['ref']), true);
  const obj = {};
  assert.equal(snapshotChanged({ ref: obj }, { ref: obj }, ['ref']), false);
  assert.equal(snapshotChanged({ ref: obj }, { ref: {} }, ['ref']), true);
});

test('copySnapshot: copies only the listed keys onto the target, in place', () => {
  const target = { x: 0, y: 0, untouched: 'keep' };
  const source = { x: 5, y: 6, untouched: 'ignored', extra: 'not copied' };
  const result = copySnapshot(target, source, ['x', 'y']);
  assert.equal(result, target); // mutates and returns the same object
  assert.deepEqual(target, { x: 5, y: 6, untouched: 'keep' });
});
