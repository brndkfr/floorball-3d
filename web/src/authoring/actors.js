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

const BALL_CARRY_OFFSET = { x: 0, z: 250 };
const CARRIER_RING_COLOR = 0xffb347;

let lastBall = { x: NaN, z: NaN, carrier: undefined };
let lastGoalie = { x: NaN, z: NaN, angle: NaN };
// Ball + goalie OBJs load async - the first time we see them we must
// APPLY the persisted scheme values instead of the mesh's default OBJ
// position, or those defaults would overwrite the user's saved layout.
let ballApplied = false;
let goalieApplied = false;

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
  if (state.playback?.playing) return;

  const scheme = doc.scheme;
  if (!scheme.balls) scheme.balls = {};

  const carrierId = scheme.balls.main?.carrier ?? null;
  const carrierChip = carrierId
    ? state.chipGroups.find((g) => g.userData.chip?.id === carrierId)
    : null;

  // Ball carrier tracking: overrides mesh position while attached.
  if (carrierChip && state.ballGroup) {
    state.ballGroup.position.x = carrierChip.position.x + BALL_CARRY_OFFSET.x;
    state.ballGroup.position.z = carrierChip.position.z + BALL_CARRY_OFFSET.z;
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
    if (!ballApplied) {
      // First tick after the ball OBJ loaded: replay the stored position.
      const stored = scheme.balls.main;
      if (stored && stored.carrier == null) {
        state.ballGroup.position.x = stored.x;
        state.ballGroup.position.z = stored.z;
      }
      ballApplied = true;
    }
    const bx = state.ballGroup.position.x;
    const bz = state.ballGroup.position.z;
    if (bx !== lastBall.x || bz !== lastBall.z || carrierId !== lastBall.carrier) {
      if (!scheme.balls.main) scheme.balls.main = { x: bx, z: bz, carrier: carrierId };
      // While attached, ball position is derived from the carrier each
      // tick, so don't overwrite the last-loose-position in the scheme -
      // it becomes the ball's location when the carrier clears.
      if (carrierId == null) {
        scheme.balls.main.x = bx;
        scheme.balls.main.z = bz;
      }
      scheme.balls.main.carrier = carrierId;
      lastBall = { x: bx, z: bz, carrier: carrierId };
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
}

// Snap ball + goalie meshes to the current frame's scheme. Called after
// rebuildFromDoc (frame switches, undo/redo).
export function applyActorsFromScheme() {
  const doc = ensureDoc();
  const scheme = doc.scheme;
  if (state.ballGroup && scheme.balls?.main) {
    const b = scheme.balls.main;
    if (b.carrier == null) {
      state.ballGroup.position.x = b.x;
      state.ballGroup.position.z = b.z;
    }
    // If carrier is set, the next tickActors() call snaps the ball to it.
  }
  if (state.goalieGroup && scheme.goalie) {
    state.goalieGroup.position.x = scheme.goalie.x;
    state.goalieGroup.position.z = scheme.goalie.z;
    state.goalieGroup.rotation.y = scheme.goalie.angle || 0;
  }
  // Invalidate the last-synced cache so tickActors doesn't skip a
  // legitimate write of the values it just applied.
  lastBall = { x: NaN, z: NaN, carrier: undefined };
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
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  window.dispatchEvent(new Event('ballCarrierChanged'));
}
