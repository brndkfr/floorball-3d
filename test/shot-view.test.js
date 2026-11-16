// A-BACK-045 step 2: which shot overlays are on (lines, shooting line,
// coverage), stored per browser. The goalie glow has no toggle of its own:
// it comes with the shooting line (decision 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_SHOT_VIEW, SHOT_VIEW_KEYS, parseShotView, toggleShotView, outlineShown, anyShotOverlay } = await import('../web/src/shot-view.js');

test('everything starts off', () => {
  assert.deepEqual(DEFAULT_SHOT_VIEW, { lines: false, shotLine: false, coverage: false });
  assert.deepEqual(SHOT_VIEW_KEYS, ['lines', 'shotLine', 'coverage']);
  assert.ok(Object.isFrozen(DEFAULT_SHOT_VIEW));
});

test('parseShotView: stored booleans are kept, anything else falls back to off', () => {
  assert.deepEqual(parseShotView(JSON.stringify({ lines: true, coverage: true })), { lines: true, shotLine: false, coverage: true });
  assert.deepEqual(parseShotView(JSON.stringify({ lines: 'yes', shotLine: 1, extra: true })), DEFAULT_SHOT_VIEW);
  for (const bad of [null, undefined, '', 'not json', '[]', '42', 'null']) assert.deepEqual(parseShotView(bad), DEFAULT_SHOT_VIEW, String(bad));
});

test('toggleShotView flips one key and returns a new object; unknown keys change nothing', () => {
  const a = toggleShotView(DEFAULT_SHOT_VIEW, 'shotLine');
  assert.deepEqual(a, { lines: false, shotLine: true, coverage: false });
  assert.notEqual(a, DEFAULT_SHOT_VIEW);
  assert.deepEqual(toggleShotView(a, 'shotLine'), DEFAULT_SHOT_VIEW);
  assert.deepEqual(toggleShotView(a, 'outline'), a);
});

test('the goalie glow follows the shooting line', () => {
  assert.equal(outlineShown({ lines: true, shotLine: false, coverage: true }), false);
  assert.equal(outlineShown({ lines: false, shotLine: true, coverage: false }), true);
});

test('anyShotOverlay: true when at least one overlay is on (the verdict chip shows then)', () => {
  assert.equal(anyShotOverlay(DEFAULT_SHOT_VIEW), false);
  for (const k of SHOT_VIEW_KEYS) assert.equal(anyShotOverlay(toggleShotView(DEFAULT_SHOT_VIEW, k)), true, k);
});

// Train (A-BACK-054 follow-up): the projection lines come on with Train,
// on top of whatever Plan has, and one Lines switch turns both off / on.
test('trainShotView: Train adds the corner lines and the shooting line, keeps coverage as Plan has it', async () => {
  const { trainShotView, trainLinesOn, withTrainLines } = await import('../web/src/shot-view.js');
  assert.deepEqual(trainShotView(DEFAULT_SHOT_VIEW), { lines: true, shotLine: true, coverage: false });
  assert.deepEqual(trainShotView({ lines: false, shotLine: false, coverage: true }), { lines: true, shotLine: true, coverage: true });
  assert.equal(trainLinesOn({ lines: true, shotLine: true, coverage: false }), true);
  assert.equal(trainLinesOn({ lines: true, shotLine: false, coverage: false }), false);
  assert.deepEqual(withTrainLines({ lines: true, shotLine: true, coverage: true }, false), { lines: false, shotLine: false, coverage: true });
  assert.deepEqual(withTrainLines(DEFAULT_SHOT_VIEW, true), { lines: true, shotLine: true, coverage: false });
});
