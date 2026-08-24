import * as THREE from 'three';
import { HALF_W, RINK_L, BALL_RADIUS } from './constants.js';
import { state } from './state.js';
import { camera } from './scene.js';
import { selectObject, deselectAll, labelFor } from './selection.js';
import { persistChipPosition, scheduleHistoryPush, removeChip, CHIP_RADIUS } from './authoring/chips.js';

const targetGoalLabelEl = document.getElementById('targetGoalLabel');

// --- keyboard controls: arrow keys/WASD move the selected ball, Escape
// deselects, Tab/Shift+Tab cycles selection - game-style input on top of
// the mouse-driven selection/placement in selection.js ---
const clock = new THREE.Clock();
const keysPressed = new Set();
const BALL_SPEED = 4000; // mm/second
const BALL_RADIUS_FOR_CLAMP = BALL_RADIUS; // same value, see state.js's getBallWorldCenter() comment
const WALK_SPEED = 2500; // mm/second, first-person camera walking
const WALK_BOUNDARY_MARGIN = 3000; // mm past the boards you're still allowed to walk
const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'e', 'Q', 'E'];

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

// Goalie movement is fully free - no line-lock, no clamp beyond the rink
// itself, same control feel as the ball. Rotation is manual too (Q/E) rather
// than auto-facing the ball, so the two don't fight over control each frame.
const GOALIE_SPEED = 3000; // mm/second
const GOALIE_RADIUS_FOR_CLAMP = 400; // rough footprint half-width, keeps it off the boards
const GOALIE_ROTATE_SPEED = 2.2; // radians/second
const GOALIE_FINE_FACTOR = 0.2; // hold Shift to move/rotate the goalie at this fraction of normal speed
let shiftHeld = false;

function handleKeyboardMovement(dt) {
  const ballGroup = state.ballGroup, goalieGroup = state.goalieGroup;
  if (state.selected === ballGroup && ballGroup) {
    let dx = 0, dz = 0;
    // Signs match the camera's default forward (+Z)/right (-X) directions
    // (see forwardX/rightX below) - not raw world axes - so Up/Right feel
    // like "away from"/"to the right of" the viewer at the default view.
    if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) dz += 1;
    if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) dz -= 1;
    if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) dx += 1;
    if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) dx -= 1;
    if (dx === 0 && dz === 0) return;
    const len = Math.hypot(dx, dz);
    const dist = BALL_SPEED * dt;
    ballGroup.position.x = THREE.MathUtils.clamp(ballGroup.position.x + (dx / len) * dist, -HALF_W + BALL_RADIUS_FOR_CLAMP, HALF_W - BALL_RADIUS_FOR_CLAMP);
    ballGroup.position.z = THREE.MathUtils.clamp(ballGroup.position.z + (dz / len) * dist, BALL_RADIUS_FOR_CLAMP, RINK_L - BALL_RADIUS_FOR_CLAMP);
    selectObject(ballGroup); // keep the ring (and coordinate readout logic) following
  } else if (state.selected === goalieGroup && goalieGroup) {
    let dx = 0, dz = 0;
    // Same forward(+Z)/right(-X) convention as the ball block above.
    if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) dz += 1;
    if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) dz -= 1;
    if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) dx += 1;
    if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) dx -= 1;
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      const dist = GOALIE_SPEED * (shiftHeld ? GOALIE_FINE_FACTOR : 1) * dt;
      goalieGroup.position.x = THREE.MathUtils.clamp(goalieGroup.position.x + (dx / len) * dist, -HALF_W + GOALIE_RADIUS_FOR_CLAMP, HALF_W - GOALIE_RADIUS_FOR_CLAMP);
      goalieGroup.position.z = THREE.MathUtils.clamp(goalieGroup.position.z + (dz / len) * dist, GOALIE_RADIUS_FOR_CLAMP, RINK_L - GOALIE_RADIUS_FOR_CLAMP);
      selectObject(goalieGroup); // keep the ring following
    }
    let rot = 0;
    if (keysPressed.has('q') || keysPressed.has('Q')) rot -= 1;
    if (keysPressed.has('e') || keysPressed.has('E')) rot += 1;
    if (rot !== 0) goalieGroup.rotation.y += rot * GOALIE_ROTATE_SPEED * (shiftHeld ? GOALIE_FINE_FACTOR : 1) * dt;
  } else if (state.chipGroups.includes(state.selected)) {
    // Chip movement: same forward(+Z)/right(-X) convention as ball/goalie.
    let dx = 0, dz = 0;
    if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) dz += 1;
    if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) dz -= 1;
    if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) dx += 1;
    if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) dx -= 1;
    if (dx === 0 && dz === 0) return;
    const chip = state.selected;
    const len = Math.hypot(dx, dz);
    const dist = BALL_SPEED * (shiftHeld ? GOALIE_FINE_FACTOR : 1) * dt;
    chip.position.x = THREE.MathUtils.clamp(chip.position.x + (dx / len) * dist, -HALF_W + CHIP_RADIUS, HALF_W - CHIP_RADIUS);
    chip.position.z = THREE.MathUtils.clamp(chip.position.z + (dz / len) * dist, CHIP_RADIUS, RINK_L - CHIP_RADIUS);
    persistChipPosition(chip);
    scheduleHistoryPush();
    selectObject(chip);
  } else {
    // nothing selected - WASD/arrows walk the camera instead (first-person
    // exploration). Forward/right are derived from the current look yaw, so
    // movement is always relative to where you're facing, not world axes.
    let f = 0, r = 0;
    if (keysPressed.has('ArrowUp') || keysPressed.has('w') || keysPressed.has('W')) f += 1;
    if (keysPressed.has('ArrowDown') || keysPressed.has('s') || keysPressed.has('S')) f -= 1;
    if (keysPressed.has('ArrowRight') || keysPressed.has('d') || keysPressed.has('D')) r += 1;
    if (keysPressed.has('ArrowLeft') || keysPressed.has('a') || keysPressed.has('A')) r -= 1;
    if (f === 0 && r === 0) return;
    const len = Math.hypot(f, r);
    const dist = (WALK_SPEED * dt) / len;
    const forwardX = Math.sin(state.camYaw), forwardZ = Math.cos(state.camYaw);
    // Right must be derived from the camera's ACTUAL applied rotation
    // (camYaw + PI, see scene.js's setCameraLook), not naively from camYaw
    // alone - that PI offset flips the apparent left/right too. This was
    // the bug: the previous formula used camYaw directly and ended up
    // pointing left.
    const rightX = -Math.cos(state.camYaw), rightZ = Math.sin(state.camYaw);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x + (forwardX * f + rightX * r) * dist, -HALF_W - WALK_BOUNDARY_MARGIN, HALF_W + WALK_BOUNDARY_MARGIN);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + (forwardZ * f + rightZ * r) * dist, -WALK_BOUNDARY_MARGIN, RINK_L + WALK_BOUNDARY_MARGIN);
  }
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Shift') shiftHeld = true;
  if (MOVE_KEYS.includes(event.key)) {
    keysPressed.add(event.key);
    event.preventDefault();
  } else if (event.key === 'Escape') {
    deselectAll();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.chipGroups.includes(state.selected)) {
    const chip = state.selected;
    deselectAll();
    removeChip(chip.userData.chip.id);
    event.preventDefault();
  } else if (event.key === 'Tab' && document.activeElement.tagName !== 'INPUT') {
    event.preventDefault();
    cycleSelection(event.shiftKey ? -1 : 1);
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') shiftHeld = false;
  keysPressed.delete(event.key);
});

export { handleKeyboardMovement, clock, keysPressed, cycleSelection };
