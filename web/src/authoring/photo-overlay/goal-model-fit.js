// 3D goal-model fit for ROI goal detection (B-BACK-010 step 3.1).
//
// Instead of trusting 4 corners picked from red-mask lines, project the
// whole IFF goal frame (mouth, depth bars, back frame) into the image and
// score how much "redder than the local background" evidence lies along
// it. Per-pixel evidence on a small broadcast goal is weak (chroma
// subsampling smears the 2-3 px red tube into the floor - see plan.md
// B-BACK-010 3.0), but summed along hundreds of samples on a known shape it
// is strong, and the depth/back parts tell the mouth apart from the back
// frame on goals seen from behind.
//
// Parametrisation: the 4 image-space mouth corners (TL, TR, BR, BL - the
// tube-centreline corners of the 1600 x 1150 mm mouth). A known rectangle
// seen through a pinhole camera with known principal point fixes the focal
// length and the pose, so the 3D model follows from the 4 corners plus one
// discrete choice: whether the goal's depth points away from the camera
// (seen from the front) or towards it (seen from behind).
//
// Pure JS on plain {width, height, data} RGBA buffers - no OpenCV, no DOM -
// so test/goal-model-fit.test.js can drive it with synthetic images.

// ---- model (mm, from generators/generate_goal.py - IFF spec) ---------------
// x right, y up, z = depth behind the goal line. Must stay in sync with
// generate_goal.py's W / H / UPPER_D / LOWER_D.
export const GOAL_W = 1600;
export const GOAL_H = 1150;
const HW = GOAL_W / 2, UPPER_D = 400, LOWER_D = 650;
const FTL = [-HW, GOAL_H, 0], FTR = [HW, GOAL_H, 0], FBL = [-HW, 0, 0], FBR = [HW, 0, 0];
const BTL = [-HW, GOAL_H, UPPER_D], BTR = [HW, GOAL_H, UPPER_D];
const BBL = [-HW, 0, LOWER_D], BBR = [HW, 0, LOWER_D];

// Frame tube centrelines with a scoring weight. The mouth counts most; the
// depth and back parts mainly decide front vs back and pin the pose. No
// front floor bar: the mouth is open at the floor.
export const GOAL_SEGMENTS = [
  { a: FTL, b: FTR, w: 1.0, part: 'crossbar' },
  { a: FTL, b: FBL, w: 1.0, part: 'post' },
  { a: FTR, b: FBR, w: 1.0, part: 'post' },
  { a: FTL, b: BTL, w: 0.6, part: 'depth' },
  { a: FTR, b: BTR, w: 0.6, part: 'depth' },
  { a: FBL, b: BBL, w: 0.6, part: 'depth' },
  { a: FBR, b: BBR, w: 0.6, part: 'depth' },
  { a: BTL, b: BBL, w: 0.6, part: 'back' },
  { a: BTR, b: BBR, w: 0.6, part: 'back' },
  { a: BTL, b: BTR, w: 0.4, part: 'back' },
  { a: BBL, b: BBR, w: 0.4, part: 'back' },
];
// Mouth corners in the plane z = 0, matching image TL, TR, BR, BL.
const MOUTH = [[-HW, GOAL_H], [HW, GOAL_H], [HW, 0], [-HW, 0]];

// ---- small linear algebra ---------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = (a) => Math.hypot(a[0], a[1], a[2]);

// Gaussian elimination with partial pivoting; returns null if singular.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// Homography (h33 = 1) mapping plane points src[i] -> image points dst[i].
// Returned as columns [h1, h2, h3] (each a 3-vector).
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = src[i], [u, v] = dst[i];
    A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.push(u);
    A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [[h[0], h[3], h[6]], [h[1], h[4], h[7]], [h[2], h[5], 1]];
}

// ---- pose from the 4 mouth corners -----------------------------------------
// corners: image px [TL, TR, BR, BL]. cam: { cx, cy, fMin, fMax, fDefault }.
// Returns { f, R: [r1, r2, r3] (columns, camera coords: x right, y down,
// z forward), t } or null for a degenerate quad. With `fixedF` the focal
// length is not estimated but taken as given (clamped to the range).
export function poseFromMouth(corners, cam, fixedF) {
  return poseFromRect(corners, cam, MOUTH, fixedF);
}

// Same for any planar rectangle given by its 2D plane corners (TL, TR, BR, BL).
function poseFromRect(corners, cam, rect, fixedF) {
  // Principal point at the origin so K = diag(f, f, 1).
  const pts = corners.map(([u, v]) => [u - cam.cx, v - cam.cy]);
  const H = homography(rect, pts);
  if (!H) return null;
  const [h1, h2, h3] = H;
  // Focal length from the two rotation-column constraints (r1 . r2 = 0 and
  // |r1| = |r2|). Near fronto-parallel views make both ill-conditioned, so
  // clamp into the plausible range and fall back to the default.
  const est = fixedF ? [fixedF] : [];
  if (!fixedF) {
  const f2a = -(h1[0] * h2[0] + h1[1] * h2[1]) / (h1[2] * h2[2]);
  const f2b = (h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2) / (h2[2] ** 2 - h1[2] ** 2);
  for (const f2 of [f2a, f2b]) if (Number.isFinite(f2) && f2 > 0) est.push(Math.sqrt(f2));
  }
  let f = est.length ? est.reduce((s, v) => s + v, 0) / est.length : cam.fDefault;
  if (!(f >= cam.fMin && f <= cam.fMax)) f = Math.min(cam.fMax, Math.max(cam.fMin, f || cam.fDefault));

  const kinv = (h) => [h[0] / f, h[1] / f, h[2]];
  let r1 = kinv(h1), r2 = kinv(h2), t = kinv(h3);
  const lambda = (norm3(r1) + norm3(r2)) / 2;
  if (!(lambda > 1e-12)) return null;
  r1 = scale3(r1, 1 / lambda); r2 = scale3(r2, 1 / lambda); t = scale3(t, 1 / lambda);
  // The goal must sit in front of the camera.
  if (t[2] < 0) { r1 = scale3(r1, -1); r2 = scale3(r2, -1); t = scale3(t, -1); }
  // Orthonormalise (Gram-Schmidt), then complete the right-handed frame.
  r1 = scale3(r1, 1 / norm3(r1));
  r2 = [r2[0] - dot(r1, r2) * r1[0], r2[1] - dot(r1, r2) * r1[1], r2[2] - dot(r1, r2) * r1[2]];
  const n2 = norm3(r2);
  if (!(n2 > 1e-9)) return null;
  r2 = scale3(r2, 1 / n2);
  return { f, R: [r1, r2, cross(r1, r2)], t };
}

// Project a model point; facing = +1 / -1 flips which side of the mouth
// plane the depth goes (the two front / behind hypotheses).
export function projectPoint(pose, cam, [x, y, z], facing = 1) {
  const [r1, r2, r3] = pose.R, zz = z * facing;
  const X = r1[0] * x + r2[0] * y + r3[0] * zz + pose.t[0];
  const Y = r1[1] * x + r2[1] * y + r3[1] * zz + pose.t[1];
  const Z = r1[2] * x + r2[2] * y + r3[2] * zz + pose.t[2];
  if (Z <= 1e-6) return null;
  return [pose.f * X / Z + cam.cx, pose.f * Y / Z + cam.cy];
}

// ---- evidence map -----------------------------------------------------------
function integral(src, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}
function boxMean(src, w, h, r) {
  const I = integral(src, w, h), out = new Float32Array(w * h), W1 = w + 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

// "Redder than the local background": (R - G) minus its local box mean,
// clamped at 0 and normalised by a robust max to ~[0, 1]. R - G is high
// for the red frame AND for its chroma-smeared violet/magenta version on
// blue floors, and negative for blue/green floors. bgRadius should be a
// few tube widths, so a whole tube never dominates its own background.
export function contrastMap({ width: w, height: h, data }, bgRadius) {
  const rg = new Float32Array(w * h);
  for (let i = 0, p = 0; i < rg.length; i++, p += 4) rg[i] = data[p] - data[p + 1];
  const bg = boxMean(rg, w, h, Math.max(2, Math.round(bgRadius)));
  const c = new Float32Array(w * h);
  for (let i = 0; i < c.length; i++) c[i] = Math.max(0, rg[i] - bg[i]);
  // Robust normaliser: 99.5th percentile of the non-zero contrast.
  const nz = [];
  for (let i = 0; i < c.length; i += 7) if (c[i] > 0) nz.push(c[i]);
  nz.sort((a, b) => a - b);
  const ref = Math.max(8, nz.length ? nz[Math.floor(nz.length * 0.995)] : 8);
  for (let i = 0; i < c.length; i++) c[i] = Math.min(1, c[i] / ref);
  return { width: w, height: h, data: c };
}

// Blurred copy (3 box passes ~ Gaussian of sigma ~ r) - gives the optimiser
// a basin wider than the tube at coarse scales.
export function blurMap(map, r) {
  if (r < 1) return map;
  let d = map.data;
  for (let k = 0; k < 3; k++) d = boxMean(d, map.width, map.height, r);
  return { width: map.width, height: map.height, data: d };
}

function sample(map, x, y) {
  if (x < 0 || y < 0 || x > map.width - 1 || y > map.height - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(map.width - 1, x0 + 1), y1 = Math.min(map.height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0, W = map.width, d = map.data;
  return (d[y0 * W + x0] * (1 - fx) + d[y0 * W + x1] * fx) * (1 - fy)
    + (d[y1 * W + x0] * (1 - fx) + d[y1 * W + x1] * fx) * fy;
}

// ---- scoring + fit ----------------------------------------------------------
function isConvexQuad(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [q[i], q[(i + 1) % 4], q[(i + 2) % 4]];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}

// Weighted mean evidence along the projected frame. Each sample scores its
// on-tube evidence minus the mean evidence a few tube widths to either side,
// so a thin tube scores high but a solid red blob (jersey, banner) scores
// ~0 - otherwise the fit could shrink the whole frame onto one blob.
// Occluded or off-image parts count as 0, so the fit is rewarded for
// explaining the WHOLE frame, not just its brightest tube.
export function scoreCorners(map, corners, cam, facing, samplesPerSeg = 48) {
  if (!isConvexQuad(corners)) return -1;
  const pose = poseFromMouth(corners, cam);
  return pose ? scorePose(map, pose, cam, facing, samplesPerSeg) : -1;
}

function scorePose(map, pose, cam, facing, samplesPerSeg = 48) {
  const corners = MOUTH.map(([x, y]) => projectPoint(pose, cam, [x, y, 0], facing));
  if (!corners.every(Boolean) || !isConvexQuad(corners)) return -1;
  // Tube diameter is 32 mm on a 1150 mm post (~2.8%); look ~2 tube widths
  // out, at least 1.5 px.
  const off = Math.max(1.5, quadHeight(corners) * 0.055);
  // Segments count by projected length (a per-pixel mean along the frame):
  // a depth bar foreshortened to a few px is mostly corner joint, and equal
  // weights let the fit trade mouth accuracy for it. A segment behind the
  // camera counts as a full post of zero evidence.
  const refLen = quadHeight(corners);
  let sum = 0, wsum = 0;
  for (const seg of GOAL_SEGMENTS) {
    const a = projectPoint(pose, cam, seg.a, facing), b = projectPoint(pose, cam, seg.b, facing);
    if (!a || !b) { wsum += seg.w * refLen; continue; }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    wsum += seg.w * len;
    if (len < 1e-6) continue;
    const nx = -(b[1] - a[1]) / len * off, ny = (b[0] - a[0]) / len * off;
    let s = 0;
    // Skip the ends: rounded corners and joints are not on the straight line.
    for (let i = 0; i < samplesPerSeg; i++) {
      const t = 0.08 + 0.84 * (i + 0.5) / samplesPerSeg;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      s += sample(map, x, y) - 0.5 * (sample(map, x + nx, y + ny) + sample(map, x - nx, y - ny));
    }
    sum += seg.w * len * s / samplesPerSeg;
  }
  return sum / wsum;
}

// Nelder-Mead maximiser over a flat parameter vector.
function nelderMead(fn, x0, step, iters) {
  const n = x0.length;
  let simplex = [x0];
  for (let i = 0; i < n; i++) { const x = [...x0]; x[i] += step[i]; simplex.push(x); }
  let vals = simplex.map(fn);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
    simplex = order.map((i) => simplex[i]); vals = order.map((i) => vals[i]);
    const worst = simplex[n];
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += simplex[i][k] / n;
    const at = (s) => c.map((ck, k) => ck + s * (worst[k] - ck));
    const xr = at(-1), fr = fn(xr);
    if (fr > vals[0]) {
      const xe = at(-2), fe = fn(xe);
      if (fe > fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; }
    } else if (fr > vals[n - 1]) {
      simplex[n] = xr; vals[n] = fr;
    } else {
      const xc = at(0.5), fc = fn(xc);
      if (fc > vals[n]) { simplex[n] = xc; vals[n] = fc; } else {
        for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k])); vals[i] = fn(simplex[i]); }
      }
    }
  }
  const best = vals.indexOf(Math.max(...vals));
  return { x: simplex[best], value: vals[best] };
}

// The back frame is itself a planar rectangle: GOAL_W wide, BACK_H along
// the slope from the top back bar (depth UPPER_D) down to the floor bar
// (depth LOWER_D). Treat `corners` as that rectangle, recover its pose and
// project the mouth. The plane's normal sign is ambiguous (as for the
// mouth), so both mouths are returned, screen-ordered TL, TR, BR, BL.
const BACK_H = Math.hypot(GOAL_H, LOWER_D - UPPER_D);
const BACK_RECT = [[-HW, BACK_H], [HW, BACK_H], [HW, 0], [-HW, 0]];
function mouthsFromBack(corners, cam) {
  const pose = poseFromRect(corners, cam, BACK_RECT);
  if (!pose) return [];
  // Back-plane axes in goal coordinates: x' = x, y' up the slope, z' normal.
  const yA = [0, GOAL_H / BACK_H, -(LOWER_D - UPPER_D) / BACK_H];
  const zA = [0, (LOWER_D - UPPER_D) / BACK_H, GOAL_H / BACK_H];
  const out = [];
  for (const sign of [1, -1]) {
    const pts = [FTL, FTR, FBR, FBL].map((p) => {
      const d = [p[0], p[1], p[2] - LOWER_D];
      const local = [d[0], dot(d, yA), sign * dot(d, zA)];
      const [r1, r2, r3] = pose.R;
      const X = r1[0] * local[0] + r2[0] * local[1] + r3[0] * local[2] + pose.t[0];
      const Y = r1[1] * local[0] + r2[1] * local[1] + r3[1] * local[2] + pose.t[1];
      const Z = r1[2] * local[0] + r2[2] * local[1] + r3[2] * local[2] + pose.t[2];
      return Z > 1e-6 ? [pose.f * X / Z + cam.cx, pose.f * Y / Z + cam.cy] : null;
    });
    if (!pts.every(Boolean)) continue;
    const q = pts[0][0] > pts[1][0] ? [pts[1], pts[0], pts[3], pts[2]] : pts;
    if (isConvexQuad(q)) out.push(q);
  }
  return out;
}

// Coordinate-wise pattern search: try +-steps[k] on each coordinate, take
// any improvement, halve all steps when none helps, stop after the steps
// have shrunk 8x.
function compassSearch(fn, { x, score }, steps) {
  x = [...x];
  for (let m = 1, guard = 0; m >= 1 / 8 && guard < 400; guard++) {
    let improved = false;
    for (let k = 0; k < x.length; k++) {
      for (const s of [steps[k] * m, -steps[k] * m]) {
        const y = [...x]; y[k] += s;
        const v = fn(y);
        if (v > score + 1e-5) { x = y; score = v; improved = true; break; }
      }
    }
    if (!improved) m *= 0.5;
  }
  return { x, score };
}

// ---- pose parametrisation for the fit ---------------------------------------
const CENTRE = [0, GOAL_H / 2, 0];

// Rotation matrix (row-major) from a rotation vector.
function rodrigues([wx, wy, wz]) {
  const th = Math.hypot(wx, wy, wz);
  if (th < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const [x, y, z] = [wx / th, wy / th, wz / th], c = Math.cos(th), s = Math.sin(th), v = 1 - c;
  return [
    [c + x * x * v, x * y * v - z * s, x * z * v + y * s],
    [y * x * v + z * s, c + y * y * v, y * z * v - x * s],
    [z * x * v - y * s, z * y * v + x * s, c + z * z * v],
  ];
}

// Parameters [u, v, log s, wx, wy, wz, log f] around a start pose (see
// fitGoalModel). Returns the start vector and the vector -> pose map.
function poseParams(pose0, cam) {
  const R0 = pose0.R, f0 = pose0.f;
  const Pc = [0, 1, 2].map((i) => R0[0][i] * CENTRE[0] + R0[1][i] * CENTRE[1] + R0[2][i] * CENTRE[2] + pose0.t[i]);
  const x0 = [f0 * Pc[0] / Pc[2] + cam.cx, f0 * Pc[1] / Pc[2] + cam.cy, Math.log(f0 / Pc[2]), 0, 0, 0, Math.log(f0)];
  const toPose = ([u, v, logS, wx, wy, wz, logF]) => {
    const f = Math.exp(logF);
    if (!(f >= cam.fMin && f <= cam.fMax)) return null;
    const s = Math.exp(logS);
    const T = [(u - cam.cx) / s, (v - cam.cy) / s, f / s];
    const M = rodrigues([wx, wy, wz]);
    const R = R0.map((col) => [0, 1, 2].map((i) => M[i][0] * col[0] + M[i][1] * col[1] + M[i][2] * col[2]));
    const t = [0, 1, 2].map((i) => T[i] - (R[0][i] * CENTRE[0] + R[1][i] * CENTRE[1] + R[2][i] * CENTRE[2]));
    return { f, R, t };
  };
  return { x0, toPose };
}

// Per-parameter steps that each move the projection by ~`px` pixels on a
// goal `h` px tall; log f gets its own step.
const paramSteps = (px, h, fStep) => [px, px, px / h, 1.5 * px / h, 1.5 * px / h, 1.5 * px / h, fStep];

const quadHeight = (q) => (Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1]) + Math.hypot(q[1][0] - q[2][0], q[1][1] - q[2][1])) / 2;

// Fit the goal model starting from one or more candidate mouth quads.
//   image:  { width, height, data } RGBA (the working crop)
//   starts: [{ corners: [TL, TR, BR, BL], from: 'label' }]
//   cam:    { cx, cy, fMin, fMax, fDefault } in the same px space
// Returns { corners, facing, score, from, f } or null. Tries both facings
// per start, coarse-to-fine over blurred evidence maps.
export function fitGoalModel({ image, starts, cam, debug = null, iters = 160 }) {
  const valid = starts.filter((s) => s?.corners?.length === 4 && isConvexQuad(s.corners));
  if (!valid.length) return null;
  const hRef = Math.max(8, valid.map((s) => quadHeight(s.corners)).sort((a, b) => a - b)[Math.floor(valid.length / 2)]);
  // The "sharp" map every result is judged on is still blurred by ~1 px:
  // raw 2-3 px tubes make the score spike with sub-pixel alignment and
  // trap the optimiser in noise on small goals.
  const base = blurMap(contrastMap(image, hRef * 0.12), 1);
  // Coarse-to-fine: blur radius and simplex step as fractions of goal height.
  const levels = [[0.06, 0.08], [0.03, 0.04], [0.012, 0.015], [0, 0.006]];
  const maps = levels.map(([k]) => blurMap(base, Math.round(hRef * k)));
  if (debug) debug.modelFit = { hRef, starts: [] };

  // A candidate quad may really be the BACK frame (goal seen from behind,
  // or the detector latched onto the rear hoop). Add the mouth that quad
  // implies under that hypothesis as an extra start.
  const expanded = [];
  for (const s of valid) {
    expanded.push(s);
    mouthsFromBack(s.corners, cam).forEach((corners, i) => expanded.push({ corners, from: `${s.from}+asBack${i}` }));
  }

  // Parameters, chosen so each moves the projection by ~1 px per unit step
  // and the focal length is decoupled from position and size ("dolly
  // zoom"): [u, v] image position of the mouth centre, log s with s = f/Z
  // (px per mm there), a rotation vector about the mouth centre applied on
  // top of the start's rotation, and log f. Corner coordinates were a poor
  // choice: the focal length they imply swings wildly with 1-2 px of corner
  // noise, which throws the projected depth/back bars far off and traps the
  // fit in "mouth right, 3D wrong".
  const clampF = (f) => Math.min(cam.fMax, Math.max(cam.fMin, f));
  const fStepByLevel = [0.3, 0.15, 0.06, 0.03];
  let best = null;
  for (const start of expanded) {
    // Focal length starts: the start quad's own estimate and the default.
    const fEst = poseFromMouth(start.corners, cam)?.f ?? clampF(cam.fDefault);
    const fStarts = [fEst];
    if (Math.abs(Math.log(fEst / clampF(cam.fDefault))) > 0.2) fStarts.push(clampF(cam.fDefault));
    for (const f0 of fStarts) {
      const pose0 = poseFromMouth(start.corners, cam, f0);
      if (!pose0) continue;
      const { toPose, x0 } = poseParams(pose0, cam);
      for (const facing of [1, -1]) {
        const scoreAt = (map, v) => { const pose = toPose(v); return pose ? scorePose(map, pose, cam, facing) : -1; };
        const score0 = scoreAt(base, x0);
        // Blurred levels widen the basin but can also merge nearby tubes
        // (mouth and back frame are only a few px apart on a goal seen from
        // behind) and drag the fit off a correct start. So judge every
        // level's result on the sharp map and never accept one that is worse.
        let keep = { x: x0, score: score0 };
        for (let li = 0; li < maps.length; li++) {
          const px = Math.max(0.5, hRef * levels[li][1]);
          const step = paramSteps(px, hRef, fStepByLevel[li]);
          const fn = (v) => scoreAt(maps[li], v);
          // Restart once from the result: Nelder-Mead often stalls on a
          // collapsed simplex.
          let y = nelderMead(fn, keep.x, step, iters).x;
          y = nelderMead(fn, y, step.map((d) => d * 0.5), iters).x;
          const sharp = scoreAt(base, y);
          if (sharp > keep.score) keep = { x: y, score: sharp };
        }
        // Polish on the sharp map by compass search: on small goals the
        // landscape is rugged at the 1-2 px scale and Nelder-Mead stalls
        // short of the optimum.
        keep = compassSearch((v) => scoreAt(base, v), keep, paramSteps(Math.max(1, hRef * 0.02), hRef, 0.02));
        const pose = toPose(keep.x);
        const corners = pose && MOUTH.map(([x, y]) => projectPoint(pose, cam, [x, y, 0], facing));
        if (!corners?.every(Boolean)) continue;
        const r = { corners, facing, score: keep.score, from: start.from, f: pose.f };
        debug?.modelFit.starts.push({
          from: start.from, facing, f0: Math.round(f0), f: Math.round(pose.f), score0, score: r.score,
          corners: corners.map((q) => q.map(Math.round)),
        });
        if (!best || r.score > best.score) best = r;
      }
    }
  }
  if (debug) debug.modelFit.chosen = best && { from: best.from, facing: best.facing, score: best.score };
  return best;
}

// ---- detect.js glue ---------------------------------------------------------
// detectGoal works on a crop of the photo (offset, then scaled). The camera's
// principal point is the centre of the FULL photo, not of the crop, and the
// focal range is a horizontal FOV range over the full photo width - from
// 100 deg (phone ultra-wide) to 15 deg (broadcast zoom), default 65 deg (a
// typical phone main camera). Estimates, not measured values.
const FOV_MAX_DEG = 100, FOV_MIN_DEG = 15, FOV_DEFAULT_DEG = 65;
export function cropCamera({ imageW, imageH, offsetX, offsetY, scale }) {
  const fAt = (deg) => (imageW / 2 / Math.tan((deg * Math.PI) / 360)) * scale;
  return {
    cx: (imageW / 2 - offsetX) * scale,
    cy: (imageH / 2 - offsetY) * scale,
    fMin: fAt(FOV_MAX_DEG), fMax: fAt(FOV_MIN_DEG), fDefault: fAt(FOV_DEFAULT_DEG),
  };
}

// The user's ROI box (original px) inset by 12% per side, as a start quad
// in working-crop px: people draw the ROI a little outside the frame.
export function roiStartQuad(roi, { offsetX, offsetY, scale }) {
  const ix = roi.w * 0.12, iy = roi.h * 0.12;
  const x0 = (roi.x + ix - offsetX) * scale, x1 = (roi.x + roi.w - ix - offsetX) * scale;
  const y0 = (roi.y + iy - offsetY) * scale, y1 = (roi.y + roi.h - iy - offsetY) * scale;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}
