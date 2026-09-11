import * as THREE from 'three';
import { HALF_W, RINK_L } from './constants.js';
import { state } from './state.js';
import { camera, topDownCamera } from './scene.js';
import { selectObject, deselectAll, labelFor } from './selection.js';
import { removeChip } from './authoring/chips.js';
import { removeShape } from './authoring/shapes.js';
import { removeCone } from './authoring/cones.js';
import { removeBall } from './authoring/balls.js';
import { isTopDown, resetTopDownView } from './authoring/topdown-camera.js';
import { isChoreoActive, cancelChoreo } from './authoring/choreograph.js';

const targetGoalLabelEl = document.getElementById('targetGoalLabel');

// --- keyboard input: RTS-style camera pan + selection edit. Arrows / WASD
// never move the currently-selected chip / ball / goalie any more; those
// move via mouse-drag or right-click. Keyboard drives the camera only.
// Delete removes the selection, Q/E rotates the goalie when it's the
// current selection, Tab cycles.

const clock = new THREE.Clock();
const keysPressed = new Set();
const WALK_SPEED = 2500;              // mm/second, first-person perspective camera
const WALK_BOUNDARY_MARGIN = 3000;    // mm past the boards you can still walk
const TOPDOWN_PAN_SPEED = 12000;      // mm/second at zoom=1; scaled inversely so pans feel constant on screen
const TOPDOWN_BOUNDARY_MARGIN = 30000;
const GOALIE_ROTATE_SPEED = 2.2;      // radians/second
const GOALIE_FINE_FACTOR = 0.2;       // hold Shift to fine-tune goalie rotate

const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'e', 'Q', 'E'];

let shiftHeld = false;

function cycleSelection(direction) {
  const cycle = [state.ballGroup, state.goalieGroup, ...state.goalInstances, ...state.chipGroups].filter(Boolean);
  if (cycle.length === 0) return;
  const idx = state.selected ? cycle.indexOf(state.selected) : -1;
  const obj = cycle[(idx + direction + cycle.length) % cycle.length];
  selectObject(obj);
  if (state.goalInstances.includes(obj)) {
    state.targetGoal = obj;
    targetGoalLabelEl.textContent = labelFor(obj);
  }
}

function handleKeyboardMovement(dt) {
  // Q/E rotate goalie when goalie is selected. This is the only "act on
  // the selected item" keyboard verb that survives; positional movement is
  // mouse-only.
  const goalie = state.goalieGroup;
  if (goalie && state.selected === goalie) {
    let rot = 0;
    if (keysPressed.has('q') || keysPressed.has('Q')) rot -= 1;
    if (keysPressed.has('e') || keysPressed.has('E')) rot += 1;
    if (rot !== 0) goalie.rotation.y += rot * GOALIE_ROTATE_SPEED * (shiftHeld ? GOALIE_FINE_FACTOR : 1) * dt;
  }

  // Arrows / WASD pan the camera. In 2D top-down we shift the ortho camera
  // in world XZ; in 3D perspective we walk relative to the current look yaw.
  let f = 0, r = 0;
  if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) f += 1;
  if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) f -= 1;
  if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) r += 1;
  if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) r -= 1;
  if (f === 0 && r === 0) return;
  const len = Math.hypot(f, r);
  const nf = f / len, nr = r / len;

  if (isTopDown()) {
    // Divide by zoom so a pan gesture always moves the same amount on
    // SCREEN regardless of how zoomed-in the top-down view is.
    const dist = (TOPDOWN_PAN_SPEED * dt) / Math.max(topDownCamera.zoom, 0.25);
    topDownCamera.position.x = THREE.MathUtils.clamp(topDownCamera.position.x + nr * dist, -HALF_W - TOPDOWN_BOUNDARY_MARGIN, HALF_W + TOPDOWN_BOUNDARY_MARGIN);
    // top-down camera's up is world -Z (see scene.js), so "forward on screen"
    // = -Z in world for the default rotation. Negate f accordingly.
    topDownCamera.position.z = THREE.MathUtils.clamp(topDownCamera.position.z - nf * dist, -TOPDOWN_BOUNDARY_MARGIN, RINK_L + TOPDOWN_BOUNDARY_MARGIN);
    return;
  }

  if (state.activeCamera === camera) {
    const dist = WALK_SPEED * dt;
    const forwardX = Math.sin(state.camYaw), forwardZ = Math.cos(state.camYaw);
    // Right must be derived from the camera's ACTUAL applied rotation
    // (camYaw + PI, see scene.js's setCameraLook), not naively from camYaw
    // alone - that PI offset flips the apparent left/right too.
    const rightX = -Math.cos(state.camYaw), rightZ = Math.sin(state.camYaw);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x + (forwardX * nf + rightX * nr) * dist, -HALF_W - WALK_BOUNDARY_MARGIN, HALF_W + WALK_BOUNDARY_MARGIN);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + (forwardZ * nf + rightZ * nr) * dist, -WALK_BOUNDARY_MARGIN, RINK_L + WALK_BOUNDARY_MARGIN);
  }
}

window.addEventListener('keydown', (event) => {
  // Skip everything while a text field is focused so typing a chip label
  // doesn't drop chip stamps or delete the chip.
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (event.key === 'Shift') shiftHeld = true;
  if (MOVE_KEYS.includes(event.key)) {
    keysPressed.add(event.key);
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape') {
    // Staged escape: dock.js's own Esc listener cancels an active tool.
    // Only deselect if no tool was active (this leg fires on the *next*
    // Esc press, or if there was never a tool to begin with).
    if (isChoreoActive()) { cancelChoreo(); return; }
    if (state.activeTool) return;
    deselectAll();
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedSet.length) {
    const chipIds = [];
    const shapeIds = [];
    const coneIds = [];
    const ballIds = [];
    for (const o of state.selectedSet) {
      if (state.chipGroups.includes(o) && o.userData.chip) chipIds.push(o.userData.chip.id);
      else if (state.shapeObjects.includes(o) && o.userData.shape) shapeIds.push(o.userData.shape.id);
      else if (state.coneObjects.includes(o) && o.userData.cone) coneIds.push(o.userData.cone.id);
      else if (state.extraBalls.includes(o) && o.userData.ball) ballIds.push(o.userData.ball.id);
    }
    if (!chipIds.length && !shapeIds.length && !coneIds.length && !ballIds.length) return;
    deselectAll();
    for (const id of chipIds) removeChip(id, false);
    for (const id of shapeIds) removeShape(id, false);
    for (const id of coneIds) removeCone(id, false);
    for (const id of ballIds) removeBall(id, false);
    // One combined history snapshot for the whole multi-delete.
    import('./authoring/history.js').then((h) => h.pushHistory());
    event.preventDefault();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    cycleSelection(event.shiftKey ? -1 : 1);
    return;
  }
  if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && isTopDown()) {
    resetTopDownView();
    event.preventDefault();
    return;
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') shiftHeld = false;
  keysPressed.delete(event.key);
});

export { handleKeyboardMovement, clock, keysPressed, cycleSelection };
