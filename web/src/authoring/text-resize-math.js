// Pure geometry for text-shape resize handles (A-BACK-001 follow-up).
// No three.js / DOM dependencies so this can be unit-tested under
// `node --test`. Consumed by shape-handles.js.
//
// Coordinate frame: everything lives in the floor plane (world XZ). The
// top-down camera's `up` vector rotates in 90 deg steps, so the sprite's
// visible bbox axes are NOT world X/Z - they are the camera's local
// (right, up) axes projected to the floor.

// Screen-space (right, up) axes projected to the floor plane, given the
// top-down camera's world `up` vector. Camera looks along -Y; screen
// "right" = up x forward.
export function topdownAxes(camUp) {
  const ux = camUp.x, uz = camUp.z;
  const len = Math.hypot(ux, uz) || 1;
  const upN = { x: ux / len, z: uz / len };
  // right = up x (0,-1,0) in world; only X/Z components survive.
  const right = { x: -upN.z, z: upN.x };
  return { up: upN, right };
}

// Four world-XZ corners of a text sprite's tight bbox, oriented along
// the top-down camera's (right, up) axes. Order: NW, NE, SE, SW in
// screen-space.
export function textCorners(cx, cz, w, h, right, up) {
  const hw = w / 2, hh = h / 2;
  const rx = right.x, rz = right.z;
  const ux = up.x, uz = up.z;
  return [
    { x: cx - rx * hw + ux * hh, z: cz - rz * hw + uz * hh }, // NW
    { x: cx + rx * hw + ux * hh, z: cz + rz * hw + uz * hh }, // NE
    { x: cx + rx * hw - ux * hh, z: cz + rz * hw - uz * hh }, // SE
    { x: cx - rx * hw - ux * hh, z: cz - rz * hw - uz * hh }, // SW
  ];
}

// Uniform anchor-locked scale from a corner drag.
//
// Given the sprite's centre + tight bbox at drag start, the camera axes,
// which corner is being dragged, and the pointer's current world-XZ
// position, returns the new `size` (bbox height, mm) and new centre so
// the diagonally opposite corner stays fixed. Aspect is preserved.
export function resizeFromCornerDrag({
  cx, cz, w, h, size, right, up, cornerIndex,
  worldX, worldZ, minSize, maxSize,
}) {
  const halfW = w / 2, halfH = h / 2;
  const rx = right.x, rz = right.z;
  const ux = up.x, uz = up.z;
  const cornersOrig = [
    { x: cx - rx * halfW + ux * halfH, z: cz - rz * halfW + uz * halfH }, // NW
    { x: cx + rx * halfW + ux * halfH, z: cz + rz * halfW + uz * halfH }, // NE
    { x: cx + rx * halfW - ux * halfH, z: cz + rz * halfW - uz * halfH }, // SE
    { x: cx - rx * halfW - ux * halfH, z: cz - rz * halfW - uz * halfH }, // SW
  ];
  const anchor = cornersOrig[(cornerIndex + 2) % 4];
  const dxw = worldX - anchor.x;
  const dzw = worldZ - anchor.z;
  // Project onto camera right/up axes.
  const dRight = dxw * rx + dzw * rz;
  const dUp = dxw * ux + dzw * uz;
  const dirR = Math.sign(dRight) || 1;
  const dirU = Math.sign(dUp) || 1;
  const rawScale = Math.hypot(dRight, dUp) / Math.hypot(w, h);
  const newSize = Math.max(minSize, Math.min(maxSize, size * rawScale));
  const scale = newSize / size;
  const newHalfW = scale * w / 2;
  const newHalfH = scale * h / 2;
  const newCx = anchor.x + dirR * newHalfW * rx + dirU * newHalfH * ux;
  const newCz = anchor.z + dirR * newHalfW * rz + dirU * newHalfH * uz;
  return { newSize, newCx, newCz };
}
