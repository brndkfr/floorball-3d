// Top-down camera control. Shape / chip tools render on the rink plane,
// so authoring uses an orthographic top-down view instead of the
// perspective walk camera. Entering a tool eases the active camera to
// top-down; exiting restores the perspective camera exactly where it was.
//
// Wheel-zoom scales topDownCamera.zoom; middle-mouse or right-drag pans by
// shifting the camera's x/z. Both reset when you exit the tool.

import { camera, topDownCamera, setActiveCamera } from '../scene.js';

const MIN_ZOOM = 0.5, MAX_ZOOM = 8;
const savedTopDown = {
  zoom: topDownCamera.zoom,
  x: topDownCamera.position.x,
  z: topDownCamera.position.z,
};

let savedPerspective = null;

export function enterTopDown() {
  if (savedPerspective) return;   // already in top-down
  savedPerspective = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
  };
  setActiveCamera(topDownCamera);
}

export function exitTopDown() {
  if (!savedPerspective) return;
  camera.position.copy(savedPerspective.position);
  camera.quaternion.copy(savedPerspective.quaternion);
  camera.fov = savedPerspective.fov;
  camera.updateProjectionMatrix();
  savedPerspective = null;
  // Reset top-down transform so re-entering the tool starts fitted again.
  topDownCamera.zoom = savedTopDown.zoom;
  topDownCamera.position.x = savedTopDown.x;
  topDownCamera.position.z = savedTopDown.z;
  topDownCamera.updateProjectionMatrix();
  setActiveCamera(camera);
}

export function isTopDown() {
  return savedPerspective !== null;
}

// --- wheel zoom + drag pan (only active while in top-down mode) -------

window.addEventListener('wheel', (e) => {
  if (!isTopDown()) return;
  // Don't hijack wheel events over UI (dock, timeline, HUD panels).
  if (e.target && e.target !== document.body && e.target.closest?.('#dock, #timeline, #dockOverflow, #dockPalette, #dockSlots, #info, #coords')) return;
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
  if (e.target && e.target.closest?.('#dock, #timeline, #dockOverflow, #dockPalette, #dockSlots, #info, #coords')) return;
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
