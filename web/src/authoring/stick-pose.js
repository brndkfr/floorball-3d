// Stick in the figures' hands (A-BACK-034): where the stick sits relative
// to a figure, where the hands grip it, and a two-bone solver for elbows
// and knees. three-free so it runs under node --test; figures.js applies it
// to the skeleton after the gait clips have posed it.
//
// Frame: mm, figure-local, +Y up, figure facing +Z, so +X is the figure's
// LEFT (right-handed axes). Stance and grip numbers are look-based
// estimates, not sourced values.

// Must match generators/generate_stick.py (STICK_LENGTH, LIE_DEG, and the
// axis floor point R sin(HEEL_ANGLE) with R = 270, HEEL_ANGLE = 0.30).
export const STICK_LENGTH_MM = 920;
export const STICK_LIE_DEG = 60;
export const STICK_AXIS_FLOOR_X = 270 * Math.sin(0.30);

// Handedness as floorball counts it: 'L' = blade on the player's left,
// left hand low on the shaft, right hand on top. Swiss / Nordic players are
// mostly left, so that is the default.
export const STICK_HAND_DEFAULT = 'L';
export function stickHand(player) {
  const h = player?.hand;
  return h === 'L' || h === 'R' ? h : STICK_HAND_DEFAULT;
}

// Sets `hand` for player `id` on every frame that has the player (it is a
// property of the player, not of one keyframe). The default is not stored.
// Returns whether anything changed.
export function setHandInFrames(frames, id, hand) {
  if (hand !== 'L' && hand !== 'R') return false;
  const stored = hand === STICK_HAND_DEFAULT ? undefined : hand;
  let changed = false;
  for (const f of frames) {
    const p = f?.scheme?.players?.[id];
    if (!p || p.hand === stored) continue;
    if (stored === undefined) delete p.hand; else p.hand = stored;
    changed = true;
  }
  return changed;
}

// Estimates: blade contact point beside and in front of the feet, and the
// floor point the shaft points back toward (just in front of the body, on
// the top-hand side).
export const BLADE_SIDE_MM = 300;
export const BLADE_FORWARD_MM = 650;
const AIM_SIDE_MM = -80;
const AIM_FORWARD_MM = 150;

// Ready stance on top of the upright gait clips (estimates): how far the
// pelvis drops (knees bend to keep the feet planted) and how far the spine
// leans forward.
export const PELVIS_DROP_MM = 240;
// Torso turned toward the stick: the bottom-hand shoulder this far ahead of
// square, whatever twist the clip had (the idle clip's right shoulder sits
// ~126 mm behind the left, which only suited left-handed players).
export const SHOULDER_TWIST_DEG = 20;
export const SPINE_LEAN_DEG = 40;

// Grips, as distances along the shaft axis from its floor point (estimates):
// top hand just below the knob, bottom hand one hand-span lower.
export const TOP_GRIP_FROM_END_MM = 40;
export const HAND_SPACING_MM = 220;

// Where the stick object goes: `position` = blade floor-contact point (the
// asset's origin), `yaw` = rotation about +Y that turns the asset's +X
// (blade heel -> shaft) toward the body, `mirror` = flip the asset's Z
// (the generated stick is a left stick; see generate_stick.py's frame).
export function stickPlacement(hand) {
  const side = hand === 'R' ? -1 : 1;
  const position = { x: side * BLADE_SIDE_MM, y: 0, z: BLADE_FORWARD_MM };
  const hx = side * AIM_SIDE_MM - position.x;
  const hz = AIM_FORWARD_MM - position.z;
  const len = Math.hypot(hx, hz);
  const dir = { x: hx / len, z: hz / len };
  // Rotation by yaw about +Y maps (1, 0, 0) to (cos yaw, 0, -sin yaw).
  return { position, yaw: Math.atan2(-dir.z, dir.x), dir, mirror: hand === 'R' };
}

const LIE = STICK_LIE_DEG * Math.PI / 180;

// Point at distance `s` along the shaft axis (from its floor point) of the
// original fixed placement.
function alongPlacement(p, s) {
  const h = STICK_AXIS_FLOOR_X + Math.cos(LIE) * s;
  return { x: p.position.x + p.dir.x * h, y: Math.sin(LIE) * s, z: p.position.z + p.dir.z * h };
}

const TOP_S = STICK_LENGTH_MM - TOP_GRIP_FROM_END_MM;

// --- the pose (A-BACK-041 step 1) ---------------------------------------
// One stance + stick pose, in figure-local mm for a LEFT-handed player
// (blade on the left, +X); stickTransform() mirrors x for 'R'.
//   blade  blade floor-contact point (the stick asset's origin)
//   top    top-hand grip point; the shaft runs from the blade toward it
//   roll   deg, blade face open / closed (not applied before step 3)
//   twist  deg, bottom-hand shoulder ahead of square
//   lean   deg, spine forward lean
//   drop   mm, pelvis drop
//   shift  mm, pelvis shift (weight transfer), x = the player's left
// DEFAULT_POSE is the ready stance of A-BACK-034, taken from the original
// fixed placement, so applying it changes nothing.
export const DEFAULT_POSE = Object.freeze({
  blade: Object.freeze({ ...stickPlacement('L').position }),
  top: Object.freeze(alongPlacement(stickPlacement('L'), TOP_S)),
  roll: 0,
  twist: SHOULDER_TWIST_DEG,
  lean: SPINE_LEAN_DEG,
  drop: PELVIS_DROP_MM,
  shift: Object.freeze({ x: 0, z: 0 }),
});

// Where the stick object goes for `pose`: `position` (blade contact point),
// `yaw` about +Y as in stickPlacement(), `tilt` (rad) about the stick's own
// Z after the yaw (positive raises the shaft above its STICK_LIE_DEG), the
// shaft's `elevation` (lie + tilt), `roll` (rad), `mirror`, and `dir` (unit
// floor direction blade -> shaft).
//
// The blade point, the shaft's floor point and the top grip's floor
// projection share one horizontal line, so the yaw is the direction of
// top - blade. Tilting about the blade point also lifts the shaft's floor
// point (it is STICK_AXIS_FLOOR_X along the asset's +X), so the shaft line
// through `top` needs, with phi = lie + tilt and (h, r) = top - blade in
// the shaft's vertical plane: h sin(phi) - r cos(phi) = AXIS_X sin(lie).
export function stickTransform(pose, hand) {
  const m = hand === 'R' ? -1 : 1;
  const position = { x: m * pose.blade.x, y: pose.blade.y, z: pose.blade.z };
  const top = { x: m * pose.top.x, y: pose.top.y, z: pose.top.z };
  const hx = top.x - position.x, hz = top.z - position.z;
  const h = Math.hypot(hx, hz);
  const dir = { x: hx / h, z: hz / h };
  const r = top.y - position.y;
  const reach = Math.hypot(h, r);
  const elevation = Math.atan2(r, h) + Math.asin(Math.min(1, STICK_AXIS_FLOOR_X * Math.sin(LIE) / reach));
  return {
    position, dir, elevation,
    yaw: Math.atan2(-dir.z, dir.x),
    tilt: elevation - LIE,
    roll: (pose.roll || 0) * Math.PI / 180,
    mirror: hand === 'R',
  };
}

// Point at distance `s` along the shaft axis of a stickTransform() result,
// measured from the shaft's (tilted) floor point.
function alongShaft(t, s) {
  const h = STICK_AXIS_FLOOR_X * Math.cos(t.tilt) + Math.cos(t.elevation) * s;
  return {
    x: t.position.x + t.dir.x * h,
    y: t.position.y + STICK_AXIS_FLOOR_X * Math.sin(t.tilt) + Math.sin(t.elevation) * s,
    z: t.position.z + t.dir.z * h,
  };
}

// Grip targets (figure-local mm) and which hand ('l' / 'r') holds each.
export function gripPoints(hand, pose = DEFAULT_POSE) {
  const p = stickTransform(pose, hand);
  return {
    top: alongShaft(p, TOP_S),
    bottom: alongShaft(p, TOP_S - HAND_SPACING_MM),
    topHand: hand === 'R' ? 'l' : 'r',
    bottomHand: hand === 'R' ? 'r' : 'l',
  };
}

// The clips are not symmetric (the idle body leans), so the planned bottom
// grip can be out of reach for one hand. Like a real player's, the bottom
// hand then slides up the shaft: returns the lowest shaft point within
// `reach` of `shoulder` (figure-local mm), but no closer than
// MIN_HAND_SPACING_MM to the top grip.
export const MIN_HAND_SPACING_MM = 100;
export function bottomGripWithin(hand, shoulder, reach, pose = DEFAULT_POSE) {
  const p = stickTransform(pose, hand);
  const lo = TOP_S - HAND_SPACING_MM, hi = TOP_S - MIN_HAND_SPACING_MM;
  const inReach = (s) => norm(sub(alongShaft(p, s), shoulder)) <= reach;
  if (inReach(lo)) return alongShaft(p, lo);
  if (!inReach(hi)) return alongShaft(p, hi);
  let a = lo, b = hi; // a out of reach, b in reach
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (inReach(m)) b = m; else a = m;
  }
  return alongShaft(p, b);
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => Math.hypot(a.x, a.y, a.z);

// Middle joint (elbow / knee) of a two-bone chain root -> target with bone
// lengths a, b, bent toward `pole` (any vector; only its part perpendicular
// to root -> target matters). Out of reach: the chain straightens toward
// the target.
export function twoBoneElbow(root, target, a, b, pole) {
  const d = sub(target, root);
  let dist = norm(d);
  if (dist < 1e-6) return add(root, scale(pole, a / (norm(pole) || 1)));
  const u = scale(d, 1 / dist);
  dist = Math.min(dist, a + b);
  // Distance along u to the elbow's projection, and the elbow's offset.
  const x = (a * a - b * b + dist * dist) / (2 * dist);
  const y = Math.sqrt(Math.max(0, a * a - x * x));
  let perp = sub(pole, scale(u, dot(pole, u)));
  const pl = norm(perp);
  if (pl < 1e-9) {
    // Pole parallel to the chain: pick any perpendicular.
    perp = Math.abs(u.y) < 0.9 ? sub({ x: 0, y: 1, z: 0 }, scale(u, u.y)) : sub({ x: 1, y: 0, z: 0 }, scale(u, u.x));
  }
  const v = scale(perp, 1 / norm(perp));
  return add(root, add(scale(u, x), scale(v, y)));
}
