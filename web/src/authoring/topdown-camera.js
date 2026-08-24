// Top-down camera control. Shape tools (arrow, zone, text) render on the
// rink plane, so authoring uses an orthographic top-down view instead of
// the perspective walk camera. Entering a shape tool eases the active
// camera to top-down; exiting restores the perspective camera exactly
// where it was.

import { camera, topDownCamera, setActiveCamera } from '../scene.js';

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
  setActiveCamera(camera);
}

export function isTopDown() {
  return savedPerspective !== null;
}
