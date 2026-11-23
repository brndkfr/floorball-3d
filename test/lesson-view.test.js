// Quiet screen in the lessons (A-BACK-049): which layers a frame shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LAYER_NAMES, quietLayers, quietAllows, quietShotView, quietForFrame, sanitizeLayers } = await import('../web/src/lesson-view.js');

test('quietLayers: no layers field means not quiet; an empty list means only the caption and the KATA card', () => {
  assert.equal(quietLayers(undefined), null);
  assert.equal(quietLayers('line'), null);
  assert.deepEqual(quietLayers([]), { shotLine: false, lines: false, coverage: false, zones: false, marks: false, lane: false });
});

test('quietLayers: line is the shooting line, area is the corner lines to both posts', () => {
  assert.deepEqual(quietLayers(['line']), { shotLine: true, lines: false, coverage: false, zones: false, marks: false, lane: false });
  assert.deepEqual(quietLayers(['area']), { shotLine: false, lines: true, coverage: false, zones: false, marks: false, lane: false });
  assert.deepEqual(quietLayers(['line', 'area', 'zones']), { shotLine: true, lines: true, coverage: false, zones: true, marks: false, lane: false });
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

test('quietLayers: lane is the pass lane between the two attackers', () => {
  assert.deepEqual(quietLayers(['lane']), { shotLine: false, lines: false, coverage: false, zones: false, marks: false, lane: true });
  assert.ok(LAYER_NAMES.includes('lane'));
  assert.deepEqual(sanitizeLayers(['lane', 'nope', 'lane']), ['lane']);
});

test('passLaneOf: from the carrier to the free team mate; null for a shot or a lone attacker', async () => {
  const { passLaneOf } = await import('../web/src/lesson-view.js');
  const frame = (carrier) => ({ scheme: {
    players: { p1: { id: 'p1', team: 2, x: 100, z: 200 }, p2: { id: 'p2', team: 2, x: -300, z: 250 }, p3: { id: 'p3', team: 1, x: 0, z: 0 } },
    balls: { main: carrier ? { carrier, x: 0, z: 0 } : { x: 0, z: 0 } },
  } });
  assert.deepEqual(passLaneOf(frame('p1')), { from: { x: 100, z: 200 }, to: { x: -300, z: 250 }, ids: ['p1', 'p2'] });
  assert.deepEqual(passLaneOf(frame('p2')), { from: { x: -300, z: 250 }, to: { x: 100, z: 200 }, ids: ['p2', 'p1'] });
  assert.equal(passLaneOf(frame(null)), null);
  assert.equal(passLaneOf(frame('p3')), null, 'a defender with the ball has no team mate here');
  assert.equal(passLaneOf({ scheme: { players: { p1: { id: 'p1', team: 2, x: 1, z: 2 } }, balls: { main: { carrier: 'p1' } } } }), null);
  assert.equal(passLaneOf(undefined), null);
});
