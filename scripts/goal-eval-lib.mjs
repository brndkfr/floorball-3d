// Pure scoring helpers for the goal auto-detect eval harness (B-BACK-010).
// Kept DOM-free so test/goal-eval.test.js can cover them under node --test;
// scripts/eval-goal-detect.mjs does the browser / Playwright side.
//
// Corners are always [[x, y] x4] in original image px, TL/TR/BR/BL as seen
// on screen (the same order detectGoal returns).

// Pass = every corner within this fraction of the true goal height
// (plan.md B-BACK-010 step 2).
export const PASS_FRAC = 0.03;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Image-space goal height: mean length of the two posts (TL-BL, TR-BR).
// Used to normalise errors so a 60 px broadcast goal and a 600 px close-up
// are scored on the same scale.
export function goalHeight(c) {
  return (dist(c[0], c[3]) + dist(c[1], c[2])) / 2;
}

// The 8 ways to walk a quad (4 start corners x 2 windings). Identity first.
const ORDERS = [0, 1, 2, 3].flatMap((s) => [
  [0, 1, 2, 3].map((i) => (s + i) % 4),
  [0, 1, 2, 3].map((i) => (s - i + 4) % 4),
]);

// Per-corner error of a detection against truth, as a fraction of the true
// goal height. The detection is matched against truth in whichever of the
// 8 corner orders fits best, so a correct quad reported in the wrong order
// still shows its geometric accuracy - orderOk says whether it came back
// in the expected TL/TR/BR/BL order (pose solving depends on that).
export function cornerErrors(truth, det) {
  if (!Array.isArray(det) || det.length !== 4) {
    return { perCorner: null, max: Infinity, pass: false, orderOk: false };
  }
  const h = goalHeight(truth);
  let best = null;
  for (const ord of ORDERS) {
    const per = truth.map((t, i) => dist(t, det[ord[i]]) / h);
    const max = Math.max(...per);
    if (!best || max < best.max) best = { per, max, identity: ord === ORDERS[0] };
  }
  const identityMax = Math.max(...truth.map((t, i) => dist(t, det[i]) / h));
  return {
    perCorner: best.per,
    max: best.max,
    pass: best.max <= PASS_FRAC + 1e-9,
    orderOk: identityMax <= best.max + 1e-9,
  };
}

// Named test ROIs around a labelled goal, mimicking how a user might drag
// the box: tight, loose, lopsided either way (goal against one edge), and
// nearly the whole photo. Every variant contains the whole goal; all are
// clamped to the image.
export function roiVariants(corners, imgW, imgH) {
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
  const box = (l, t, r, b) => {
    const x0 = Math.max(0, bx - l * bw), y0 = Math.max(0, by - t * bh);
    const x1 = Math.min(imgW, bx + bw + r * bw), y1 = Math.min(imgH, by + bh + b * bh);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const tight = box(0.1, 0.1, 0.1, 0.1);
  // Nearly the whole photo, but never cutting off a goal that touches the
  // image border.
  const inset = 0.02;
  const wx0 = Math.min(imgW * inset, tight.x), wy0 = Math.min(imgH * inset, tight.y);
  const wx1 = Math.max(imgW * (1 - inset), tight.x + tight.w);
  const wy1 = Math.max(imgH * (1 - inset), tight.y + tight.h);
  return {
    tight,
    loose: box(0.75, 0.75, 0.75, 0.75),
    left: box(0.6, 0.2, 0.05, 0.2),
    right: box(0.05, 0.2, 0.6, 0.2),
    whole: { x: wx0, y: wy0, w: wx1 - wx0, h: wy1 - wy0 },
  };
}
