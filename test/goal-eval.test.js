import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  goalHeight, cornerErrors, roiVariants, PASS_FRAC,
} from '../scripts/goal-eval-lib.mjs';

// Axis-aligned 160x115 goal mouth at (100,200) - TL, TR, BR, BL.
const SQ = [[100, 200], [260, 200], [260, 315], [100, 315]];

test('goalHeight: mean of the two post lengths', () => {
  assert.equal(goalHeight(SQ), 115);
  // Perspective: left post 100 px, right post 60 px -> 80.
  assert.equal(goalHeight([[0, 0], [200, 20], [200, 80], [0, 100]]), 80);
});

test('cornerErrors: exact detection is zero error and passes', () => {
  const r = cornerErrors(SQ, SQ);
  assert.deepEqual(r.perCorner, [0, 0, 0, 0]);
  assert.equal(r.max, 0);
  assert.equal(r.pass, true);
  assert.equal(r.orderOk, true);
});

test('cornerErrors: normalises by true goal height', () => {
  // Bottom corners 23 px low = 20% of the 115 px goal height.
  const det = [[100, 200], [260, 200], [260, 338], [100, 338]];
  const r = cornerErrors(SQ, det);
  assert.deepEqual(r.perCorner.map((e) => +e.toFixed(3)), [0, 0, 0.2, 0.2]);
  assert.equal(r.max.toFixed(3), '0.200');
  assert.equal(r.pass, false);
});

test('cornerErrors: pass threshold is inclusive at PASS_FRAC of goal height', () => {
  const d = 115 * PASS_FRAC;
  assert.equal(cornerErrors(SQ, SQ.map(([x, y]) => [x + d, y])).pass, true);
  assert.equal(cornerErrors(SQ, SQ.map(([x, y]) => [x + d * 1.1, y])).pass, false);
});

test('cornerErrors: same quad in a different corner order still scores, but flags orderOk=false', () => {
  // Rotated start + reversed winding: BR, TR, TL, BL.
  const det = [SQ[2], SQ[1], SQ[0], SQ[3]];
  const r = cornerErrors(SQ, det);
  assert.equal(r.max, 0);
  assert.equal(r.orderOk, false);
});

test('cornerErrors: null / malformed detection is a miss, not a crash', () => {
  for (const det of [null, undefined, [], [[1, 2]]]) {
    const r = cornerErrors(SQ, det);
    assert.equal(r.pass, false);
    assert.equal(r.max, Infinity);
    assert.equal(r.perCorner, null);
  }
});

test('roiVariants: five named ROIs, all containing the whole goal and clamped to the image', () => {
  const rois = roiVariants(SQ, 1000, 800);
  assert.deepEqual(Object.keys(rois), ['tight', 'loose', 'left', 'right', 'whole']);
  for (const [name, r] of Object.entries(rois)) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1000 && r.y + r.h <= 800, `${name} inside image`);
    assert.ok(r.x <= 100 && r.y <= 200 && r.x + r.w >= 260 && r.y + r.h >= 315, `${name} contains goal`);
  }
  // Tight really is tight: 10% padding of the goal bbox per side.
  assert.deepEqual(rois.tight, { x: 84, y: 188.5, w: 192, h: 138 });
  // Offset variants put the goal against one edge of the ROI.
  assert.ok(rois.left.x < rois.tight.x && rois.left.x + rois.left.w < rois.tight.x + rois.tight.w);
  assert.ok(rois.right.x > rois.tight.x && rois.right.x + rois.right.w > rois.tight.x + rois.tight.w);
  // Whole = nearly the full image.
  assert.ok(rois.whole.w >= 950 && rois.whole.h >= 750);
});

test('roiVariants: goal at the image edge clamps instead of going negative', () => {
  const edge = [[0, 0], [160, 0], [160, 115], [0, 115]];
  const rois = roiVariants(edge, 400, 300);
  for (const [name, r] of Object.entries(rois)) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 400 && r.y + r.h <= 300, `${name} inside image`);
    // Even 'whole' (normally inset 2%) must not cut off an edge-touching goal.
    assert.ok(r.x <= 0 && r.y <= 0 && r.x + r.w >= 160 && r.y + r.h >= 115, `${name} contains goal`);
  }
});
