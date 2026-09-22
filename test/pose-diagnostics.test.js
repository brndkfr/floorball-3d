import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPlanarity } from '../web/src/authoring/photo-overlay/pose-diagnostics.js';

test('assessPlanarity flags an all-floor (y=0) point set as degenerate', () => {
  const points = [
    [-2500, 0, 2850], [2500, 0, 2850], [-2500, 0, 6850], [2500, 0, 6850],
    [-800, 0, 3450], [800, 0, 3450],
  ];
  const { degenerate, score } = assessPlanarity(points);
  assert.equal(degenerate, true);
  assert.equal(score, 0);
});

test('assessPlanarity flags an all-board-top (y=500) point set as degenerate', () => {
  const points = [
    [-10000, 500, 20000], [10000, 500, 20000], [-10000, 500, 2000],
    [10000, 500, 2000], [-10000, 500, 38000], [10000, 500, 38000],
  ];
  assert.equal(assessPlanarity(points).degenerate, true);
});

test('assessPlanarity flags a plane that is not axis-aligned as degenerate too', () => {
  // Every point satisfies z = x + y (an arbitrary tilted plane) - the old
  // distinctY-based check would have missed this since Y varies per point.
  const points = [
    [0, 0, 0], [100, 0, 100], [0, 100, 100], [200, 300, 500], [50, 50, 100], [10, 10, 20],
  ];
  assert.equal(assessPlanarity(points).degenerate, true);
});

test('assessPlanarity does not flag a genuine 3D spread (floor + post-top mix)', () => {
  const points = [
    [-2500, 0, 2850], [2500, 0, 2850], [-2500, 0, 6850], [2500, 0, 6850],
    [-800, 1150, 3450], [800, 1150, 3450],
  ];
  const { degenerate, score } = assessPlanarity(points);
  assert.equal(degenerate, false);
  assert.ok(score > 1e-9);
});

test('assessPlanarity treats fewer than 4 points as degenerate', () => {
  assert.equal(assessPlanarity([[0, 0, 0], [1, 1, 1], [2, 2, 2]]).degenerate, true);
});
