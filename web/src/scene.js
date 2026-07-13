import * as THREE from 'three';
import { RINK_L, RINK_W } from './constants.js';
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

// Elevated "scouting" establishing shot: positioned out on the ice in front
// of the crease, above eye height, pitched down to take in the goal, the
// goalie and the crease at once - the goalie (see goalie.js) stands at
// z=4000 facing +Z (out toward the shooter), so the camera needs to be
// further out (larger Z) than that, looking back toward -Z (yaw=PI, not
// the walking default of 0) to see its front rather than its back.
export const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 3200, 9500);
export const DEFAULT_YAW = Math.PI; // facing -Z, i.e. looking back toward the goal at the z=0 end
export const DEFAULT_PITCH = -0.48; // ~-27deg, tilts down toward the crease
const MIN_FOV = 20, MAX_FOV = 90; // narrower FOV reads as "zoomed in"
const ZOOM_SENSITIVITY = 0.05; // degrees of FOV per unit of wheel deltaY

state.camYaw = DEFAULT_YAW;
state.camPitch = DEFAULT_PITCH;
camera.rotation.order = 'YXZ';
camera.position.copy(DEFAULT_CAMERA_POSITION);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

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
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a40, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(15000, 26000, 10000);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-18000, 12000, 30000);
scene.add(fill);

// blue floor, sized a bit larger than the rink so it reads as a floor border
// around the boards, like a real hall floor around the court
const surroundFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(RINK_W + 6000, RINK_L + 6000),
  new THREE.MeshStandardMaterial({ color: 0x1a59ad, roughness: 0.85, metalness: 0.0 })
);
surroundFloor.rotation.x = -Math.PI / 2;
surroundFloor.position.set(0, -5, RINK_L / 2);
scene.add(surroundFloor);

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
renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * ZOOM_SENSITIVITY, MIN_FOV, MAX_FOV);
  camera.updateProjectionMatrix();
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
