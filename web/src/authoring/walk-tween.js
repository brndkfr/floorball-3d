// A-BACK-009: walk animation for the RTS right-click move-command.
//
// The Doc stays authoritative: the move-command writes the destination into
// the doc + mesh immediately, so playback / export / serialization see the
// final position at once. This module only delays the *visual* arrival,
// easing the Object3D's rendered position from where it started to the
// destination over ~0.28 s. Ticked from main.js's animate() loop.
//
// - Interruptible: a fresh walk for an object already walking re-bases from
//   its current rendered position toward the new target.
// - Playback owns positions while it runs, so walks are never started, and
//   any in flight are snapped to their end, once playback is playing.
// - If anything else moves the object mid-walk (left-drag, keyboard move,
//   an undo rebuild) its rendered position diverges from what the tween
//   last set and the walk is abandoned rather than fought.

import { state } from '../state.js';
import { prefersReducedMotion } from '../reduced-motion.js';

const WALK_S = 0.28;
const MAX_DT = 1 / 30;   // clamp frame spikes (backgrounded tab, GC pause) so a
                         // single slow frame can't skip the whole walk
const EPS = 1;   // mm; rendered position drifting past this = someone else took over

const walks = new Map();   // Object3D -> { fromX, fromZ, toX, toZ, curX, curZ, t }
let onTick = null;         // optional: called each advancing frame (selection-ring refresh)

export function setWalkTickCallback(cb) { onTick = cb; }

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// Start or redirect a walk. `obj.position` must already hold the final
// destination; (fromX, fromZ) is where the visual ease begins. Snaps the
// rendered position back to the start so the next frame eases forward.
export function startWalk(obj, fromX, fromZ, toX, toZ) {
  if (state.playback?.playing) return;
  if (prefersReducedMotion()) {
    // Skip the ease entirely - rendered position already matches the doc
    // destination (caller set obj.position before calling us), just clear
    // any prior in-flight walk so updateWalks doesn't re-drive it.
    walks.delete(obj);
    obj.position.x = toX;
    obj.position.z = toZ;
    return;
  }
  const prev = walks.get(obj);
  const sx = prev ? prev.curX : fromX;
  const sz = prev ? prev.curZ : fromZ;
  walks.set(obj, { fromX: sx, fromZ: sz, toX, toZ, curX: sx, curZ: sz, t: 0 });
  obj.position.x = sx;
  obj.position.z = sz;
}

export function cancelWalk(obj) { walks.delete(obj); }

// Snap every in-flight walk to its destination and clear them (called when
// playback starts and from history.js's apply() before a scene rebuild).
export function finishAllWalks() {
  for (const [obj, w] of walks) { obj.position.x = w.toX; obj.position.z = w.toZ; }
  walks.clear();
}

export function walkingCount() { return walks.size; }

export function updateWalks(dt) {
  if (!walks.size) return;
  if (state.playback?.playing) { finishAllWalks(); return; }
  if (dt > MAX_DT) dt = MAX_DT;
  let advanced = false;
  for (const [obj, w] of [...walks]) {
    if (Math.abs(obj.position.x - w.curX) > EPS || Math.abs(obj.position.z - w.curZ) > EPS) {
      walks.delete(obj);   // drag / keyboard / rebuild grabbed it - let go
      continue;
    }
    w.t = Math.min(w.t + dt / WALK_S, 1);
    const k = easeOutCubic(w.t);
    w.curX = w.fromX + (w.toX - w.fromX) * k;
    w.curZ = w.fromZ + (w.toZ - w.fromZ) * k;
    obj.position.x = w.curX;
    obj.position.z = w.curZ;
    advanced = true;
    if (w.t >= 1) walks.delete(obj);
  }
  if (advanced && onTick) { try { onTick(); } catch (e) { console.error(e); } }
}
