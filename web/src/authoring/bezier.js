// Pure interpolation math for playback.js. Kept dependency-free so it
// can be unit-tested under `node --test` without pulling three.js or
// scene.js into the import graph.

// Cubic Bezier evaluation on a single axis. c1 defaults to p0 + (p1-p0)/3
// and c2 to p0 + 2(p1-p0)/3, which degenerates to a straight line - so
// bezierPos(t) matches lerp(t) exactly when no control points are set.
export function bezierPos(p0, p1, c1, c2, t) {
  const _c1 = (c1 === undefined || c1 === null) ? p0 + (p1 - p0) / 3 : c1;
  const _c2 = (c2 === undefined || c2 === null) ? p0 + 2 * (p1 - p0) / 3 : c2;
  const it = 1 - t;
  return it * it * it * p0
       + 3 * it * it * t * _c1
       + 3 * it * t * t * _c2
       + t * t * t * p1;
}

// Returns [c1x, c1z, c2x, c2z] in absolute world coords for the segment
// (pa -> pb). pa.im1 is the outgoing control offset from pa (stored as
// { dx, dz } relative to pa's position); pb.im2 is the incoming control
// offset relative to pb. Absent controls resolve to undefined so
// bezierPos() picks its straight-line defaults.
export function segmentControls(pa, pb) {
  const c1x = pa?.im1 ? pa.x + pa.im1.dx : undefined;
  const c1z = pa?.im1 ? pa.z + pa.im1.dz : undefined;
  const c2x = pb?.im2 ? pb.x + pb.im2.dx : undefined;
  const c2z = pb?.im2 ? pb.z + pb.im2.dz : undefined;
  return [c1x, c1z, c2x, c2z];
}

// Linear interpolation of two angles, taking the short way around
// (result wrapped into (-pi, pi]). atan2 (rather than %-modulo) is used
// because JS `%` keeps the dividend's sign, which would make the "short
// path" go the long way for large negative deltas (e.g. +170deg -> -170deg).
export function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}
