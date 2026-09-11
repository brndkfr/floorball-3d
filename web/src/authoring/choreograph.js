// Choreograph mode (A-BACK-006): a modal "plan the next frame" overlay.
//
// Enter: duplicates the current frame -> creates draft frame N+1, switches
// to it, snapshots every chip's position, and renders per-chip ghost
// footprints at those snapshots + live arrows to each chip's current
// position. The user edits chips as normal (drag / right-click move /
// walk-tween); the arrows track their current position each rAF.
//
// Commit: dispose ghosts + arrows, keep the new frame.
// Cancel: dispose ghosts + arrows, delete the draft frame (returns to N).
//
// History: enter/cancel each push one history entry (via duplicateFrame /
// deleteFrame). Intermediate chip edits push their own entries as usual,
// so undo/redo works incrementally.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { CHIP_RADIUS, CHIP_DISPLAY_SCALE } from './chips.js';
import { duplicateFrame, deleteFrame, selectFrame, getCurrentIndex } from './frames.js';

const GHOST_COLOR = 0x4fe0ff;
const ARROW_COLOR = 0x4fe0ff;
const GHOST_Y = 8;

let active = false;
let originalFrameIdx = -1;
let draftFrameIdx = -1;
const snapshots = new Map();       // chipId -> {x, z}
const ghosts = new Map();          // chipId -> THREE.Mesh (ring)
const arrows = new Map();          // chipId -> THREE.Line (2-vertex, auto-updated)

let banner = null;
let bannerTitle = null;

export function isChoreoActive() { return active; }

function fireChanged() {
  window.dispatchEvent(new Event('choreoChanged'));
}

export function startChoreo() {
  if (active) return;
  if (state.playback?.playing) return;
  originalFrameIdx = getCurrentIndex();
  draftFrameIdx = duplicateFrame(originalFrameIdx, originalFrameIdx + 1);
  if (draftFrameIdx < 0) { originalFrameIdx = -1; return; }
  active = true;
  snapshotChips();
  buildGhosts();
  showBanner();
  fireChanged();
}

export function commitChoreo() {
  if (!active) return;
  disposeGhosts();
  hideBanner();
  active = false;
  originalFrameIdx = -1;
  draftFrameIdx = -1;
  fireChanged();
}

export function cancelChoreo() {
  if (!active) return;
  disposeGhosts();
  hideBanner();
  // Return to the original frame first, then delete the draft. Deleting a
  // higher index than currentFrame doesn't shift currentFrame.
  if (originalFrameIdx >= 0) selectFrame(originalFrameIdx);
  if (draftFrameIdx >= 0) deleteFrame(draftFrameIdx);
  active = false;
  originalFrameIdx = -1;
  draftFrameIdx = -1;
  fireChanged();
}

// Called from main.js's animate() every frame. Cheap enough to run
// unconditionally; the early-out short-circuits when inactive.
export function tickChoreo() {
  if (!active) return;
  for (const group of state.chipGroups) {
    const id = group.userData.chip?.id;
    const arrow = arrows.get(id);
    if (!arrow) continue;
    const snap = snapshots.get(id);
    if (!snap) continue;
    const pos = arrow.geometry.attributes.position;
    pos.array[0] = snap.x; pos.array[1] = GHOST_Y; pos.array[2] = snap.z;
    pos.array[3] = group.position.x; pos.array[4] = GHOST_Y; pos.array[5] = group.position.z;
    pos.needsUpdate = true;
    // Hide the arrow when the chip hasn't been moved yet.
    const dx = group.position.x - snap.x, dz = group.position.z - snap.z;
    arrow.visible = (dx * dx + dz * dz) > 100 * 100;
  }
}

function snapshotChips() {
  snapshots.clear();
  for (const group of state.chipGroups) {
    const id = group.userData.chip?.id;
    if (!id) continue;
    snapshots.set(id, { x: group.position.x, z: group.position.z });
  }
}

function buildGhosts() {
  const ringInner = CHIP_RADIUS * CHIP_DISPLAY_SCALE * 0.85;
  const ringOuter = CHIP_RADIUS * CHIP_DISPLAY_SCALE * 1.05;
  for (const [id, snap] of snapshots) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ringInner, ringOuter, 40),
      new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(snap.x, GHOST_Y, snap.z);
    scene.add(ring);
    ghosts.set(id, ring);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: ARROW_COLOR, transparent: true, opacity: 0.85, depthWrite: false }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    arrows.set(id, line);
  }
}

function disposeGhosts() {
  for (const m of ghosts.values()) {
    scene.remove(m);
    m.geometry?.dispose?.();
    m.material?.dispose?.();
  }
  for (const l of arrows.values()) {
    scene.remove(l);
    l.geometry?.dispose?.();
    l.material?.dispose?.();
  }
  ghosts.clear();
  arrows.clear();
  snapshots.clear();
}

function showBanner() {
  if (!banner) buildBanner();
  const doc = state.doc;
  const total = doc?.frames?.length ?? 0;
  bannerTitle.textContent = `Choreographing frame ${draftFrameIdx + 1} of ${total}`;
  banner.style.display = 'flex';
}

function hideBanner() {
  if (banner) banner.style.display = 'none';
}

function buildBanner() {
  banner = document.createElement('div');
  banner.id = 'choreoBanner';
  banner.style.cssText = [
    'position:fixed', 'top:52px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:22', 'display:none', 'align-items:center', 'gap:12px',
    'padding:8px 14px',
    'background:rgba(20,16,10,0.94)', 'color:#f7e6cf',
    'border:1px solid rgba(255,179,71,0.55)', 'border-radius:10px',
    'box-shadow:0 6px 20px rgba(0,0,0,0.45)',
    'font-family:Consolas,monospace', 'font-size:12px', 'letter-spacing:0.04em',
  ].join(';');
  bannerTitle = document.createElement('span');
  banner.appendChild(bannerTitle);
  const commit = document.createElement('button');
  commit.textContent = 'Commit';
  commit.style.cssText = 'padding:4px 12px; border-radius:5px; cursor:pointer; border:1px solid rgba(126,224,107,0.6); background:rgba(126,224,107,0.15); color:#dff9c8; font-family:inherit; font-size:11px; text-transform:uppercase;';
  commit.addEventListener('click', commitChoreo);
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'padding:4px 12px; border-radius:5px; cursor:pointer; border:1px solid rgba(255,120,120,0.55); background:rgba(255,120,120,0.12); color:#ffcccc; font-family:inherit; font-size:11px; text-transform:uppercase;';
  cancel.addEventListener('click', cancelChoreo);
  banner.appendChild(commit);
  banner.appendChild(cancel);
  document.body.appendChild(banner);
}
