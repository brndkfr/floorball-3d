import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL_SEGMENTS, poseFromMouth, projectPoint, contrastMap, scoreCorners, fitGoalModel,
  cropCamera, roiStartQuad,
} from '../web/src/authoring/photo-overlay/goal-model-fit.js';
import { cornerErrors } from '../scripts/goal-eval-lib.mjs';

// ---- synthetic scene helpers -------------------------------------------------
const W = 640, H = 480;
const CAM = { cx: W / 2, cy: H / 2, fMin: 150, fMax: 5000, fDefault: 700 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a); return a.map((v) => v / n); };

// Camera at `eye` (goal-model mm) looking at `at`: world->camera rotation
// with rows right / down / forward (camera x right, y down, z forward).
function lookAt(eye, at, f) {
  const fwd = unit(sub(at, eye));
  const right = unit(cross(fwd, [0, 1, 0]));
  const down = cross(fwd, right);
  const rows = [right, down, fwd];
  const R = [0, 1, 2].map((c) => rows.map((r) => r[c])); // columns
  const t = rows.map((r) => -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]));
  return { f, R, t };
}

const MOUTH3D = [[-800, 1150, 0], [800, 1150, 0], [800, 0, 0], [-800, 0, 0]];
const BACK3D = [[-800, 1150, 400], [800, 1150, 400], [800, 0, 650], [-800, 0, 650]];

// Screen-ordered TL, TR, BR, BL of a projected model quad (a goal seen from
// behind has the model's left post on screen right).
function screenQuad(pose, pts3d) {
  let q = pts3d.map((p) => projectPoint(pose, CAM, p, 1));
  if (q[0][0] > q[1][0]) q = [q[1], q[0], q[3], q[2]];
  return q;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// RGBA image: noisy floor, optional clutter, the goal frame drawn as tubes.
function render(pose, { floor = [60, 110, 200], tube = [200, 40, 60], width = 3, noise = 12,
  clutter = [], seed = 1 } = {}) {
  const rand = rng(seed);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = floor[c] + (rand() - 0.5) * 2 * noise;
    data[i * 4 + 3] = 255;
  }
  const line = (a, b, col, wid) => {
    const x0 = Math.floor(Math.min(a[0], b[0]) - wid), x1 = Math.ceil(Math.max(a[0], b[0]) + wid);
    const y0 = Math.floor(Math.min(a[1], b[1]) - wid), y1 = Math.ceil(Math.max(a[1], b[1]) + wid);
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
        const cov = Math.max(0, Math.min(1, wid / 2 + 0.5 - d)); // antialiased
        if (!cov) continue;
        const i = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - cov) + col[c] * cov;
      }
    }
  };
  for (const c of clutter) {
    if (c.box) {
      const [x0, y0, x1, y1] = c.box;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4; data[i] = c.col[0]; data[i + 1] = c.col[1]; data[i + 2] = c.col[2];
      }
    } else line(c.a, c.b, c.col, c.w);
  }
  for (const s of GOAL_SEGMENTS) {
    const a = projectPoint(pose, CAM, s.a, 1), b = projectPoint(pose, CAM, s.b, 1);
    if (a && b) line(a, b, tube, s.part === 'back' && s.w < 0.5 ? width * 0.7 : width);
  }
  return { width: W, height: H, data };
}

// Deterministic corner jitter of +-frac of the quad height.
function jitter(q, frac, seed = 7) {
  const rand = rng(seed);
  const h = Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1]);
  return q.map(([x, y]) => [x + (rand() - 0.5) * 2 * frac * h, y + (rand() - 0.5) * 2 * frac * h]);
}

// Front view from the rink side, raised, ~7 m away, off to one side.
const FRONT = lookAt([2500, 2200, -7000], [0, 575, 200], 700);
// Seen from behind (camera on the depth side), like Hardau / Backhand 02.
const BEHIND = lookAt([-1200, 1600, 6500], [0, 575, 300], 700);
// Small broadcast goal: far away, narrow FOV -> ~60 px tall.
const SMALL = lookAt([6000, 6000, -26000], [0, 575, 200], 1400);

// ---- pose ---------------------------------------------------------------------
test('poseFromMouth recovers focal length and the full 3D frame from the 4 mouth corners', () => {
  const corners = MOUTH3D.map((p) => projectPoint(FRONT, CAM, p, 1));
  const pose = poseFromMouth(corners, CAM);
  assert.ok(Math.abs(pose.f - 700) / 700 < 0.01, `f=${pose.f}`);
  // One of the two facings reproduces the depth / back points exactly.
  const errs = [1, -1].map((facing) => Math.max(...BACK3D.map((p) => {
    const a = projectPoint(pose, CAM, p, facing), b = projectPoint(FRONT, CAM, p, 1);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  })));
  assert.ok(Math.min(...errs) < 0.5, `back-frame reprojection error ${errs}`);
  assert.ok(Math.max(...errs) > 5, 'the other facing must be clearly different');
});

test('poseFromMouth clamps an implausible focal length instead of returning garbage', () => {
  const corners = MOUTH3D.map((p) => projectPoint(FRONT, CAM, p, 1));
  const pose = poseFromMouth(corners, { ...CAM, fMin: 900, fMax: 1200 });
  assert.equal(pose.f, 900);
  assert.equal(poseFromMouth([[0, 0], [10, 0], [20, 0], [30, 0]], CAM), null); // collinear
});

// ---- evidence -----------------------------------------------------------------
test('contrastMap: red tube and its washed-out violet version both beat the blue floor', () => {
  for (const tube of [[200, 40, 60], [140, 95, 175]]) {
    const img = render(FRONT, { tube, noise: 4 });
    const map = contrastMap(img, 12);
    const q = MOUTH3D.map((p) => projectPoint(FRONT, CAM, p, 1));
    const mid = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2]; // crossbar centre
    const at = (x, y) => map.data[Math.round(y) * W + Math.round(x)];
    assert.ok(at(...mid) > 0.3, `on tube ${at(...mid)} for ${tube}`);
    assert.ok(at(mid[0], mid[1] - 25) < 0.1, `off tube ${at(mid[0], mid[1] - 25)}`);
  }
});

test('scoreCorners: the true mouth outscores a shifted quad and a solid red blob', () => {
  const blob = [40, 300, 120, 420];
  const img = render(FRONT, { clutter: [{ box: blob, col: [210, 30, 40] }] });
  const map = contrastMap(img, 12);
  const truth = MOUTH3D.map((p) => projectPoint(FRONT, CAM, p, 1));
  const facing = [1, -1].reduce((b, f) => (scoreCorners(map, truth, CAM, f) > scoreCorners(map, truth, CAM, b) ? f : b), 1);
  const good = scoreCorners(map, truth, CAM, facing);
  const shifted = scoreCorners(map, truth.map(([x, y]) => [x + 15, y + 10]), CAM, facing);
  const onBlob = scoreCorners(map, [[50, 310], [110, 310], [110, 410], [50, 410]], CAM, facing);
  assert.ok(good > 0.3, `good ${good}`);
  assert.ok(good > shifted * 2, `good ${good} vs shifted ${shifted}`);
  assert.ok(good > onBlob * 3, `good ${good} vs blob ${onBlob}`);
});

// ---- fit ----------------------------------------------------------------------
function fitErr(pose, img, start) {
  const truth = screenQuad(pose, MOUTH3D);
  const r = fitGoalModel({ image: img, starts: [{ corners: start, from: 'test' }], cam: CAM });
  return { r, err: cornerErrors(truth, r.corners) };
}

test('fitGoalModel: recovers the mouth from a 6% jittered start (front view, clutter)', () => {
  const img = render(FRONT, {
    clutter: [
      { a: [0, 430], b: [640, 380], col: [220, 60, 50], w: 4 },   // red floor line
      { box: [470, 120, 530, 230], col: [210, 30, 40] },          // red jersey
    ],
  });
  const start = jitter(screenQuad(FRONT, MOUTH3D), 0.06);
  const { err } = fitErr(FRONT, img, start);
  assert.ok(err.max < 0.02, `max corner error ${(err.max * 100).toFixed(1)}%`);
});

test('fitGoalModel: small washed-out violet goal (~60 px) on a noisy blue floor', () => {
  const img = render(SMALL, { tube: [135, 95, 170], width: 2, noise: 10 });
  const truth = screenQuad(SMALL, MOUTH3D);
  const h = Math.hypot(truth[0][0] - truth[3][0], truth[0][1] - truth[3][1]);
  assert.ok(h > 45 && h < 90, `test setup: goal is ${h.toFixed(0)} px tall`);
  const { err } = fitErr(SMALL, img, jitter(truth, 0.06, 3));
  assert.ok(err.max < 0.05, `max corner error ${(err.max * 100).toFixed(1)}%`);
});

test('fitGoalModel: goal seen from behind, started on the BACK frame, lands on the mouth', () => {
  const img = render(BEHIND);
  const startOnBack = screenQuad(BEHIND, BACK3D);
  const { r, err } = fitErr(BEHIND, img, startOnBack);
  assert.ok(err.max < 0.03, `max corner error ${(err.max * 100).toFixed(1)}% (facing ${r.facing})`);
});

// ---- detect.js glue -----------------------------------------------------------
test('cropCamera: principal point is the FULL image centre mapped into the scaled crop', () => {
  // 4000 x 3000 photo, crop starting at (1000, 500), working scale 0.5.
  const cam = cropCamera({ imageW: 4000, imageH: 3000, offsetX: 1000, offsetY: 500, scale: 0.5 });
  assert.deepEqual([cam.cx, cam.cy], [(2000 - 1000) * 0.5, (1500 - 500) * 0.5]);
  // Focal range from 100 deg .. 15 deg horizontal FOV over the full width, in crop px.
  const fAt = (deg) => (2000 / Math.tan((deg * Math.PI) / 360)) * 0.5;
  assert.ok(Math.abs(cam.fMin - fAt(100)) < 1e-6 && Math.abs(cam.fMax - fAt(15)) < 1e-6);
  assert.ok(cam.fDefault > cam.fMin && cam.fDefault < cam.fMax);
});

test('roiStartQuad: the ROI inset by 12% in working-crop px, ordered TL, TR, BR, BL', () => {
  const q = roiStartQuad({ x: 1100, y: 600, w: 1000, h: 500 }, { offsetX: 1000, offsetY: 500, scale: 0.5 });
  assert.deepEqual(q, [[110, 80], [490, 80], [490, 270], [110, 270]]);
});

test('fitGoalModel: no valid start -> null, never throws', () => {
  const img = render(FRONT);
  assert.equal(fitGoalModel({ image: img, starts: [], cam: CAM }), null);
  assert.equal(fitGoalModel({ image: img, starts: [{ corners: [[0, 0], [1, 0], [2, 0], [3, 0]] }], cam: CAM }), null);
});
