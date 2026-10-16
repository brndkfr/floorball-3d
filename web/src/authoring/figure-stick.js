// Ready stance + stick for a posed figure (A-BACK-034). figures.js calls
// applyStanceAndStick() right after the gait clips have set the skeleton
// (mixer.update), so every pose - edit view, playback, seek, MP4 export -
// gets the same stance for the same time.
//
// The Quaternius clips are upright: shoulders at ~1.41 m, hands hang at
// ~0.96 m, out of reach of a stick whose blade is on the floor. So, on top
// of the clip: lower the pelvis, re-bend the legs so the feet stay where
// the clip put them, lean the spine forward, then bend both arms onto the
// grips (stick-pose.js has the placement and the two-bone solver).

import * as THREE from 'three';
import {
  stickPlacement, gripPoints, bottomGripWithin, twoBoneElbow,
  PELVIS_DROP_MM, SPINE_LEAN_DEG, SHOULDER_TWIST_DEG,
} from './stick-pose.js';

const v = () => new THREE.Vector3();
const _o = v(), _a = v(), _b = v(), _c = v(), _t = v(), _e = v(), _fwd = v(), _side = v();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion();
const ELBOW_OUT = 0.7, ELBOW_DOWN = 0.2; // look-based estimates
const REACH_MARGIN = 0.98; // keep a slight bend instead of a locked elbow
const footSave = { l: { p: v(), q: new THREE.Quaternion() }, r: { p: v(), q: new THREE.Quaternion() } };

const toPlain = (p) => ({ x: p.x, y: p.y, z: p.z });
const toVec = (p, out) => out.set(p.x, p.y, p.z);

// Rotates `bone` about its own world position so that the point `from`
// (world) moves onto the ray toward `to` (world). Updates its subtree.
function aimBone(bone, from, to) {
  bone.getWorldPosition(_o);
  _a.subVectors(from, _o).normalize();
  _b.subVectors(to, _o).normalize();
  _q.setFromUnitVectors(_a, _b);
  rotateBoneWorld(bone, _q);
}

// Applies a world-space rotation delta to a bone (local = P^-1 * d * P * local).
function rotateBoneWorld(bone, delta) {
  bone.parent.getWorldQuaternion(_pq);
  _pqi.copy(_pq).invert();
  bone.quaternion.premultiply(_pqi.multiply(delta).multiply(_pq));
  bone.updateMatrixWorld(true);
}

function worldPos(bone, out) {
  return bone.getWorldPosition(out);
}

// World -> figure-local mm (plain object).
function worldToFig(fig, p) {
  const l = fig.worldToLocal(_o.copy(p));
  return { x: l.x * 1000, y: l.y * 1000, z: l.z * 1000 };
}

// Figure-local mm (stick-pose.js frame) -> world.
function figToWorld(fig, p, out) {
  return fig.localToWorld(out.set(p.x / 1000, p.y / 1000, p.z / 1000));
}

// Places the stick (a child of the figure) for `hand` and returns nothing;
// call before the arms are solved.
export function placeStick(stick, hand) {
  const p = stickPlacement(hand);
  stick.position.set(p.position.x / 1000, 0, p.position.z / 1000);
  stick.rotation.set(0, p.yaw, 0);
  stick.scale.set(0.001, 0.001, p.mirror ? -0.001 : 0.001);
}

function bones(fig) {
  if (fig.userData.stanceBones) return fig.userData.stanceBones;
  const get = (n) => {
    const b = fig.getObjectByName(n);
    if (!b) throw new Error(`figure-stick: bone ${n} missing`);
    return b;
  };
  const b = { pelvis: get('pelvis'), spine: get('spine_01') };
  for (const s of ['l', 'r']) {
    b['thigh_' + s] = get('thigh_' + s);
    b['calf_' + s] = get('calf_' + s);
    b['foot_' + s] = get('foot_' + s);
    b['upperarm_' + s] = get('upperarm_' + s);
    b['lowerarm_' + s] = get('lowerarm_' + s);
    b['hand_' + s] = get('hand_' + s);
  }
  fig.userData.stanceBones = b;
  return b;
}

// Call before mixer.update(). Puts every bone the stance touches back to
// the pure clip pose the mixer produced last time (saved by
// applyStanceAndStick before it changed anything). Two reasons:
// - the clips don't animate every bone the stance changes (e.g. the pelvis
//   position), so the stance would otherwise compound on every re-pose and
//   fold the figure up;
// - three's PropertyMixer skips writing a value it computes as unchanged
//   since its last write, so the bones must hold exactly that last write -
//   restoring the bind pose instead left bind values on those bones.
export function resetStanceBones(fig) {
  for (const bone of Object.values(bones(fig))) {
    const clip = bone.userData.clipPose;
    if (!clip) continue;
    bone.position.copy(clip.p);
    bone.quaternion.copy(clip.q);
  }
}

function saveClipPose(b) {
  for (const bone of Object.values(b)) {
    const clip = bone.userData.clipPose ??= { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    clip.p.copy(bone.position);
    clip.q.copy(bone.quaternion);
  }
}

export function applyStanceAndStick(fig, stick, hand) {
  const b = bones(fig);
  saveClipPose(b);
  fig.updateMatrixWorld(true);
  // Figure axes in world: forward (+Z local) and left (+X local).
  fig.getWorldQuaternion(_q);
  _fwd.set(0, 0, 1).applyQuaternion(_q).setY(0).normalize();
  _side.set(1, 0, 0).applyQuaternion(_q).setY(0).normalize();
  const mmToWorld = fig.getWorldScale(_c).x / 1000; // world units per figure-local mm

  // 1. Remember where the clip put the feet.
  for (const s of ['l', 'r']) {
    worldPos(b['foot_' + s], footSave[s].p);
    b['foot_' + s].getWorldQuaternion(footSave[s].q);
  }

  // 2. Lower the pelvis.
  worldPos(b.pelvis, _t);
  _t.y -= PELVIS_DROP_MM * mmToWorld;
  b.pelvis.parent.worldToLocal(_t);
  b.pelvis.position.copy(_t);
  b.pelvis.updateMatrixWorld(true);

  // 3. Legs: knees forward, feet back on their clip positions.
  for (const s of ['l', 'r']) {
    const thigh = b['thigh_' + s], calf = b['calf_' + s], foot = b['foot_' + s];
    const hip = toPlain(worldPos(thigh, _a));
    const knee0 = worldPos(calf, _b);
    const lenA = knee0.distanceTo(_a);
    const lenB = worldPos(foot, _c).distanceTo(knee0);
    const knee = twoBoneElbow(hip, toPlain(footSave[s].p), lenA, lenB, toPlain(_fwd));
    aimBone(thigh, worldPos(calf, _b), toVec(knee, _e));
    aimBone(calf, worldPos(foot, _b), footSave[s].p);
    foot.parent.getWorldQuaternion(_pq);
    foot.quaternion.copy(_pq.invert().multiply(footSave[s].q));
    foot.updateMatrixWorld(true);
  }

  // 4. Lean the spine forward about the figure's left axis. A positive
  //    rotation about +X(left) tips +Y toward +Z (forward).
  _q.setFromAxisAngle(_side, SPINE_LEAN_DEG * Math.PI / 180);
  rotateBoneWorld(b.spine, _q);

  // 4b. Turn the torso about the vertical so the shoulder line (left ->
  //     right) sits at a fixed angle: bottom-hand shoulder forward.
  const t = SHOULDER_TWIST_DEG * Math.PI / 180;
  const lowLeft = gripPoints(hand).bottomHand === 'l';
  worldPos(b.upperarm_r, _a).sub(worldPos(b.upperarm_l, _b)).setY(0).normalize();
  // Right = -left; the left shoulder ahead means the line points back.
  _e.copy(_side).multiplyScalar(-Math.cos(t)).addScaledVector(_fwd, lowLeft ? -Math.sin(t) : Math.sin(t));
  const turn = Math.atan2(_a.z * _e.x - _a.x * _e.z, _a.dot(_e));
  _q.setFromAxisAngle(_c.set(0, 1, 0), turn);
  rotateBoneWorld(b.spine, _q);

  // 5. Stick, then both arms onto their grips; elbows bend down, back and out.
  placeStick(stick, hand);
  stick.updateMatrixWorld(true);
  const g = gripPoints(hand);
  for (const [grip, s] of [[g.top, g.topHand], [null, g.bottomHand]]) {
    const upper = b['upperarm_' + s], lower = b['lowerarm_' + s], palm = b['hand_' + s];
    const shoulder = worldPos(upper, _a);
    const lenA = worldPos(lower, _b).distanceTo(shoulder);
    const lenB = worldPos(palm, _c).distanceTo(_b);
    // Bottom hand: lowest shaft point this arm reaches (stick-pose.js).
    const target = figToWorld(fig, grip ?? bottomGripWithin(hand, worldToFig(fig, shoulder), (lenA + lenB) / mmToWorld * REACH_MARGIN), _t);
    // Elbow hint: back and out, a little down. A mostly-down hint is nearly
    // parallel to an arm reaching down and barely steers the bend (gave a
    // raised "chicken wing" elbow).
    const out = s === 'l' ? 1 : -1;
    const pole = { x: -_fwd.x + _side.x * out * ELBOW_OUT, y: -ELBOW_DOWN, z: -_fwd.z + _side.z * out * ELBOW_OUT };
    const elbow = twoBoneElbow(toPlain(shoulder), toPlain(target), lenA, lenB, pole);
    aimBone(upper, worldPos(lower, _b), toVec(elbow, _e));
    aimBone(lower, worldPos(palm, _b), target);
  }
}

// For e2e checks (mm): top hand to its grip, bottom hand to the shaft
// between the planned bottom grip and the top grip, the hand spacing along
// the shaft, and the blade height above the floor.
export function stickResiduals(fig, stick, hand) {
  const b = bones(fig);
  fig.updateMatrixWorld(true);
  const g = gripPoints(hand);
  const top = worldToFig(fig, worldPos(b['hand_' + g.topHand], _a));
  const low = worldToFig(fig, worldPos(b['hand_' + g.bottomHand], _a));
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  // Closest point on the segment bottom -> top.
  const ax = g.top.x - g.bottom.x, ay = g.top.y - g.bottom.y, az = g.top.z - g.bottom.z;
  const len2 = ax * ax + ay * ay + az * az;
  const u = Math.min(1, Math.max(0, ((low.x - g.bottom.x) * ax + (low.y - g.bottom.y) * ay + (low.z - g.bottom.z) * az) / len2));
  const onShaft = { x: g.bottom.x + ax * u, y: g.bottom.y + ay * u, z: g.bottom.z + az * u };
  return {
    top: d(top, g.top),
    bottom: d(low, onShaft),
    spacing: d(onShaft, g.top),
    bladeY: stick.getWorldPosition(_a).y,
  };
}
