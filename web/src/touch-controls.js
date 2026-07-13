import { renderer, applyZoomDelta } from './scene.js';
import { keysPressed, cycleSelection } from './controls.js';
import { deselectAll } from './selection.js';

// On-screen controls for touch devices (see the `@media (pointer: coarse)`
// rule in index.html) - there's no keyboard on a phone/tablet, so WASD/
// arrows, Q/E and Tab/Escape all need an on-screen equivalent. The D-pad and
// rotate buttons just add/remove the same key strings handleKeyboardMovement
// already checks in keysPressed, so none of that logic needs duplicating.

function bindHold(buttonId, key) {
  const btn = document.getElementById(buttonId);
  const press = (event) => { event.preventDefault(); keysPressed.add(key); };
  const release = (event) => { event.preventDefault(); keysPressed.delete(key); };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release); // finger slides off the button without lifting
}

bindHold('tcUp', 'ArrowUp');
bindHold('tcDown', 'ArrowDown');
bindHold('tcLeft', 'ArrowLeft');
bindHold('tcRight', 'ArrowRight');
bindHold('tcRotL', 'q');
bindHold('tcRotR', 'e');

document.getElementById('tcCycle').addEventListener('click', () => cycleSelection(1));
document.getElementById('tcDeselect').addEventListener('click', () => deselectAll());

// --- pinch-to-zoom: two-finger gesture on the canvas, alongside the
// existing scroll-wheel zoom (both drive the same applyZoomDelta helper) ---
const PINCH_SENSITIVITY = 0.15; // degrees of FOV per mm of pinch-distance change
let pinchStartDist = null;

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

renderer.domElement.addEventListener('touchstart', (event) => {
  if (event.touches.length === 2) pinchStartDist = touchDistance(event.touches);
}, { passive: true });

renderer.domElement.addEventListener('touchmove', (event) => {
  if (event.touches.length !== 2 || pinchStartDist === null) return;
  event.preventDefault();
  const dist = touchDistance(event.touches);
  applyZoomDelta((pinchStartDist - dist) * PINCH_SENSITIVITY);
  pinchStartDist = dist;
}, { passive: false });

renderer.domElement.addEventListener('touchend', (event) => {
  if (event.touches.length < 2) pinchStartDist = null;
});
