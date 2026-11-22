// Quiet screen in the lessons (A-BACK-049): which layers a frame shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LAYER_NAMES, quietLayers, quietAllows, quietShotView, quietForFrame, sanitizeLayers } = await import('../web/src/lesson-view.js');

test('quietLayers: no layers field means not quiet; an empty list means only the caption and the KATA card', () => {
  assert.equal(quietLayers(undefined), null);
  assert.equal(quietLayers('line'), null);
  assert.deepEqual(quietLayers([]), { shotLine: false, lines: false, coverage: false, zones: false, marks: false });
});

test('quietLayers: line is the shooting line, area is the corner lines to both posts', () => {
  assert.deepEqual(quietLayers(['line']), { shotLine: true, lines: false, coverage: false, zones: false, marks: false });
  assert.deepEqual(quietLayers(['area']), { shotLine: false, lines: true, coverage: false, zones: false, marks: false });
  assert.deepEqual(quietLayers(['line', 'area', 'zones']), { shotLine: true, lines: true, coverage: false, zones: true, marks: false });
});

test('quietAllows: everything while not quiet, only the named layers while quiet', () => {
  assert.equal(quietAllows(null, 'zones'), true);
  assert.equal(quietAllows(quietLayers(['line']), 'shotLine'), true);
  assert.equal(quietAllows(quietLayers(['line']), 'zones'), false);
});

test('quietShotView: switches the viewer has off stay off, quiet only takes away', () => {
  const view = { lines: true, shotLine: true, coverage: false };
  assert.equal(quietShotView(view, null), view, 'not quiet: untouched');
  assert.deepEqual(quietShotView(view, quietLayers(['line'])), { lines: false, shotLine: true, coverage: false });
  assert.deepEqual(quietShotView(view, quietLayers(['area'])), { lines: true, shotLine: false, coverage: false });
  assert.deepEqual(quietShotView({ lines: false, shotLine: false, coverage: false }, quietLayers(['line', 'area', 'coverage'])), { lines: false, shotLine: false, coverage: false });
  assert.deepEqual(quietShotView(view, quietLayers([])), { lines: false, shotLine: false, coverage: false });
});

test('quietForFrame: reads the frame on screen', () => {
  const frames = [{ layers: ['line'] }, {}, { layers: [] }];
  assert.deepEqual(quietForFrame(frames, 0), quietLayers(['line']));
  assert.equal(quietForFrame(frames, 1), null);
  assert.deepEqual(quietForFrame(frames, 2), quietLayers([]));
  assert.equal(quietForFrame(frames, 9), null);
  assert.equal(quietForFrame(undefined, 0), null);
});

test('sanitizeLayers: known names only, once each, in the canonical order', () => {
  assert.deepEqual(sanitizeLayers(['area', 'bogus', 'line', 'line']), ['line', 'area']);
  assert.deepEqual(sanitizeLayers([]), []);
  assert.equal(sanitizeLayers('line'), undefined);
  assert.equal(sanitizeLayers(null), undefined);
  assert.deepEqual(sanitizeLayers(LAYER_NAMES), [...LAYER_NAMES]);
});
