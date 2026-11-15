// Focus in the 3D view (A-BACK-040 step 5). F frames the selection from
// the current direction (orbit-math.js frameRig), or goes back to the
// fitted default view when nothing is selected; a double-click with no
// tool active makes the object under the cursor, or the floor there, the
// point the camera turns around (focusRigOn). Both blend like the camera
// presets (ui/camera-menu.js). The 2D view keeps its own F (controls.js).
import * as THREE from 'three';
import { camera, renderer, getCameraRig, cameraView } from './scene.js';
import { state } from './state.js';
import { rigToCamera, focusRigOn, frameRig } from './orbit-math.js';
import { blendCameraTo, goToPreset } from './ui/camera-menu.js';
import { pointerToWorld } from './selection.js';

const DBLCLICK_OBJECT_PX = 60;   // a double-click this close to a selected object focuses the object (estimate)

const worldPos = (obj) => obj.getWorldPosition(new THREE.Vector3());

export function focusSelection() {
  const objs = state.selectedSet.length ? state.selectedSet : (state.selected ? [state.selected] : []);
  const rig = objs.length && frameRig(getCameraRig(), objs.map(worldPos), cameraView());
  if (!rig) {
    goToPreset('stand');
    return;
  }
  blendCameraTo(rigToCamera(rig));
}

// The selected object whose floor point is drawn within DBLCLICK_OBJECT_PX
// of the cursor: the first click of the double-click selected it.
function selectedNear(clientX, clientY) {
  camera.updateMatrixWorld();
  let best = null, bestD = DBLCLICK_OBJECT_PX;
  for (const obj of state.selectedSet.length ? state.selectedSet : [state.selected].filter(Boolean)) {
    const p = worldPos(obj);
    for (const y of [0, 900]) {
      const v = new THREE.Vector3(p.x, y, p.z).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * window.innerWidth - clientX, (-v.y * 0.5 + 0.5) * window.innerHeight - clientY);
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  return best;
}

renderer.domElement.addEventListener('dblclick', (e) => {
  if (state.activeCamera !== camera || state.activeTool) return;
  const point = selectedNear(e.clientX, e.clientY) || pointerToWorld(e);
  if (!point) return;
  blendCameraTo(rigToCamera(focusRigOn(getCameraRig(), point)));
});
