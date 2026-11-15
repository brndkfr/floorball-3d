// Camera views menu in the top bar and Shift+1..6 (A-BACK-040 step 4).
// Choosing a preset (camera-presets.js) blends the perspective camera to it
// over TWEEN_MS in the animate() loop (tickCameraTween, main.js), instantly
// when the user asked for reduced motion. A preset chosen in 2D switches to
// 3D first. "Stand" ends in applyDefaultView(), so the view counts as the
// default again and follows window resizes. A click or wheel on the stage
// stops a running blend where it is.
import { camera, renderer, defaultRig, applyDefaultView, setCameraLook } from '../scene.js';
import { state } from '../state.js';
import { PRESETS, presetPose, presetForKey, lerpPose, easeInOut } from '../camera-presets.js';
import { isTopDown, exitTopDown } from '../authoring/topdown-camera.js';
import { prefersReducedMotion } from '../reduced-motion.js';
import { markRenderDirty } from '../render-dirty.js';

const TWEEN_MS = 400;   // estimate

const button = document.querySelector('#appTopbar [data-action="camera-presets"]');
const menu = document.getElementById('cameraPresetMenu');
if (!button || !menu) throw new Error('camera-menu.js: Views button or #cameraPresetMenu missing from index.html');

menu.innerHTML = PRESETS.map((p) =>
  `<button type="button" role="menuitem" data-preset="${p.id}">${p.label}<kbd>Shift+${p.key}</kbd></button>`).join('')
  + '<hr><button type="button" role="menuitem" data-action="view-from-ball">From the ball</button>';

function selectedChip() {
  const g = state.selected;
  if (!g || !state.chipGroups.includes(g)) return null;
  return { x: g.position.x, z: g.position.z, angle: g.rotation.y };
}

// Same reading of the camera as scene.js getCameraRig().
function currentPose() {
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y - Math.PI, pitch: camera.rotation.x };
}

function applyPose(p) {
  camera.position.set(p.x, p.y, p.z);
  setCameraLook(p.yaw, p.pitch);
}

let tween = null;   // { from, to, elapsed, onDone }

export function goToPreset(id) {
  if (isTopDown()) exitTopDown();
  const to = presetPose(id, { fit: defaultRig(), chip: selectedChip() });
  if (!to) return false;
  blendCameraTo(to, id === 'stand' ? applyDefaultView : null);
  return true;
}

// Blend the perspective camera to `pose` (instantly with reduced motion),
// then call `onDone`. Also used by camera-focus.js (F, double-click).
export function blendCameraTo(pose, onDone = null) {
  if (prefersReducedMotion()) {
    tween = null;
    applyPose(pose);
    onDone?.();
  } else {
    tween = { from: currentPose(), to: pose, elapsed: 0, onDone };
  }
  markRenderDirty();
}

// Advances a running blend; true while one ran this frame (S-BACK-011).
export function tickCameraTween(dtMs) {
  if (!tween) return false;
  tween.elapsed += dtMs;
  const t = Math.min(tween.elapsed / TWEEN_MS, 1);
  applyPose(lerpPose(tween.from, tween.to, easeInOut(t)));
  if (t >= 1) {
    const done = tween.onDone;
    tween = null;
    done?.();
  }
  return true;
}

const stop = () => { tween = null; };
renderer.domElement.addEventListener('pointerdown', stop, true);
renderer.domElement.addEventListener('wheel', stop, { capture: true, passive: true });

// --- menu ---------------------------------------------------------------

function openMenu() {
  menu.querySelector('[data-preset="player"]').disabled = !selectedChip();
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  menu.querySelector('button:not(:disabled)')?.focus();
}

function closeMenu({ focusButton = false } = {}) {
  if (menu.hidden) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (focusButton) button.focus();
}

button.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));

menu.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  closeMenu();
  if (b.dataset.preset) goToPreset(b.dataset.preset);
  else if (b.dataset.action === 'view-from-ball') {
    if (isTopDown()) exitTopDown();
    document.getElementById('viewFromBallBtn').click();
  }
});

document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !e.target.closest?.('.shell-menu')) closeMenu();
});

// Capture phase: runs before the window-level Esc (cancel tool, deselect)
// and the timeline's number keys.
window.addEventListener('keydown', (e) => {
  if (!menu.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeMenu({ focusButton: true });
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
      return;
    }
  }
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
  const id = presetForKey(e);
  if (id && goToPreset(id)) {
    e.preventDefault();
    closeMenu();
  }
}, true);
