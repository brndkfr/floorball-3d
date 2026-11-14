import * as THREE from 'three';
import { RINK_L, RINK_W, HALF_W } from './constants.js';
import { state } from './state.js';
import { markRenderDirty } from './render-dirty.js';
import { pickRendererQuality } from './renderer-quality.js';
import { stageFrustum, readShellInsets } from './ui/stage-frustum.js';
import { cameraToRig, rigToCamera, dollyBy, screenToFloor, fitRigToRink } from './orbit-math.js';

export const scene = new THREE.Scene();

// --- hall backdrop for the 3D view (S-BACK-030 steps 1 and 2). All colours
// and distances are look-based estimates. The 3D view gets a slate backdrop
// instead of a flat near-black, a hall floor, fog in the backdrop colour so
// the far end of the floor fades into it without an edge, and filmic tone
// mapping. The top-down view and photo-lock keep their flat look:
// setFlatLighting() swaps the backdrop back for 2D, photo-lock clears it
// itself (photo-overlay/view.js), and setActiveCamera() switches hall floor
// and tone mapping off for every camera but the perspective one.
const FLAT_BACKGROUND = new THREE.Color(0x1b1b1f);
const HALL_BACKGROUND = new THREE.Color(0x2b313d);
const TONE_EXPOSURE = 1.15;
scene.background = HALL_BACKGROUND;
scene.fog = new THREE.Fog(HALL_BACKGROUND.getHex(), 45000, 140000);

// --- 3D camera: an orbit rig (A-BACK-040, orbit-math.js), no OrbitControls.
// Left-drag turns the camera around the floor point it looks at, right /
// middle drag and WASD slide that point, the wheel moves closer or away
// (see selection.js and controls.js). A plain click, i.e. no drag, still
// selects objects. The camera itself stays the source of truth: gestures
// go through getCameraRig() / applyCameraRig() below.
// The FOV is fixed (the wheel moves the camera instead); 45 degrees is an
// estimate: narrow enough that the far half of the rink does not shrink
// away, wide enough for a view from behind a goal.
export const DEFAULT_FOV = 45;
export const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 50, 200000);
camera.rotation.order = 'YXZ';
// The default pose (whole rink fitted to the stage) is applied further
// down by applyDefaultView(), once setCameraLook() exists.

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

// Shell insets (rail, top bar, docked right panel, phone tab bar) as set in
// app.css; the 2D view fits the rink into what they leave free.

export function fitTopDownFrustum() {
  // Rink is 40x20 m long-side along Z. Odd rotations put the long side on
  // screen X, so swap the "long" and "short" halves.
  const swap = (topDownRotationSteps % 2) === 1;
  const marginLong = 21500, marginShort = 11000;
  const half = swap ? { x: marginLong, y: marginShort } : { x: marginShort, y: marginLong };
  const f = stageFrustum({ vw: window.innerWidth, vh: window.innerHeight, insets: readShellInsets(), half });
  topDownCamera.left = f.left;
  topDownCamera.right = f.right;
  topDownCamera.top = f.top;
  topDownCamera.bottom = f.bottom;
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
  applyToneMapping();
}
// Filmic tone mapping is part of the 3D look only: the 2D diagram and the
// photo overlay keep their exact colours.
function applyToneMapping() {
  renderer.toneMapping = state.activeCamera === camera ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  hallFloor.visible = state.activeCamera === camera;
}
export function getActiveCamera() {
  return state.activeCamera;
}

// S-BACK-011: renderer quality tier (antialias + pixelRatio) picked from
// hardwareConcurrency / deviceMemory / devicePixelRatio, with a
// localStorage override ('low' | 'high' | 'auto', default 'auto') so a
// power user can force a specific tier without editing code. Exported as
// `rendererQuality` for debugging / status displays.
const qualityOverride = (() => {
  try { return localStorage.getItem('floorball.renderQuality'); } catch { return null; }
})();
export const rendererQuality = pickRendererQuality({
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemory: navigator.deviceMemory,
  devicePixelRatio: window.devicePixelRatio,
  override: qualityOverride,
});
export const renderer = new THREE.WebGLRenderer({ antialias: rendererQuality.antialias, alpha: true });
renderer.toneMappingExposure = TONE_EXPOSURE;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(rendererQuality.pixelRatio);
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
// right vectors in orbit-math.js) while still pointing the camera the
// right way on screen.
export function setCameraLook(yaw, pitch) {
  state.camYaw = yaw;
  state.camPitch = THREE.MathUtils.clamp(pitch, -1.4, 1.4); // ~-80deg..+80deg, avoids flipping over
  camera.rotation.set(state.camPitch, state.camYaw + Math.PI, 0);
}

// aims setCameraLook() at a world point from a given position, matching the
// yaw=0-means-+Z convention used throughout (see setCameraLook above)
export function lookAtFrom(fromPos, targetPos) {
  const dx = targetPos.x - fromPos.x, dy = targetPos.y - fromPos.y, dz = targetPos.z - fromPos.z;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  setCameraLook(yaw, pitch);
}

// The orbit rig of the perspective camera as it stands. Read from the
// camera's own rotation, not state.camYaw / camPitch: playback and
// exitTopDown() restore the camera through its quaternion and leave those
// two untouched.
export function getCameraRig() {
  return cameraToRig({
    x: camera.position.x, y: camera.position.y, z: camera.position.z,
    yaw: camera.rotation.y - Math.PI, pitch: camera.rotation.x,
  });
}

export function applyCameraRig(rig) {
  const c = rigToCamera(rig);
  camera.position.set(c.x, c.y, c.z);
  setCameraLook(c.yaw, c.pitch);
}

// The view the orbit math needs to turn pixels into millimetres.
export function cameraView() {
  return { vw: window.innerWidth, vh: window.innerHeight, viewportH: window.innerHeight, fovDeg: camera.fov };
}

// --- default 3D view (A-BACK-040 step 3): the whole rink fitted into the
// stage, the window minus the shell insets, like the 2D view. Boot and
// "Reset view" apply it; a window or inset change re-fits it for as long as
// the camera still stands where the last fit put it (refitDefaultView), so
// a view the user moved is never pulled away.
const lastFit = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

export function applyDefaultView() {
  camera.fov = DEFAULT_FOV;
  camera.updateProjectionMatrix();
  applyCameraRig(fitRigToRink({ ...cameraView(), insets: readShellInsets() }));
  lastFit.position.copy(camera.position);
  lastFit.quaternion.copy(camera.quaternion);
}

export function isDefaultView() {
  return camera.fov === DEFAULT_FOV
    && camera.position.distanceTo(lastFit.position) < 1
    && camera.quaternion.angleTo(lastFit.quaternion) < 1e-4;
}

export function refitDefaultView() {
  // In 2D the perspective camera is parked; exitTopDown() fits it again.
  if (state.activeCamera === camera && isDefaultView()) applyDefaultView();
}
applyDefaultView();

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
  scene.background = flat ? FLAT_BACKGROUND : HALL_BACKGROUND;
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
// The hall floor beyond that border (S-BACK-030 step 2): a large dark plane
// so the rink does not float in a void; the fog fades it into the backdrop.
// 3D view only (applyToneMapping() hides it for the 2D and photo cameras).
const hallFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(RINK_W + 500000, RINK_L + 500000),   // past the fog's far end on every side
  new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.95, metalness: 0.0 })
);
hallFloor.rotation.x = -Math.PI / 2;
hallFloor.position.set(0, -12, RINK_L / 2);
hallFloor.name = 'hallFloor';
scene.add(hallFloor);
applyToneMapping();

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
gridCheckbox.addEventListener('change', () => { sceneGrid.visible = gridCheckbox.checked; markRenderDirty(); }); // S-BACK-011

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

document.getElementById('resetViewBtn').addEventListener('click', applyDefaultView);

// --- scroll-wheel / pinch zoom: moves the camera toward or away from its
// target (A-BACK-040); the FOV stays. `wheelDelta` is in wheel deltaY
// units, negative = closer. With a pointer position the floor point under
// it stays where it is on screen.
export function dollyCamera(wheelDelta, clientX = null, clientY = null) {
  const rig = getCameraRig();
  const pivot = clientX === null ? null : screenToFloor(rig, clientX, clientY, cameraView());
  applyCameraRig(dollyBy(rig, wheelDelta, pivot));
}

renderer.domElement.addEventListener('wheel', (event) => {
  // Skip while a top-down authoring tool is active - that camera has its
  // own wheel-zoom handler in authoring/topdown-camera.js.
  if (state.activeCamera !== camera) return;
  event.preventDefault();
  dollyCamera(event.deltaY, event.clientX, event.clientY);
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitTopDownFrustum();
  refitDefaultView();
});
