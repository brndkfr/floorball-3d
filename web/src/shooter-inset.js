// Shooter's view inset (A-BACK-047, "Winkelband"): in Train, a small second
// view from just behind the ball toward the defending goal, in the stage's
// top-right corner. The same renderer draws it into that corner of the
// canvas right after the main frame (viewport + scissor), so there is no
// second WebGL context, it costs one extra render only when the scene is
// redrawn anyway (S-BACK-011), and screenshots include it (screenshot.js
// calls renderFrame). The frame and caption around it are HTML
// (#shooterInset). shooter-view.js holds the pure camera pose.

import * as THREE from 'three';
import { renderer, scene } from './scene.js';
import { state, getBallWorldCenter } from './state.js';
import { shooterViewPose, SHOOTER_INSET_STORAGE_KEY, parseShooterInsetShown, INSET_SIZE_STORAGE_KEY, parseInsetSize, clampInsetSize, resizeFromCorner } from './shooter-view.js';
import { t } from './lang-state.js';
import { markRenderDirty } from './render-dirty.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const frame = document.getElementById('shooterInset');
const view = frame?.querySelector('.inset-view');
if (!frame || !view) throw new Error('shooter-inset.js: #shooterInset .inset-view missing from index.html');

let stored = null;
try { stored = localStorage.getItem(SHOOTER_INSET_STORAGE_KEY); } catch { /* storage blocked: on */ }
state.shooterInsetShown = parseShooterInsetShown(stored);

export function setShooterInsetShown(on) {
  const v = !!on;
  try { localStorage.setItem(SHOOTER_INSET_STORAGE_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  if (v === state.shooterInsetShown) return;
  state.shooterInsetShown = v;
  window.dispatchEvent(new Event('shooterInsetChanged'));
  refresh();
  markRenderDirty();
}

// --- resizable card: a handle on the bottom-left corner (it hangs from the
// top-right), arrows on the handle in 20 px steps; size remembered.
const overlay = document.getElementById('trainPanel');
const handle = document.createElement('button');
handle.type = 'button';
handle.className = 'inset-resize';
handle.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M1 3l8 8M1 7l4 4"/></svg>';
frame.appendChild(handle);

let storedSize = null;
try { storedSize = localStorage.getItem(INSET_SIZE_STORAGE_KEY); } catch { /* storage blocked: default */ }
let size = parseInsetSize(storedSize);

function stageSize() {
  const r = overlay?.getBoundingClientRect();
  return r && r.width > 0 ? { w: r.width, h: r.height } : { w: window.innerWidth, h: window.innerHeight };
}
function applySize(next, { save = false } = {}) {
  size = clampInsetSize(next, stageSize());
  frame.style.width = `${size.w}px`;
  view.style.height = `${size.h}px`;
  if (save) { try { localStorage.setItem(INSET_SIZE_STORAGE_KEY, JSON.stringify(size)); } catch { /* storage blocked */ } }
  markRenderDirty();
}

let drag = null;
handle.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, start: { ...size } };
});
handle.addEventListener('pointermove', (e) => {
  if (drag) applySize(resizeFromCorner(drag.start, e.clientX - drag.x, e.clientY - drag.y));
});
const endDrag = () => { if (drag) { drag = null; applySize(size, { save: true }); } };
handle.addEventListener('pointerup', endDrag);
handle.addEventListener('pointercancel', endDrag);
handle.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: [20, 0], ArrowRight: [-20, 0], ArrowDown: [0, 20], ArrowUp: [0, -20] }[e.key];
  if (!step) return;
  e.preventDefault();
  e.stopPropagation();
  applySize({ w: size.w + step[0], h: size.h + step[1] }, { save: true });
});
window.addEventListener('resize', () => { if (!frame.hidden) applySize(size); });

const cam = new THREE.PerspectiveCamera(30, 300 / 170, 10, 200000);
export const insetCamera = () => cam;

// The card's box on screen while it shows, else null (labels avoid it).
export const insetRect = () => (frame.hidden ? null : frame.getBoundingClientRect());

const wanted = () => document.body.dataset.mode === 'train' && state.shooterInsetShown && !!state.kataReadout && !state.quiet;   // a quiet lesson frame hides it (A-BACK-049)

function refresh() {
  const wasHidden = frame.hidden;
  frame.hidden = !wanted();
  if (wasHidden && !frame.hidden) applySize(size);   // clamp to the stage now that it has a size
  const label = t('goalie.inset.resize');
  handle.setAttribute('aria-label', label);
  handle.title = label;
  frame.querySelector('.inset-title').textContent = t('goalie.inset.title');
  const pct = state.kataReadout?.pct;
  frame.querySelector('.inset-pct').textContent = pct == null ? '' : `${Math.round(pct)}%`;
}
for (const ev of ['kataReadoutChanged', 'langChanged', 'shell:mode', 'quietChanged']) window.addEventListener(ev, () => { refresh(); markRenderDirty(); });
refresh();

const savedViewport = new THREE.Vector4();
const savedClear = new THREE.Color();
const INSET_BG = 0x1f3c74;   // hall slate behind the goal, a little bluer so the inset reads as its own view

function renderInset() {
  if (frame.hidden || !wanted()) return;
  const r = view.getBoundingClientRect();
  const c = renderer.domElement.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  // Viewport / scissor in CSS px from the canvas's bottom-left corner.
  renderInsetAt(r.left - c.left, c.bottom - r.bottom, r.width, r.height);
}

// Draw the shooter's view into the canvas rectangle (x, y from the
// bottom-left, renderer units). Train calls it for the card, export.js for
// lesson videos. It looks from the ball the KATA card grades against, so
// during a lesson shot it stays at the release point (kataBall) instead of
// riding into the net. False when there is nothing to show.
export function renderInsetAt(x, y, w, h) {
  const inputs = state.kataReadout?.inputs;
  const ball = inputs?.ball ?? getBallWorldCenter();
  const gc = inputs?.goalCenter;
  if (!ball || !gc || w < 2 || h < 2) return false;
  const pose = shooterViewPose({ x: ball.x, z: ball.z }, gc, w / h);
  cam.position.set(pose.x, pose.y, pose.z);
  cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
  cam.fov = pose.fovDeg;
  cam.aspect = w / h;
  cam.updateProjectionMatrix();

  renderer.getViewport(savedViewport);
  renderer.getClearColor(savedClear);
  const savedAlpha = renderer.getClearAlpha();
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.setScissorTest(true);
  renderer.setClearColor(INSET_BG, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, cam);
  renderer.setScissorTest(false);
  renderer.setViewport(savedViewport);
  renderer.setClearColor(savedClear, savedAlpha);
  return true;
}

// The main frame plus the inset. main.js calls this when it renders, and
// screenshot.js before it copies the canvas (same task).
export function renderFrame() {
  renderer.render(scene, state.activeCamera);
  renderInset();
}
