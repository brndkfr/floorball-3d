// Pure geometric diagnostics for the landmark set fed into solvePnP
// (pnp.js). No OpenCV/THREE dependency so these stay unit-testable without
// a browser. See docs/plan.md B-BUG-001.

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
