// A-BACK-045 step 5: the verdict chip on the rink. Pure parts: its words
// (shared with the Inspector's verdict card) and where a projected point
// lands on the page. The old "% blocked" label projected with the 3D camera
// onto the whole window, so in 2D and beside the side panel it sat at the
// wrong goal.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { VERDICT_TITLES, verdictWords, ndcToPage } = await import('../web/src/shot-chip-math.js');

test('verdictWords: title and a rounded percentage per verdict', () => {
  assert.deepEqual(VERDICT_TITLES, { open: 'Open shot', 'blocked-off': 'Blocked off-centre', 'blocked-centred': 'Centred block' });
  assert.deepEqual(verdictWords({ key: 'blocked-centred', pctBlocked: 54.17 }), { key: 'blocked-centred', title: 'Centred block', pct: '54%' });
  assert.deepEqual(verdictWords({ key: 'open', pctBlocked: 0.2 }), { key: 'open', title: 'Open shot', pct: '0%' });
  assert.equal(verdictWords(null), null);
});

test('ndcToPage maps normalised device coordinates into the canvas rectangle', () => {
  const rect = { left: 64, top: 52, width: 1056, height: 676 };
  assert.deepEqual(ndcToPage({ x: 0, y: 0, z: 0.5 }, rect), { left: 64 + 528, top: 52 + 338 });
  assert.deepEqual(ndcToPage({ x: -1, y: 1, z: 0.5 }, rect), { left: 64, top: 52 });
  assert.deepEqual(ndcToPage({ x: 1, y: -1, z: 0.5 }, rect), { left: 64 + 1056, top: 52 + 676 });
});

test('ndcToPage: behind the camera or far outside the canvas -> null', () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  assert.equal(ndcToPage({ x: 0, y: 0, z: 1.2 }, rect), null);
  assert.equal(ndcToPage({ x: 1.5, y: 0, z: 0.5 }, rect), null);
  assert.equal(ndcToPage({ x: 0, y: -1.5, z: 0.5 }, rect), null);
  assert.ok(ndcToPage({ x: 1.05, y: 0, z: 0.5 }, rect));   // a little past the edge still shows
});
