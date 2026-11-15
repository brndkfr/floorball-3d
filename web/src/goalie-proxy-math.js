// Ray tests against a goalie proxy (A-BACK-042 step 2): goal coverage asks
// "does the ray from the ball to this point of the goal mouth hit the
// goalie?" 221 times per update. A few capsules and boxes answer that
// much faster than the ~10k-triangle mesh, and later follow the bones of a
// posable goalie. three-free; all in one frame (goalie-local mm).
//
// Shapes:
//   { type: 'capsule', a: {x,y,z}, b: {x,y,z}, r }   segment a-b, radius r
//   { type: 'box', min: {x,y,z}, max: {x,y,z} }       axis-aligned box
// A ray is origin `o`, unit direction `d` and length `far`; only hits in
// (0, far] count.

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Squared distance between segments p1-q1 and p2-q2 (Ericson, Real-Time
// Collision Detection, 5.1.9).
function segSegDist2(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = clamp01(f / e); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) { t = 0; s = clamp01(-c / a); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const dx = p1.x + d1.x * s - (p2.x + d2.x * t);
  const dy = p1.y + d1.y * s - (p2.y + d2.y * t);
  const dz = p1.z + d1.z * s - (p2.z + d2.z * t);
  return dx * dx + dy * dy + dz * dz;
}

export function rayHitsCapsule(o, d, far, cap) {
  const end = { x: o.x + d.x * far, y: o.y + d.y * far, z: o.z + d.z * far };
  return segSegDist2(o, end, cap.a, cap.b) <= cap.r * cap.r;
}

// Slab test.
export function rayHitsBox(o, d, far, box) {
  let t0 = 0, t1 = far;
  for (const k of ['x', 'y', 'z']) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < box.min[k] || o[k] > box.max[k]) return false;
      continue;
    }
    let ta = (box.min[k] - o[k]) / d[k], tb = (box.max[k] - o[k]) / d[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

export function rayHitsProxy(o, d, far, shapes) {
  for (const s of shapes) {
    if (s.type === 'capsule' ? rayHitsCapsule(o, d, far, s) : rayHitsBox(o, d, far, s)) return true;
  }
  return false;
}
