// Persistence + carrier logic for the ball and goalie (the "actors" that
// live outside the doc's players/shapes lists). Runs each rAF via
// tickActors() in main.js.
//
// Schema written to `frame.scheme`:
//   scheme.balls.main = { x, z, carrier: chipId | null }
//   scheme.goalie     = { x, z, angle }
//
// Ball carrier: when non-null, the ball snaps to the carrier chip's
// position each tick (plus a small forward offset so it reads as "in
// front of the player"). The user can hand off the ball via the Inspector
// dropdown when the ball is selected, or by right-clicking a chip while
// the ball is the current selection (see selection.js).
//
// Goalie has no carrier concept; rotation.y persists as `angle`.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { ensureDoc } from './doc.js';
import { saveDoc } from './storage.js';
import { CHIP_RADIUS, CHIP_DISPLAY_SCALE } from './chips.js';
import { BALL_CARRY_OFFSET, passFlightPos, DEFAULT_RELEASE_T, DEFAULT_PASS_SPEED_MPS, MIN_PASS_SPEED_MPS, MAX_PASS_SPEED_MPS, makeShot, clampAim, shotTargetFrame, DEFAULT_SHOT_SPEED_MPS } from './ball-pose.js';
import { prefersReducedMotion } from '../reduced-motion.js';
// Cycles (choreograph/frames import actors) are fine: only called at runtime, never at module init.
import { isChoreoActive, getChoreoStartCarrier, commitChoreo } from './choreograph.js';
import { duplicateFrame } from './frames.js';
import { placeMatchBall, swapWithMatchBall } from './ball-tool.js';
import { rebuildBallsFromDoc } from './balls.js';

const CARRIER_RING_COLOR = 0xffb347;

let flight = null;   // { from, startMs } while an edit-mode pass is animating

let lastBall = { x: NaN, z: NaN, carrier: undefined, color: undefined };
let lastGoalie = { x: NaN, z: NaN, angle: NaN };
// Ball + goalie OBJs load async - the first time we see them we must
// APPLY the persisted scheme values instead of the mesh's default OBJ
// position, or those defaults would overwrite the user's saved layout.
let ballApplied = false;
let goalieApplied = false;
// Ball material tint: OBJ+MTL loader gives every mesh in state.ballGroup
// its own Material with a default colour. First time we see the mesh we
// clone each material so tinting one ball doesn't leak into shared MTL
// state, then cache each mesh's original colour so a null tint restores
// the loader default.
let ballMaterialCache = null;   // Array<{ material, defaultColor: THREE.Color }>

function ensureBallMaterialCache() {
  if (ballMaterialCache || !state.ballGroup) return;
  ballMaterialCache = [];
  state.ballGroup.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const wrap = (m) => {
      const cloned = m.clone();
      const defaultColor = cloned.color ? cloned.color.clone() : new THREE.Color(0xffffff);
      ballMaterialCache.push({ material: cloned, defaultColor });
      return cloned;
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(wrap);
    } else {
      child.material = wrap(child.material);
    }
  });
}

function applyBallColor(hex) {
  if (!ballMaterialCache) return;
  for (const { material, defaultColor } of ballMaterialCache) {
    if (!material.color) continue;
    if (hex) material.color.set(hex);
    else material.color.copy(defaultColor);
  }
}

const carrierRing = new THREE.Mesh(
  new THREE.RingGeometry(CHIP_RADIUS * CHIP_DISPLAY_SCALE * 1.15, CHIP_RADIUS * CHIP_DISPLAY_SCALE * 1.35, 48),
  new THREE.MeshBasicMaterial({ color: CARRIER_RING_COLOR, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
);
carrierRing.rotation.x = -Math.PI / 2;
carrierRing.renderOrder = 2;
carrierRing.visible = false;
scene.add(carrierRing);

export function tickActors() {
  const doc = ensureDoc();
  if (state.playback?.playing) {
    carrierRing.visible = false;   // playback moves chips; the ring would sit at the edit-time spot
    return false;
  }

  const scheme = doc.scheme;
  if (!scheme.balls) scheme.balls = {};

  const carrierId = scheme.balls.main?.carrier ?? null;
  const carrierChip = carrierId
    ? state.chipGroups.find((g) => g.userData.chip?.id === carrierId)
    : null;

  // A user hand-off (not a frame switch / undo, which reset lastBall.carrier) gets a visible flight.
  if (state.ballGroup && carrierChip && lastBall.carrier !== undefined && carrierId !== lastBall.carrier && !prefersReducedMotion()) {
    flight = { from: { x: state.ballGroup.position.x, z: state.ballGroup.position.z }, startMs: performance.now() };
  }
  if (!carrierChip) flight = null;

  // Ball carrier tracking: overrides mesh position while attached.
  if (carrierChip && state.ballGroup) {
    const to = { x: carrierChip.position.x + BALL_CARRY_OFFSET.x, z: carrierChip.position.z + BALL_CARRY_OFFSET.z };
    let pos = to;
    if (flight) {
      const f = passFlightPos(flight.from, to, (performance.now() - flight.startMs) / 1000);
      pos = f.pos;
      if (f.done) flight = null;
    }
    state.ballGroup.position.x = pos.x;
    state.ballGroup.position.z = pos.z;
  }

  // Orange carrier ring on the carrier chip (visual "who has the ball").
  if (carrierChip) {
    carrierRing.position.set(carrierChip.position.x, 4, carrierChip.position.z);
    carrierRing.visible = true;
  } else {
    carrierRing.visible = false;
  }

  let dirty = false;

  if (state.ballGroup) {
    ensureBallMaterialCache();
    if (!ballApplied) {
      // First tick after the ball OBJ loaded: replay the stored position + colour.
      const stored = scheme.balls.main;
      if (stored && stored.carrier == null) {
        state.ballGroup.position.x = stored.x;
        state.ballGroup.position.z = stored.z;
      }
      applyBallColor(stored?.color || null);
      lastBall.color = stored?.color || null;
      ballApplied = true;
    }
    const bx = state.ballGroup.position.x;
    const bz = state.ballGroup.position.z;
    const storedColor = scheme.balls.main?.color || null;
    if (bx !== lastBall.x || bz !== lastBall.z || carrierId !== lastBall.carrier || storedColor !== lastBall.color) {
      if (!scheme.balls.main) scheme.balls.main = { x: bx, z: bz, carrier: carrierId };
      // While attached, ball position is derived from the carrier each
      // tick, so don't overwrite the last-loose-position in the scheme -
      // it becomes the ball's location when the carrier clears.
      if (carrierId == null) {
        scheme.balls.main.x = bx;
        scheme.balls.main.z = bz;
      }
      scheme.balls.main.carrier = carrierId;
      if (storedColor !== lastBall.color) applyBallColor(storedColor);
      lastBall = { x: bx, z: bz, carrier: carrierId, color: storedColor };
      dirty = true;
    }
  }

  if (state.goalieGroup) {
    if (!goalieApplied) {
      const stored = scheme.goalie;
      if (stored) {
        state.goalieGroup.position.x = stored.x;
        state.goalieGroup.position.z = stored.z;
        state.goalieGroup.rotation.y = stored.angle || 0;
      }
      goalieApplied = true;
    }
    const gx = state.goalieGroup.position.x;
    const gz = state.goalieGroup.position.z;
    const ga = state.goalieGroup.rotation.y;
    if (gx !== lastGoalie.x || gz !== lastGoalie.z || ga !== lastGoalie.angle) {
      scheme.goalie = { x: gx, z: gz, angle: ga };
      lastGoalie = { x: gx, z: gz, angle: ga };
      dirty = true;
    }
  }

  if (dirty) saveDoc();
  return flight !== null;
}

// Snap ball + goalie meshes to the current frame's scheme. Called after
// rebuildFromDoc (frame switches, undo/redo).
export function applyActorsFromScheme() {
  if (state.ballGroup) state.ballGroup.position.y = 0;   // a shot in playback lifts the ball
  const doc = ensureDoc();
  const scheme = doc.scheme;
  if (state.ballGroup && scheme.balls?.main) {
    const b = scheme.balls.main;
    if (b.carrier == null) {
      state.ballGroup.position.x = b.x;
      state.ballGroup.position.z = b.z;
    }
    ensureBallMaterialCache();
    applyBallColor(b.color || null);
    // If carrier is set, the next tickActors() call snaps the ball to it.
  }
  if (state.goalieGroup && scheme.goalie) {
    state.goalieGroup.position.x = scheme.goalie.x;
    state.goalieGroup.position.z = scheme.goalie.z;
    state.goalieGroup.rotation.y = scheme.goalie.angle || 0;
  }
  // Invalidate the last-synced cache so tickActors doesn't skip a
  // legitimate write of the values it just applied.
  lastBall = { x: NaN, z: NaN, carrier: undefined, color: undefined };
  lastGoalie = { x: NaN, z: NaN, angle: NaN };
  ballApplied = true;
  goalieApplied = true;
}

export function getBallCarrier() {
  const doc = ensureDoc();
  return doc.scheme.balls?.main?.carrier ?? null;
}

export function setBallCarrier(chipId) {
  const doc = ensureDoc();
  const scheme = doc.scheme;
  if (!scheme.balls) scheme.balls = {};
  if (!scheme.balls.main) {
    const bx = state.ballGroup?.position.x ?? 0;
    const bz = state.ballGroup?.position.z ?? 0;
    scheme.balls.main = { x: bx, z: bz, carrier: null };
  }
  scheme.balls.main.carrier = chipId ?? null;
  delete scheme.balls.main.pass;   // a new hand-off starts from the default timing
  delete scheme.balls.main.shot;
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('ballCarrierChanged'));
}

// Shot by the current carrier at goal 'A' | 'B' (A-BACK-022). Goes into the Choreo draft when it
// has no pass yet, else into a new frame after the current one. Returns false without a carrier.
export function shootAt(goal) {
  const shooter = ensureDoc().scheme.balls?.main?.carrier;
  if (!shooter) return false;
  const choreoActive = isChoreoActive();
  const where = shotTargetFrame({ choreoActive, draftCarrierChanged: choreoActive && getChoreoStartCarrier() !== shooter });
  if (where === 'new') {
    if (choreoActive) commitChoreo();
    const k = ensureDoc().currentFrame;
    duplicateFrame(k, k + 1);
  }
  const { shot, rest } = makeShot(goal);
  const main = ensureDoc().scheme.balls.main;
  Object.assign(main, { carrier: null, x: rest.x, z: rest.z, shot });
  delete main.pass;
  applyActorsFromScheme();
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('ballCarrierChanged'));
  window.dispatchEvent(new Event('shotChanged'));
  return true;
}

export function setShotAim(aim, { history = true } = {}) {
  const main = ensureDoc().scheme.balls?.main;
  if (!main?.shot) return;
  const { aimX, aimY } = clampAim({ ...main.shot, ...aim });
  main.shot = { ...main.shot, aimX, aimY };
  main.x = aimX;   // the ball rests behind the aim point
  applyActorsFromScheme();
  saveDoc();
  if (history) import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new CustomEvent('passChanged', { detail: { aim: true } }));
}

// Timing of the pass arriving in the current frame (A-BACK-021). Only non-default values are stored.
export function setPassTiming({ releaseT, speedMps } = {}, { history = true } = {}) {
  const main = ensureDoc().scheme.balls?.main;
  if (!main) return;
  const pass = { ...(main.pass || {}) };
  if (releaseT !== undefined) pass.releaseT = Math.min(Math.max(releaseT, 0), 1);
  if (speedMps !== undefined) pass.speedMps = Math.min(Math.max(speedMps, MIN_PASS_SPEED_MPS), MAX_PASS_SPEED_MPS);
  if (pass.releaseT === DEFAULT_RELEASE_T) delete pass.releaseT;
  if (pass.speedMps === (main.shot ? DEFAULT_SHOT_SPEED_MPS : DEFAULT_PASS_SPEED_MPS)) delete pass.speedMps;
  if (Object.keys(pass).length) main.pass = pass; else delete main.pass;
  saveDoc();
  if (history) import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new CustomEvent('passChanged', { detail: { releaseT: releaseT !== undefined } }));
}

// Ball tool (A-BACK-026): drop the match ball loose at (x, z) in the current frame.
export function placeMainBall({ x, z }) {
  placeMatchBall(ensureDoc().scheme, { x, z });
  flight = null;
  if (state.ballGroup) state.ballGroup.position.set(x, 0, z);
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('ballCarrierChanged'));
}

// Extra ball `id` becomes the match ball; the two trade position and colour.
export function promoteExtraBall(id) {
  const shown = state.ballGroup ? { x: state.ballGroup.position.x, z: state.ballGroup.position.z } : { x: 0, z: 0 };
  if (!swapWithMatchBall(ensureDoc().scheme, id, shown)) return false;
  flight = null;
  rebuildBallsFromDoc();
  applyActorsFromScheme();
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('ballCarrierChanged'));
  return true;
}

export function getBallColor() {
  const doc = ensureDoc();
  return doc.scheme.balls?.main?.color ?? null;
}

export function setBallColor(hex) {
  const doc = ensureDoc();
  const scheme = doc.scheme;
  if (!scheme.balls) scheme.balls = {};
  if (!scheme.balls.main) {
    const bx = state.ballGroup?.position.x ?? 0;
    const bz = state.ballGroup?.position.z ?? 0;
    scheme.balls.main = { x: bx, z: bz, carrier: null };
  }
  if (hex) scheme.balls.main.color = hex;
  else delete scheme.balls.main.color;
  applyBallColor(hex || null);
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('ballColorChanged'));
}
