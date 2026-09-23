import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitGoalFrame } from '../web/src/authoring/photo-overlay/goal-frame.js';

// Tiny raster so tests can draw a synthetic red mask the way detect.js sees it.
function makeMask(w, h) {
  const data = new Uint8Array(w * h);
  const m = {
    w, h, data,
    redAt: (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      return xi >= 0 && yi >= 0 && xi < w && yi < h && data[yi * w + xi] > 0;
    },
    fill(x0, y0, x1, y1, v = 1) {
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) data[y * w + x] = v;
      }
      return m;
    },
    // thick line by stamping squares along it
    line(x0, y0, x1, y1, t = 8) {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
        m.fill(Math.round(x - t / 2), Math.round(y - t / 2), Math.round(x + t / 2), Math.round(y + t / 2));
      }
      return m;
    },
  };
  return m;
}

// Hough on mask edges yields both sides of each tube - mimic that.
const tubeEdges = (x0, y0, x1, y1, t = 8) => {
  const vertical = Math.abs(x1 - x0) < Math.abs(y1 - y0);
  const o = t / 2;
  return vertical
    ? [[x0 - o, y0, x1 - o, y1], [x0 + o, y0, x1 + o, y1]]
    : [[x0, y0 - o, x1, y1 - o], [x0, y0 + o, x1, y1 + o]];
};

// A floorball goal has no front ground bar: the front face is two posts + a
// crossbar, and the base frame runs from each post foot back to the rear bar.
function drawGoal(m, [tl, tr, br, bl], t = 8) {
  const backL = [bl[0] + 25, bl[1] - 30], backR = [br[0] - 25, br[1] - 30];
  m.line(...tl, ...tr, t).line(...tr, ...br, t).line(...bl, ...tl, t);
  m.line(...bl, ...backL, t).line(...br, ...backR, t).line(...backL, ...backR, t);
  return [
    ...tubeEdges(...tl, ...tr, t), ...tubeEdges(...tr, ...br, t), ...tubeEdges(...bl, ...tl, t),
    ...tubeEdges(...backL, ...backR, t),
  ];
}

const assertCorners = (res, want, tol = 4) => {
  assert.ok(res, 'expected a goal frame, got null');
  res.corners.forEach((p, i) => {
    const d = Math.hypot(p[0] - want[i][0], p[1] - want[i][1]);
    assert.ok(d <= tol, `corner ${i}: got ${p.map((v) => v.toFixed(1))} want ${want[i]} (off ${d.toFixed(1)})`);
  });
};

const FRONT = [[100, 60], [320, 60], [320, 220], [100, 220]];

test('clean front-view frame: corners on the tube centre lines', () => {
  const m = makeMask(420, 300);
  const segs = drawGoal(m, FRONT);
  assertCorners(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), FRONT);
});

test('perspective (side-ish) view: trapezoid frame', () => {
  const quad = [[100, 70], [230, 50], [232, 200], [104, 230]];
  const m = makeMask(420, 300);
  const segs = drawGoal(m, quad);
  assertCorners(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), quad);
});

test('ignores red clutter: spectator poles above, goalie blob inside, floor ad below', () => {
  const m = makeMask(420, 320);
  const segs = drawGoal(m, FRONT);
  // tall background pole crossing behind the crossbar
  m.line(160, 0, 160, 50, 8); segs.push(...tubeEdges(160, 0, 160, 50));
  m.line(380, 0, 380, 300, 10); segs.push(...tubeEdges(380, 0, 380, 300, 10));
  // solid orange goalie inside the mouth
  m.fill(170, 110, 260, 210); segs.push([170, 110, 170, 210], [260, 110, 260, 210], [170, 110, 260, 110]);
  // red floor ad band below the goal (not touching)
  m.fill(0, 260, 419, 300); segs.push([0, 260, 419, 260], [0, 300, 419, 300]);
  assertCorners(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), FRONT);
});

test('goalie hides the lower half of the right post', () => {
  const m = makeMask(420, 300);
  const segs = drawGoal(m, FRONT);
  m.fill(250, 140, 340, 240, 0);
  const visible = segs.filter(([x0, y0, x1, y1]) => !(Math.min(x0, x1) > 250 && Math.max(y0, y1) > 140));
  visible.push(...tubeEdges(320, 60, 320, 140));
  assertCorners(fitGoalFrame({ segments: visible, redAt: m.redAt, width: m.w, height: m.h }), FRONT, 6);
});

test('red floor ad touching the post feet does not drag the bottom corners down', () => {
  const m = makeMask(420, 320);
  const segs = drawGoal(m, FRONT);
  m.fill(0, 224, 419, 270);
  segs.push([0, 224, 419, 224], [0, 270, 419, 270]);
  assertCorners(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), FRONT, 6);
});

test('orange goalie merged with the lower right post', () => {
  const m = makeMask(420, 300);
  const segs = drawGoal(m, FRONT);
  // touches the post's inner edge (316), so the mask merges them
  m.fill(240, 150, 315, 240);
  segs.push([240, 150, 240, 240], [240, 150, 318, 150]);
  assertCorners(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), FRONT, 6);
});

test('off-axis camera: goal side frame merges into the outer side of a post', () => {
  const m = makeMask(420, 300);
  const segs = drawGoal(m, FRONT);
  m.line(320, 60, 370, 110, 8).line(370, 110, 372, 190, 8);
  segs.push(...tubeEdges(370, 110, 372, 190));
  assertCorners(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), FRONT, 6);
});

test('red stand railing above the goal is not taken as the crossbar', () => {
  const m = makeMask(420, 300);
  const segs = drawGoal(m, FRONT);
  m.line(60, 18, 380, 14, 8); segs.push(...tubeEdges(60, 18, 380, 14));
  // spectators in red scattered between railing and crossbar
  m.fill(90, 26, 110, 34); m.fill(310, 30, 330, 40);
  assertCorners(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), FRONT, 6);
});

test('crossbar washed out over a white ad board (only partly red)', () => {
  const m = makeMask(420, 300);
  const segs = drawGoal(m, FRONT);
  m.fill(150, 50, 290, 70, 0);
  const kept = segs.filter(([x0, y0, x1, y1]) => !(Math.abs(y0 - y1) < 2 && Math.abs(y0 - 60) < 8));
  assertCorners(fitGoalFrame({ segments: kept, redAt: m.redAt, width: m.w, height: m.h }), FRONT, 6);
});

test('no goal-like frame returns null', () => {
  const m = makeMask(420, 300);
  m.fill(50, 50, 150, 150);
  const segs = [[50, 50, 50, 150], [150, 50, 150, 150], [50, 50, 150, 50], [50, 150, 150, 150]];
  assert.equal(fitGoalFrame({ segments: segs, redAt: m.redAt, width: m.w, height: m.h }), null);
  assert.equal(fitGoalFrame({ segments: [], redAt: m.redAt, width: m.w, height: m.h }), null);
});
