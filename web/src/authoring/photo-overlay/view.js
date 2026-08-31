// Photo-lock camera mode: while checking alignment against an uploaded
// photo, the perspective camera is swapped for `photoCamera` (solved by
// pnp.js) - mirrors authoring/topdown-camera.js's enter/exit pattern.
import { camera, photoCamera, setActiveCamera, scene, renderer } from '../../scene.js';

let savedPerspective = null;
let savedFog = null;
let savedBackground = null;

export function isPhoto() {
  return !!savedPerspective;
}

export function enterPhoto() {
  if (savedPerspective) return; // already locked to photo
  savedPerspective = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
  };
  savedFog = scene.fog;
  scene.fog = null;
  // scene.background is opaque, so without clearing it the renderer paints
  // every empty-space pixel solid - CSS opacity then blends THAT flat
  // colour over the whole photo, not just where 3D objects actually are
  // (this is what made the photo look uniformly tinted everywhere,
  // including the crowd/stands). Clearing it lets empty space stay fully
  // see-through so only the goal/floor/lines overlay the photo.
  savedBackground = scene.background;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  setActiveCamera(photoCamera);
}

export function exitPhoto() {
  if (!savedPerspective) return;
  camera.position.copy(savedPerspective.position);
  camera.quaternion.copy(savedPerspective.quaternion);
  camera.fov = savedPerspective.fov;
  camera.updateProjectionMatrix();
  savedPerspective = null;
  scene.fog = savedFog;
  savedFog = null;
  scene.background = savedBackground;
  savedBackground = null;
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.style.position = 'relative';
  renderer.domElement.style.left = '';
  renderer.domElement.style.top = '';
  renderer.domElement.style.zIndex = '2';
  setActiveCamera(camera);
  // Reuses scene.js's own resize handler to restore full-window size/aspect
  // instead of duplicating that logic here.
  window.dispatchEvent(new Event('resize'));
}

// Sizes/positions the WebGL canvas to exactly cover `rect` (the photo's
// letterboxed drawing area from photo-canvas.js) so photoCamera's aspect
// ratio (image width/height) lines up pixel-for-pixel with the photo
// underneath, instead of stretching across the whole (differently-shaped)
// browser window.
export function fitToPhotoRect(rect) {
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.left = `${rect.x}px`;
  renderer.domElement.style.top = `${rect.y}px`;
  renderer.domElement.style.width = `${rect.w}px`;
  renderer.domElement.style.height = `${rect.h}px`;
  renderer.setSize(rect.w, rect.h, false);
  photoCamera.aspect = rect.w / rect.h;
  photoCamera.updateProjectionMatrix();
}

export function setOverlayOpacity(v) {
  renderer.domElement.style.opacity = String(v);
}
