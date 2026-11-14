// Orbit rig for the 3D camera (A-BACK-040). Pure math, three-free so it
// runs under node --test; scene.js / selection.js / controls.js apply it
// to the perspective camera.
//
//   rig = { tx, tz, yaw, pitch, dist }
//
// (tx, tz) is the point on the floor the camera looks at and turns around,
// dist the distance to it (mm), yaw / pitch the look direction in the
// project's convention: yaw 0 looks along +Z, pitch < 0 looks down. With
// that, the camera's right at yaw 0 is world -X (scene.js's setCameraLook
// adds the +PI offset; see CLAUDE.md "Coordinate conventions").
//
// The camera stays the source of truth: a gesture reads the rig from the
// camera (cameraToRig), changes it and writes it back (rigToCamera). So
// everything that still sets the camera directly (frame camera keyframes,
// "view from ball", leaving the 2D view) needs no extra bookkeeping.

import { RINK_L, HALF_W } from './constants.js';

const DEG = Math.PI / 180;

// All estimates, chosen by feel.
export const ORBIT_LIMITS = Object.freeze({
  minPitch: -85 * DEG,   // almost straight down
  maxPitch: -3 * DEG,    // never at or under the floor plane
  minDist: 1500,
  maxDist: 120000,
  targetMargin: 5000,    // how far outside the boards the target may go
});
const ORBIT_SENSITIVITY = 0.004;   // rad per px, same feel as the old look-drag
const DOLLY_RATE = 0.0015;         // per unit of wheel deltaY: 100 -> ~16 %
const BOARD_HEIGHT = 500;
const FIT_PITCH = { landscape: -40 * DEG, portrait: -55 * DEG };
const FIT_MARGIN_PX = 12;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function basis(yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  return {
    f: { x: sy * cp, y: sp, z: cy * cp },            // forward
    r: { x: -cy, y: 0, z: sy },                      // right
    u: { x: -sy * sp, y: cp, z: -cy * sp },          // up = right x forward
    h: { x: sy, z: cy },                             // forward on the floor
  };
}

export function rigToCamera(rig) {
  const { f } = basis(rig.yaw, rig.pitch);
  return {
    x: rig.tx - f.x * rig.dist,
    y: -f.y * rig.dist,
    z: rig.tz - f.z * rig.dist,
    yaw: rig.yaw,
    pitch: rig.pitch,
  };
}

// The rig whose camera sits exactly where `cam` is. A camera that looks at
// or above the horizon has no floor target, so its pitch is pulled to the
// shallowest allowed one; the position never changes.
export function cameraToRig(cam) {
  const pitch = clamp(cam.pitch, ORBIT_LIMITS.minPitch, ORBIT_LIMITS.maxPitch);
  const dist = cam.y > 0 ? cam.y / -Math.sin(pitch) : ORBIT_LIMITS.minDist;
  const { f } = basis(cam.yaw, pitch);
  return { tx: cam.x + f.x * dist, tz: cam.z + f.z * dist, yaw: cam.yaw, pitch, dist };
}

export function clampRig(rig) {
  const m = ORBIT_LIMITS.targetMargin;
  return {
    tx: clamp(rig.tx, -HALF_W - m, HALF_W + m),
    tz: clamp(rig.tz, -m, RINK_L + m),
    yaw: rig.yaw,
    pitch: clamp(rig.pitch, ORBIT_LIMITS.minPitch, ORBIT_LIMITS.maxPitch),
    dist: clamp(rig.dist, ORBIT_LIMITS.minDist, ORBIT_LIMITS.maxDist),
  };
}

// Drag by (dx, dy) px: turn around the target. Target and distance stay.
export function orbitBy(rig, dxPx, dyPx) {
  return {
    ...rig,
    yaw: rig.yaw - dxPx * ORBIT_SENSITIVITY,
    pitch: clamp(rig.pitch - dyPx * ORBIT_SENSITIVITY, ORBIT_LIMITS.minPitch, ORBIT_LIMITS.maxPitch),
  };
}

const focalPx = (viewportH, fovDeg) => (viewportH / 2) / Math.tan((fovDeg * DEG) / 2);

function panRaw(rig, dxPx, dyPx, { viewportH, fovDeg }) {
  const { r, h } = basis(rig.yaw, rig.pitch);
  const focal = focalPx(viewportH, fovDeg);
  const sinP = -Math.sin(rig.pitch), cosP = Math.cos(rig.pitch);
  // Along the floor, toward / away from the camera: solve for the shift
  // that moves the floor point at the window centre by dy px. Near the
  // horizon the exact answer runs away, so the denominator is floored.
  const denom = Math.max(focal * sinP + dyPx * cosP, focal * sinP * 0.25);
  const fwd = (dyPx * rig.dist) / denom;
  // Sideways, at the depth that point then has.
  const side = (dxPx * (rig.dist - fwd * cosP)) / focal;
  return {
    ...rig,
    tx: rig.tx + h.x * fwd - r.x * side,
    tz: rig.tz + h.z * fwd - r.z * side,
  };
}

// Drag by (dx, dy) px: slide the floor under the cursor (the grabbed point
// follows the pointer). Look direction and distance stay.
export function panBy(rig, dxPx, dyPx, view) {
  return clampRig(panRaw(rig, dxPx, dyPx, view));
}

// Keyboard pan: `forward` / `right` in -1..1, `stepMm` the distance.
export function panKeys(rig, forward, right, stepMm) {
  const { r, h } = basis(rig.yaw, rig.pitch);
  return clampRig({
    ...rig,
    tx: rig.tx + (h.x * forward + r.x * right) * stepMm,
    tz: rig.tz + (h.z * forward + r.z * right) * stepMm,
  });
}

// Wheel: move toward (deltaY < 0) or away from the target. With a `pivot`
// ({ x, z } on the floor, usually the point under the cursor) that point
// keeps its place on screen.
export function dollyBy(rig, wheelDelta, pivot = null) {
  const dist = clamp(rig.dist * Math.exp(wheelDelta * DOLLY_RATE), ORBIT_LIMITS.minDist, ORBIT_LIMITS.maxDist);
  const s = dist / rig.dist;
  const next = { ...rig, dist };
  if (pivot) {
    next.tx = pivot.x + (rig.tx - pivot.x) * s;
    next.tz = pivot.z + (rig.tz - pivot.z) * s;
  }
  return clampRig(next);
}

// Blend for preset tweens; yaw takes the short way round.
export function lerpRig(a, b, k) {
  if (k <= 0) return { ...a };
  const dyaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  const mix = (p, q) => p + (q - p) * k;
  return {
    tx: mix(a.tx, b.tx),
    tz: mix(a.tz, b.tz),
    yaw: a.yaw + dyaw * k,
    pitch: mix(a.pitch, b.pitch),
    dist: mix(a.dist, b.dist),
  };
}

// Window pixel of world point p for the rig's camera ({ vw, vh, fovDeg },
// vertical FOV). `behind` is set when the point is behind the camera.
export function projectToScreen(rig, p, { vw, vh, fovDeg }) {
  const c = rigToCamera(rig);
  const { f, r, u } = basis(rig.yaw, rig.pitch);
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
  const zc = dx * f.x + dy * f.y + dz * f.z;
  const focal = focalPx(vh, fovDeg);
  return {
    x: vw / 2 + ((dx * r.x + dy * r.y + dz * r.z) / zc) * focal,
    y: vh / 2 - ((dx * u.x + dy * u.y + dz * u.z) / zc) * focal,
    behind: zc <= 0,
  };
}

const RINK_CORNERS = [];
for (const x of [-HALF_W, HALF_W]) for (const z of [0, RINK_L]) for (const y of [0, BOARD_HEIGHT]) RINK_CORNERS.push({ x, y, z });

function rinkBox(rig, view) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const corner of RINK_CORNERS) {
    const p = projectToScreen(rig, corner, view);
    if (p.behind) return null;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}

// The default "stand" view: the whole rink (boards included) fitted into
// the stage, the window minus the shell insets (same insets as the 2D fit
// in ui/stage-frustum.js). Landscape stages look across from the long
// side, portrait ones along the rink from behind goal A. Not limited by
// ORBIT_LIMITS.maxDist: a narrow stage needs whatever distance it needs.
export function fitRigToRink({ vw, vh, fovDeg, insets = {} }) {
  let { left = 0, right = 0, top = 0, bottom = 0 } = insets;
  if (vw - left - right < 2 * FIT_MARGIN_PX + 1 || vh - top - bottom < 2 * FIT_MARGIN_PX + 1) left = right = top = bottom = 0;
  const view = { vw, vh, fovDeg, viewportH: vh };
  const stage = { x0: left + FIT_MARGIN_PX, x1: vw - right - FIT_MARGIN_PX, y0: top + FIT_MARGIN_PX, y1: vh - bottom - FIT_MARGIN_PX };
  const landscape = (stage.x1 - stage.x0) >= (stage.y1 - stage.y0);
  const base = {
    tx: 0,
    tz: RINK_L / 2,
    yaw: landscape ? -Math.PI / 2 : 0,
    pitch: landscape ? FIT_PITCH.landscape : FIT_PITCH.portrait,
  };

  // Slides the target until the rink's screen box is centred on the stage.
  const centred = (dist) => {
    let rig = { ...base, dist };
    for (let i = 0; i < 12; i++) {
      const box = rinkBox(rig, view);
      if (!box) return null;
      const dx = (stage.x0 + stage.x1) / 2 - (box.x0 + box.x1) / 2;
      const dy = (stage.y0 + stage.y1) / 2 - (box.y0 + box.y1) / 2;
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) break;
      rig = panRaw(rig, dx, dy, view);
    }
    return rig;
  };
  const fits = (rig) => {
    const box = rig && rinkBox(rig, view);
    return !!box && box.x0 >= stage.x0 && box.x1 <= stage.x1 && box.y0 >= stage.y0 && box.y1 <= stage.y1;
  };

  let lo = ORBIT_LIMITS.minDist, hi = 1e6;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(centred(mid))) hi = mid; else lo = mid;
  }
  return centred(hi);
}
