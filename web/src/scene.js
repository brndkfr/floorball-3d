import * as THREE from 'three';
import { RINK_L, RINK_W, HALF_W } from './constants.js';
import { state } from './state.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1b1f);
scene.fog = new THREE.Fog(0x1b1b1f, 35000, 90000);

// --- first-person "walk the rink" camera: no OrbitControls. Position is
// free-walked with WASD/arrows (eye height fixed, floor-plane movement
// only); look direction is yaw/pitch, turned by holding the left mouse
// button and dragging (a plain click, i.e. no drag, still selects objects -
// see selection.js's pointerdown/pointerup handlers).
export const DEFAULT_FOV = 70;
export const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 50, 200000);
export const EYE_HEIGHT = 1600; // mm, roughly adult standing eye height

// Elevated establishing shot from the long side of the rink, so the 40 m
// length lays out horizontally (landscape) and the 20 m width recedes
// toward the far boards. y=3200 puts the eye slightly above standing
// height; pitch -0.48 tilts down to take in the crease + centre line.
export const DEFAULT_CAMERA_POSITION = new THREE.Vector3(18000, 3200, RINK_L / 2);
export const DEFAULT_YAW = -Math.PI / 2; // facing -X, i.e. looking across the width from the +X long side
export const DEFAULT_PITCH = -0.48; // ~-27deg, tilts down toward the rink surface
const MIN_FOV = 20, MAX_FOV = 90; // narrower FOV reads as "zoomed in"
const ZOOM_SENSITIVITY = 0.05; // degrees of FOV per unit of wheel deltaY

state.camYaw = DEFAULT_YAW;
state.camPitch = DEFAULT_PITCH;
camera.rotation.order = 'YXZ';
camera.position.copy(DEFAULT_CAMERA_POSITION);

// --- top-down orthographic camera for shape authoring (A2). Positioned high
// above the rink centre and pointed straight down; up-vector set so goal A
// (z=0) sits at the top of the screen, mirroring a printed rink diagram.
// The frustum is recomputed in the resize handler below to always fit the
// rink with a small margin, regardless of window aspect.
export const topDownCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200000);
topDownCamera.position.set(0, 60000, RINK_L / 2);
topDownCamera.up.set(0, 0, -1);
topDownCamera.lookAt(0, 0, RINK_L / 2);

// 0..3 * 90 deg rotation of the top-down view around Y. Default 1 (long
// axis horizontal) so 2D lays out landscape on typical monitors. Odd
// steps swap the frustum's long / short axis so the rotated rink still
// fits, and rotate the camera's up-vector so the view rotates on screen.
let topDownRotationSteps = 1;

export function fitTopDownFrustum() {
  const aspect = window.innerWidth / window.innerHeight;
  // Rink is 40x20 m long-side along Z. Odd rotations put the long side on
  // screen X, so swap the "long" and "short" halves.
  const swap = (topDownRotationSteps % 2) === 1;
  const marginLong = 21500, marginShort = 11000;
  const marginZ = swap ? marginShort : marginLong;
  const marginX = swap ? marginLong : marginShort;
  const halfH = Math.max(marginZ, marginX / aspect);
  const halfW = halfH * aspect;
  topDownCamera.left = -halfW;
  topDownCamera.right = halfW;
  topDownCamera.top = halfH;
  topDownCamera.bottom = -halfH;
  topDownCamera.updateProjectionMatrix();
}

// Rotate the top-down view by 90 deg increments. Kept as an exported
// helper so authoring code can bind it to a UI button; the four up-vector
// options span the rotation group around Y.
const UPS = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
];
export function setTopDownRotationSteps(steps) {
  topDownRotationSteps = ((steps % 4) + 4) % 4;
  topDownCamera.up.copy(UPS[topDownRotationSteps]);
  topDownCamera.lookAt(topDownCamera.position.x, 0, topDownCamera.position.z);
  fitTopDownFrustum();
  document.dispatchEvent(new CustomEvent('topdownRotated'));
}
export function getTopDownRotationSteps() { return topDownRotationSteps; }

// Apply the default rotation at boot so up-vector + frustum both match.
setTopDownRotationSteps(topDownRotationSteps);

// activeCamera drives main.js's render call and selection.js's raycaster.
// Modules should read state.activeCamera, not the perspective binding, so
// swapping to the top-down cam (via setActiveCamera in authoring/) works.
state.activeCamera = camera;
export function setActiveCamera(cam) {
  state.activeCamera = cam;
}
export function getActiveCamera() {
  return state.activeCamera;
}

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
// Explicit low z-index (below every HUD element, see index.html's z-index
// list) so authoring/photo-overlay/'s #photo-canvas can sit behind it while
// resized/repositioned to a sub-rectangle of the viewport during photo-lock.
renderer.domElement.style.position = 'relative';
renderer.domElement.style.zIndex = '2';

// Photo-lock camera (authoring/photo-overlay/): a third camera solved from
// a user-clicked photo via PnP (see photo-overlay/pnp.js), swapped into
// state.activeCamera the same way topDownCamera is. Aspect/near/far are
// placeholders until a photo is loaded and solved.
export const photoCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 50, 200000);

// Every other object in this scene (goal, goalie) treats local +Z as
// "forward" (yaw 0). Three.js cameras default to looking down -Z, so we add
// a fixed 180deg offset when actually applying rotation.y - that keeps
// camYaw consistent with the rest of the codebase (and with the forward/
// right vectors used for WASD walking in controls.js) while still pointing
// the camera the right way on screen.
export function setCameraLook(yaw, pitch) {
  state.camYaw = yaw;
  state.camPitch = THREE.MathUtils.clamp(pitch, -1.4, 1.4); // ~-80deg..+80deg, avoids flipping over
  camera.rotation.set(state.camPitch, state.camYaw + Math.PI, 0);
}
setCameraLook(state.camYaw, state.camPitch);

// aims setCameraLook() at a world point from a given position, matching the
// yaw=0-means-+Z convention used throughout (see setCameraLook above)
export function lookAtFrom(fromPos, targetPos) {
  const dx = targetPos.x - fromPos.x, dy = targetPos.y - fromPos.y, dz = targetPos.z - fromPos.z;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  setCameraLook(yaw, pitch);
}

// lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3a3a40, 1.15);
scene.add(hemiLight);
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(15000, 26000, 10000);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-18000, 12000, 30000);
scene.add(fill);

// Flat-lighting mode for the top-down 2D authoring surface (A-GAP-001):
// disable directional shading and boost hemisphere ambient so rink markings,
// the goal frame and the ball read as diagrammatic flat colours instead of
// subtly shaded 3D surfaces. Restored on exit from top-down.
const LIGHTING_3D = { hemi: 1.15, key: 1.1, fill: 0.35 };
const LIGHTING_2D = { hemi: 2.6, key: 0.0, fill: 0.0 };
export function setFlatLighting(flat) {
  const p = flat ? LIGHTING_2D : LIGHTING_3D;
  hemiLight.intensity = p.hemi;
  key.intensity = p.key;
  fill.intensity = p.fill;
}

// blue floor, sized a bit larger than the rink so it reads as a floor border
// around the boards, like a real hall floor around the court
const surroundFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(RINK_W + 6000, RINK_L + 6000),
  new THREE.MeshStandardMaterial({ color: 0x1a59ad, roughness: 0.85, metalness: 0.0 })
);
surroundFloor.rotation.x = -Math.PI / 2;
surroundFloor.position.set(0, -5, RINK_L / 2);
scene.add(surroundFloor);
// Exposed so photo-overlay/view.js can hide it while photo-locked - the
// giant opaque plane otherwise blankets the underlying photo instead of
// showing just the scheme on top of it.
export { surroundFloor };

// --- layer: grey scene-reference grid (generic three.js helper) ---
const gridCheckbox = document.getElementById('gridCheckbox');
const sceneGrid = new THREE.GridHelper(Math.max(RINK_W, RINK_L) + 6000, 50, 0x9a9a9a, 0xb9bdb8);
sceneGrid.position.set(0, -4, RINK_L / 2); // just above the floor (y=-5) so it's visible on top when shown
sceneGrid.visible = gridCheckbox.checked;
scene.add(sceneGrid);
gridCheckbox.addEventListener('change', () => { sceneGrid.visible = gridCheckbox.checked; });

// --- camera shortcuts: jump to the ball's exact vantage point (same origin
// the coverage raycasts use), and back to the default overview ---
const coveragePctEl = document.getElementById('coveragePct');

document.getElementById('viewFromBallBtn').addEventListener('click', () => {
  if (!state.ballGroup || !state.targetGoal) {
    coveragePctEl.textContent = 'select/target a goal and place the ball first';
    return;
  }
  const ballCenter = new THREE.Box3().setFromObject(state.ballGroup).getCenter(new THREE.Vector3());
  const goalCenter = state.targetGoal.localToWorld(new THREE.Vector3(0, 575, 0));

  // Pull back slightly from the ball, away from the goal, instead of sitting
  // exactly on top of it. The trajectory lines start at the ball's centre -
  // a camera placed exactly there looks almost straight down each line's
  // length, foreshortening them to nearly nothing. Standing just behind the
  // ball keeps it (and the full length of every line) visibly in front of
  // the camera instead of right at the eye point.
  const awayFromGoal = ballCenter.clone().sub(goalCenter).setY(0).normalize();
  const viewPoint = ballCenter.clone().addScaledVector(awayFromGoal, 200);
  viewPoint.y = ballCenter.y + 60; // a touch of height so the lines aren't edge-on with the floor either

  camera.position.copy(viewPoint);
  lookAtFrom(viewPoint, goalCenter);
});

document.getElementById('resetViewBtn').addEventListener('click', () => {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  setCameraLook(DEFAULT_YAW, DEFAULT_PITCH);
  camera.fov = DEFAULT_FOV;
  camera.updateProjectionMatrix();
});

// --- scroll-wheel zoom: narrows/widens the FOV rather than dollying the
// camera position, so it works the same whether you're walking, or have
// something selected, without pushing through walls/objects ---
export function applyZoomDelta(deltaFov) {
  camera.fov = THREE.MathUtils.clamp(camera.fov + deltaFov, MIN_FOV, MAX_FOV);
  camera.updateProjectionMatrix();
}

renderer.domElement.addEventListener('wheel', (event) => {
  // Skip while a top-down authoring tool is active - that camera has its
  // own wheel-zoom handler in authoring/topdown-camera.js.
  if (state.activeCamera !== camera) return;
  event.preventDefault();
  applyZoomDelta(event.deltaY * ZOOM_SENSITIVITY);
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitTopDownFrustum();
});
