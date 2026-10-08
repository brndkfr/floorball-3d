// Top-down camera control. Shape / chip tools render on the rink plane,
// so authoring uses an orthographic top-down view instead of the
// perspective walk camera. Entering a tool eases the active camera to
// top-down; exiting restores the perspective camera exactly where it was.
//
// Wheel-zoom scales topDownCamera.zoom; middle-mouse or right-drag pans by
// shifting the camera's x/z. Both reset when you exit the tool.

import { camera, topDownCamera, setActiveCamera, scene, setFlatLighting } from '../scene.js';
import { state } from '../state.js';

const MIN_ZOOM = 0.5, MAX_ZOOM = 8;
// Ball is a real-size 72 mm sphere; at rink scale it reads as a dot from
// top-down. Scale up its mesh only while in top-down so it's easy to see
// and pick, without changing the 3D walk view. The underlying position
// and BALL_RADIUS used by coverage/trajectory math are unaffected.
const BALL_TOPDOWN_SCALE = 5;
export { BALL_TOPDOWN_SCALE };
const savedTopDown = {
  zoom: topDownCamera.zoom,
  x: topDownCamera.position.x,
  z: topDownCamera.position.z,
};

let savedPerspective = null;
let savedFog = null;   // scene.fog is dimming the ortho view; disable while top-down
let savedBallScale = null;

export function enterTopDown() {
  if (savedPerspective) return;   // already in top-down
  savedPerspective = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
  };
  savedFog = scene.fog;
  scene.fog = null;
  setFlatLighting(true);
  document.body.classList.add('topdown-mode');
  applyBallTopDownScale(true);
  setActiveCamera(topDownCamera);
  // The top bar's 2D / 3D control (web/src/ui/topbar.js) follows this.
  window.dispatchEvent(new Event('viewModeChanged'));
}

export function exitTopDown() {
  if (!savedPerspective) return;
  camera.position.copy(savedPerspective.position);
  camera.quaternion.copy(savedPerspective.quaternion);
  camera.fov = savedPerspective.fov;
  camera.updateProjectionMatrix();
  savedPerspective = null;
  scene.fog = savedFog;
  savedFog = null;
  setFlatLighting(false);
  document.body.classList.remove('topdown-mode');
  applyBallTopDownScale(false);
  // Reset top-down transform so re-entering the tool starts fitted again.
  topDownCamera.zoom = savedTopDown.zoom;
  topDownCamera.position.x = savedTopDown.x;
  topDownCamera.position.z = savedTopDown.z;
  topDownCamera.updateProjectionMatrix();
  setActiveCamera(camera);
  window.dispatchEvent(new Event('viewModeChanged'));
}

// state.ballGroup may be null at first enterTopDown() call (OBJ loads
// async); re-apply on every enter/exit so a late load still gets scaled.
// Extra balls (state.extraBalls) get the same treatment - authored at
// real 72mm size so they look correct in 3D, upscaled 5x in 2D to stay
// clickable and read from a full top-down view.
function applyBallTopDownScale(on) {
  const ball = state.ballGroup;
  if (ball) {
    if (on) {
      if (savedBallScale == null) savedBallScale = ball.scale.x;
      ball.scale.setScalar(BALL_TOPDOWN_SCALE);
    } else if (savedBallScale != null) {
      ball.scale.setScalar(savedBallScale);
      savedBallScale = null;
    }
  }
  for (const m of state.extraBalls || []) {
    m.scale.setScalar(on ? BALL_TOPDOWN_SCALE : 1);
  }
}

export function isTopDown() {
  return savedPerspective !== null;
}

// Reset zoom + pan back to the fitted default without leaving top-down.
// Bound to the F key in controls.js (A-GAP-001).
export function resetTopDownView() {
  if (!isTopDown()) return;
  topDownCamera.zoom = savedTopDown.zoom;
  topDownCamera.position.x = savedTopDown.x;
  topDownCamera.position.z = savedTopDown.z;
  topDownCamera.updateProjectionMatrix();
}

// --- wheel zoom + drag pan (only active while in top-down mode) -------

window.addEventListener('wheel', (e) => {
  if (!isTopDown()) return;
  // Don't hijack wheel events over UI (dock, timeline, HUD panels).
  if (e.target && e.target !== document.body && e.target.closest?.('#dock, #timeline, #dockOverflow, #dockPalette, #rightPanel')) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  topDownCamera.zoom = Math.min(Math.max(topDownCamera.zoom * factor, MIN_ZOOM), MAX_ZOOM);
  topDownCamera.updateProjectionMatrix();
}, { passive: false });

let panning = false;
let lastX = 0, lastY = 0;
window.addEventListener('pointerdown', (e) => {
  if (!isTopDown()) return;
  if (e.button !== 1 && e.button !== 2) return;
  if (e.target && e.target.closest?.('#dock, #timeline, #dockOverflow, #dockPalette, #rightPanel')) return;
  panning = true;
  lastX = e.clientX;
  lastY = e.clientY;
  e.preventDefault();
});
window.addEventListener('pointermove', (e) => {
  if (!panning) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  // Convert screen-pixel delta to world-mm delta using the ortho frustum
  // and the current zoom. up=(0,0,-1) so screen-down (+dy) is world -z.
  const worldPerPxX = (topDownCamera.right - topDownCamera.left) / (window.innerWidth * topDownCamera.zoom);
  const worldPerPxY = (topDownCamera.top - topDownCamera.bottom) / (window.innerHeight * topDownCamera.zoom);
  topDownCamera.position.x -= dx * worldPerPxX;
  topDownCamera.position.z += dy * worldPerPxY;
});
window.addEventListener('pointerup', () => { panning = false; });
window.addEventListener('contextmenu', (e) => { if (isTopDown()) e.preventDefault(); });
