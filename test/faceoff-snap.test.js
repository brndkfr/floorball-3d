import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeLocalStorage {
  constructor() { this._data = new Map(); }
  setItem(k, v) { this._data.set(k, String(v)); }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  removeItem(k) { this._data.delete(k); }
}
globalThis.localStorage = new FakeLocalStorage();

const { FACEOFF_DOTS, isSnapEnabled, setSnapEnabled, snapToNearestDot } =
  await import('../web/src/authoring/faceoff-snap.js');

test('snap is on by default', () => {
  assert.equal(isSnapEnabled(), true);
});

test('setSnapEnabled persists the toggle', () => {
  setSnapEnabled(false);
  assert.equal(isSnapEnabled(), false);
  setSnapEnabled(true);
  assert.equal(isSnapEnabled(), true);
});

test('snapToNearestDot snaps a point within the 800mm radius to the nearest dot', () => {
  setSnapEnabled(true);
  const dot = FACEOFF_DOTS[1]; // a corner face-off dot
  const near = snapToNearestDot(dot.x + 100, dot.z - 200);
  assert.deepEqual(near, { x: dot.x, z: dot.z });
});

test('snapToNearestDot leaves a point outside every dot radius unchanged', () => {
  setSnapEnabled(true);
  const far = snapToNearestDot(0, 0); // rink corner-ish, far from every dot
  // centre spot dot is at (0, RINK_L/2) = (0, 20000), far outside 800mm
  assert.deepEqual(far, { x: 0, z: 0 });
});

test('snapToNearestDot is a no-op when snapping is disabled', () => {
  setSnapEnabled(false);
  const dot = FACEOFF_DOTS[0];
  const pt = snapToNearestDot(dot.x + 10, dot.z + 10);
  assert.deepEqual(pt, { x: dot.x + 10, z: dot.z + 10 });
  setSnapEnabled(true);
});

test('snapToNearestDot picks the closer of two dots within range of each other', () => {
  setSnapEnabled(true);
  // two dots that share a z: x = +8500 and x = -8500 at z = GOAL_LINE_FROM_BOARD (3500)
  const a = FACEOFF_DOTS.find((d) => d.x > 0 && d.z === 3500);
  const b = FACEOFF_DOTS.find((d) => d.x < 0 && d.z === 3500);
  assert.ok(a && b);
  // a point close to `a` but still technically closer to `a` than `b`
  const snapped = snapToNearestDot(a.x - 50, a.z);
  assert.deepEqual(snapped, { x: a.x, z: a.z });
});
