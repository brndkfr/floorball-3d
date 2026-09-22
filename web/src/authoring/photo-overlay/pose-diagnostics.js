// Pure geometric diagnostics for the landmark set fed into solvePnP
// (pnp.js). No OpenCV/THREE dependency so these stay unit-testable without
// a browser. See docs/plan.md B-BUG-001, B-BUG-003, B-BACK-006.

// [x,y,z][] -> 3x3 covariance matrix (population, not sample - only used
// for a scale-invariant degeneracy ratio, so the denominator convention
// doesn't matter).
function covariance3x3(worldPoints) {
  const n = worldPoints.length;
  const mean = [0, 0, 0];
  for (const p of worldPoints) { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; }
  mean[0] /= n; mean[1] /= n; mean[2] /= n;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of worldPoints) {
    const d = [p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j];
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) cov[i][j] /= n;
  }
  return cov;
}

function det3x3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

// B-BUG-001: solvePnP has a depth/FOV ambiguity whenever every landmark
// lies on a single plane, regardless of which plane that is. The old check
// (`distinctY <= 1`) only caught the specific "all floor" / "all board-top"
// cases this app's landmark set happens to produce; it missed any other
// degenerate arrangement (e.g. a set that varies in Y but is still
// effectively planar once X/Z are folded in). det(covariance) is exactly 0
// for any exactly-coplanar point set and grows with true 3D spread, so
// normalizing it by trace^3 gives a scale-invariant score that's ~0 for
// degenerate sets and comfortably positive otherwise - no assumption about
// which axis carries the missing dimension.
export function assessPlanarity(worldPoints, opts = {}) {
  const { threshold = 1e-9 } = opts;
  if (worldPoints.length < 4) return { degenerate: true, score: 0 };
  const cov = covariance3x3(worldPoints);
  const trace = cov[0][0] + cov[1][1] + cov[2][2];
  if (trace <= 0) return { degenerate: true, score: 0 };
  const score = det3x3(cov) / Math.pow(trace / 3, 3);
  return { degenerate: score < threshold, score };
}

function distance3(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// B-BUG-003: a landmark far outside the main cluster (e.g. a board/centre-
// line point ~16-20m from the goal cluster) has outsized leverage on the
// solve - a small pixel-placement slip there swings the pose far more than
// the same slip on a near-goal point would. Flags any point that is BOTH a
// world-space distance outlier relative to the other points' centroid AND
// already carrying elevated reprojection error - the two-condition test
// keeps this from flagging every legitimately-far board point, only ones
// that are also currently hurting the solve.
export function findLeverageOutliers(points, perPointErrorPx, opts = {}) {
  const { distanceFactor = 2.5, errorPxThreshold = 5 } = opts;
  const n = points.length;
  if (n < 4 || !perPointErrorPx || perPointErrorPx.length !== n) return [];
  const flagged = [];
  for (let i = 0; i < n; i++) {
    const others = points.filter((_, j) => j !== i);
    const centroid = others.reduce(
      (acc, p) => [acc[0] + p.world[0], acc[1] + p.world[1], acc[2] + p.world[2]],
      [0, 0, 0],
    ).map((v) => v / others.length);
    const otherDistances = others.map((p) => distance3(p.world, centroid));
    const medianDist = median(otherDistances);
    const myDist = distance3(points[i].world, centroid);
    const isFar = medianDist > 0 && myDist > medianDist * distanceFactor;
    const highError = perPointErrorPx[i] > errorPxThreshold;
    if (isFar && highError) flagged.push(points[i].key);
  }
  return flagged;
}

// B-BACK-006: a goal viewed near head-on is close to bilaterally symmetric,
// so trying both left/right hypotheses for the 4 auto-detected goal corners
// and picking whichever solvePnP call reports the lower reprojection error
// can end up choosing between two errors that differ in the 6th decimal
// place - not a real signal, a coin flip. This doesn't decide WHICH
// hypothesis is right (that still needs more points or a human); it only
// says whether the gap between the two trial errors is big enough to trust
// as a real signal, so callers can warn instead of silently locking in a
// guess. A relative threshold alone would fail when both errors are near 0
// (any difference looks "huge" relatively), so an absolute pixel floor is
// ORed in.
export function isAmbiguousChoice(errA, errB, opts = {}) {
  const { relativeThreshold = 0.05, absolutePxFloor = 0.5 } = opts;
  const lo = Math.min(errA, errB), hi = Math.max(errA, errB);
  if (hi === 0) return true;
  const diff = hi - lo;
  return diff < absolutePxFloor || diff / hi < relativeThreshold;
}
