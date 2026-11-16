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
import { shooterViewPose, SHOOTER_INSET_STORAGE_KEY, parseShooterInsetShown } from './shooter-view.js';
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

const cam = new THREE.PerspectiveCamera(30, 300 / 170, 10, 200000);
export const insetCamera = () => cam;

const wanted = () => document.body.dataset.mode === 'train' && state.shooterInsetShown && !!state.kataReadout;

function refresh() {
  frame.hidden = !wanted();
  frame.querySelector('.inset-title').textContent = t('goalie.inset.title');
  const pct = state.kataReadout?.pct;
  frame.querySelector('.inset-pct').textContent = pct == null ? '' : `${Math.round(pct)}%`;
}
for (const ev of ['kataReadoutChanged', 'langChanged', 'shell:mode']) window.addEventListener(ev, () => { refresh(); markRenderDirty(); });
refresh();

const savedViewport = new THREE.Vector4();
const savedClear = new THREE.Color();
const INSET_BG = 0x1f3c74;   // hall slate behind the goal, a little bluer so the inset reads as its own view

function renderInset() {
  if (frame.hidden || !wanted()) return;
  const r = view.getBoundingClientRect();
  const c = renderer.domElement.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const ball = getBallWorldCenter();
  const gc = state.kataReadout.inputs?.goalCenter;
  if (!ball || !gc) return;
  const pose = shooterViewPose({ x: ball.x, z: ball.z }, gc, r.width / r.height);
  cam.position.set(pose.x, pose.y, pose.z);
  cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
  cam.fov = pose.fovDeg;
  cam.aspect = r.width / r.height;
  cam.updateProjectionMatrix();

  // Viewport / scissor in CSS px from the canvas's bottom-left corner.
  const x = r.left - c.left, y = c.bottom - r.bottom;
  renderer.getViewport(savedViewport);
  renderer.getClearColor(savedClear);
  const savedAlpha = renderer.getClearAlpha();
  renderer.setViewport(x, y, r.width, r.height);
  renderer.setScissor(x, y, r.width, r.height);
  renderer.setScissorTest(true);
  renderer.setClearColor(INSET_BG, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, cam);
  renderer.setScissorTest(false);
  renderer.setViewport(savedViewport);
  renderer.setClearColor(savedClear, savedAlpha);
}

// The main frame plus the inset. main.js calls this when it renders, and
// screenshot.js before it copies the canvas (same task).
export function renderFrame() {
  renderer.render(scene, state.activeCamera);
  renderInset();
}
