// Analyze step 4 (S-BACK-021, design canvas "Insights"): a verdict pill and a
// 2x2 stat grid replace the one-line text readout. insightStats() turns the
// recomputeInsights() result into what the panel shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insightStats } from '../web/src/authoring/photo-overlay/insight-stats.js';

const result = (over = {}) => ({
  shot: { angleDeg: 18.4, distance: 6420, lineColor: 'open', onTarget: 'on', ...over.shot },
  coveragePct: over.coveragePct === undefined ? 63.2 : over.coveragePct,
  passes: over.passes ?? [{ clear: true }, { clear: false }, { clear: true }, { clear: false }],
});

test('four cells in canvas order: angle, distance, coverage, clear passes', () => {
  const { cells } = insightStats(result());
  assert.deepEqual(cells.map((c) => [c.key, c.value, c.unit, c.label]), [
    ['angle', '18', '°', 'angle to goal'],
    ['distance', '6.4', 'm', 'shot distance'],
    ['coverage', '63', '%', 'goal covered'],
    ['passes', '2', '/ 4', 'clear passes'],
  ]);
});

test('open lane on target reads as a good verdict', () => {
  const { verdict } = insightStats(result());
  assert.equal(verdict.tone, 'good');
  assert.equal(verdict.label, 'On target');
  assert.match(verdict.detail, /clear lane/);
});

test('goalie on the line reads as blocked', () => {
  assert.deepEqual(
    (({ tone, label }) => ({ tone, label }))(insightStats(result({ shot: { lineColor: 'blocked-centred' } })).verdict),
    { tone: 'bad', label: 'Blocked' });
  assert.equal(insightStats(result({ shot: { lineColor: 'blocked-off' } })).verdict.tone, 'warn');
});

test('angle decides when the lane is open but the shot is sharp or off', () => {
  assert.equal(insightStats(result({ shot: { onTarget: 'near-miss' } })).verdict.label, 'Sharp angle');
  assert.equal(insightStats(result({ shot: { onTarget: 'off' } })).verdict.tone, 'bad');
});

test('missing coverage shows a dash, no passes shows 0 / 0', () => {
  const { cells } = insightStats(result({ coveragePct: null, passes: [] }));
  assert.equal(cells[2].value, '-');
  assert.equal(cells[2].unit, '');
  assert.equal(cells[3].value, '0');
  assert.equal(cells[3].unit, '/ 0');
});

test('cells carry a tone for the coloured values', () => {
  const { cells } = insightStats(result({ coveragePct: 20, passes: [{ clear: false }] }));
  assert.equal(cells[2].tone, 'good');   // little of the goal covered: good for the shooter
  assert.equal(cells[3].tone, 'bad');    // no clear pass
  assert.equal(cells[0].tone, undefined);
});

test('plain-text summary keeps the numbers for copy / screen readers', () => {
  assert.equal(insightStats(result()).text, 'On target - angle 18° - distance 6.4 m - goal covered 63% - clear passes 2 / 4');
});
