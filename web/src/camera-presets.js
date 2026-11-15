// Camera presets for the 3D view (A-BACK-040 step 4). Pure table,
// three-free so it runs under node --test; ui/camera-menu.js blends the
// perspective camera to a preset's pose.
//
// A pose is { x, y, z, yaw, pitch } in the project's convention: yaw 0
// looks along +Z, pitch < 0 looks down (scene.js setCameraLook adds the
// +PI offset, see CLAUDE.md "Coordinate conventions"). Poses, not orbit
// rigs: "Player eye" stands at head height, and the blend must reach any
// pose the camera can be in.

import { RINK_L, HALF_W } from './constants.js';
import { rigToCamera } from './orbit-math.js';

// Shift + 1..6 (plain 1..4 are playback speeds).
export const PRESETS = Object.freeze([
  { id: 'stand', label: 'Stand', key: '1' },
  { id: 'goal-a', label: 'Behind goal A', key: '2' },
  { id: 'goal-b', label: 'Behind goal B', key: '3' },
  { id: 'corner', label: 'Corner', key: '4' },
  { id: 'bench', label: 'Bench side', key: '5' },
  { id: 'player', label: 'Player eye', key: '6' },
]);

// All estimates, chosen by eye in the look-shots.
const BEHIND_GOAL = { back: 2500, height: 3200, lookAt: 9000 };   // mm behind the end board, up, look-at z from that board
const CORNER = { out: 2500, height: 7000, lookAtZ: RINK_L * 0.4 };
const BENCH = { out: 2500, height: 4000 };   // the long side opposite the Stand view
const EYE = { height: 1650, pitch: -0.14 };   // ~8 degrees down

function aim(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  return { ...from, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

// `ctx` = { fit, chip }: `fit` the fitted default rig (scene.js
// applyDefaultView), `chip` the selected chip { x, z, angle } or null.
// Returns null when the preset has nothing to show (Player eye without a
// selected chip) or the id is unknown.
export function presetPose(id, { fit, chip }) {
  switch (id) {
    case 'stand': return rigToCamera(fit);
    case 'goal-a':
      return aim({ x: 0, y: BEHIND_GOAL.height, z: -BEHIND_GOAL.back }, { x: 0, y: 0, z: BEHIND_GOAL.lookAt });
    case 'goal-b':
      return aim({ x: 0, y: BEHIND_GOAL.height, z: RINK_L + BEHIND_GOAL.back }, { x: 0, y: 0, z: RINK_L - BEHIND_GOAL.lookAt });
    case 'corner':
      return aim({ x: HALF_W + CORNER.out, y: CORNER.height, z: -CORNER.out }, { x: 0, y: 0, z: CORNER.lookAtZ });
    case 'bench': {
      // Stand looks across from one long side; the bench view is the other.
      const side = Math.sign(rigToCamera(fit).x) || 1;
      return aim({ x: -side * (HALF_W + BENCH.out), y: BENCH.height, z: RINK_L / 2 }, { x: 0, y: 0, z: RINK_L / 2 });
    }
    case 'player':
      if (!chip) return null;
      return { x: chip.x, y: EYE.height, z: chip.z, yaw: chip.angle || 0, pitch: EYE.pitch };
    default: return null;
  }
}

// The preset for a key event, or null. Reads `code` (Digit2 / Numpad2):
// with Shift held, `key` is the shifted character, which differs per
// keyboard layout.
export function presetForKey({ shiftKey, ctrlKey, altKey, metaKey, code }) {
  if (!shiftKey || ctrlKey || altKey || metaKey) return null;
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code || '');
  return m ? (PRESETS.find((p) => p.key === m[1])?.id ?? null) : null;
}

// Blend two poses; yaw takes the short way round.
export function lerpPose(a, b, k) {
  if (k <= 0) return { ...a };
  const mix = (p, q) => p + (q - p) * k;
  const dyaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), z: mix(a.z, b.z), yaw: a.yaw + dyaw * k, pitch: mix(a.pitch, b.pitch) };
}

export function easeInOut(t) {
  const u = Math.min(Math.max(t, 0), 1);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}
