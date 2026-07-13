import * as THREE from 'three';
import { HALF_W, GRID_TILE_SIZE, GRID_N_COLS, GRID_N_ROWS } from './constants.js';
import { state } from './state.js';
import { scene, camera, renderer, setCameraLook } from './scene.js';

// --- coordinate readout: hover to preview, click to pin a coordinate ---
const coordXEl = document.getElementById('coordX');
const coordZEl = document.getElementById('coordZ');
const coordTileEl = document.getElementById('coordTile');
const coordClickEl = document.getElementById('coordClick');
const targetGoalLabelEl = document.getElementById('targetGoalLabel');

export const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0, the markings' reference plane
const hitPoint = new THREE.Vector3();

export function tileLabelFor(x, z) {
  const col = Math.floor((x + HALF_W) / GRID_TILE_SIZE) + 1;
  const row = Math.floor(z / GRID_TILE_SIZE) + 1;
  if (col < 1 || col > GRID_N_COLS || row < 1 || row > GRID_N_ROWS) return 'off rink';
  return `${col}-${row}`;
}

export function pointerToWorld(event) {
  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  return raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint : null;
}

// --- selection + ball placement ---
const selectedLabelEl = document.getElementById('selectedLabel');

const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1.0, 48),
  new THREE.MeshBasicMaterial({ color: 0xffd21a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.visible = false;
scene.add(selectionRing);

export function labelFor(obj) {
  if (obj === state.ballGroup) return 'ball';
  if (obj === state.goalieGroup) return 'goalie';
  const i = state.goalInstances.indexOf(obj);
  if (i === 0) return 'goal A (z=0 end)';
  if (i === 1) return 'goal B (z=40000 end)';
  return 'object';
}

export function selectObject(obj) {
  state.selected = obj;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) / 2 + 120;
  selectionRing.scale.set(radius, radius, 1);
  selectionRing.position.set(center.x, 4, center.z);
  selectionRing.visible = true;
  selectedLabelEl.textContent = labelFor(obj);
}

export function deselectAll() {
  state.selected = null;
  selectionRing.visible = false;
  selectedLabelEl.textContent = '-';
}

// pointerdown/pointerup with a movement threshold, instead of the native
// 'click' event, so we can tell a genuine click (select/place) apart from a
// look-drag (hold + drag to turn the camera) - both start as a plain
// mousedown on the canvas, and only the total movement distinguishes them.
let downX = 0, downY = 0;
let isLooking = false;
let lastLookX = 0, lastLookY = 0;
const CLICK_MOVE_THRESHOLD = 5; // pixels
const LOOK_SENSITIVITY = 0.0035; // radians per pixel of drag

renderer.domElement.addEventListener('pointermove', (event) => {
  const p = pointerToWorld(event);
  if (p) {
    coordXEl.textContent = p.x.toFixed(0);
    coordZEl.textContent = p.z.toFixed(0);
    coordTileEl.textContent = tileLabelFor(p.x, p.z);
  }

  if (isLooking) {
    setCameraLook(state.camYaw - (event.clientX - lastLookX) * LOOK_SENSITIVITY, state.camPitch - (event.clientY - lastLookY) * LOOK_SENSITIVITY);
    lastLookX = event.clientX;
    lastLookY = event.clientY;
  }
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  downX = event.clientX;
  downY = event.clientY;
  isLooking = true;
  lastLookX = event.clientX;
  lastLookY = event.clientY;
});

window.addEventListener('pointerup', (event) => {
  isLooking = false;
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;
  if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) return; // was a look-drag, not a click

  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);

  const selectables = [...state.goalInstances];
  if (state.ballGroup) selectables.push(state.ballGroup);
  if (state.goalieGroup) selectables.push(state.goalieGroup);

  const hits = raycaster.intersectObjects(selectables, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && !selectables.includes(obj)) obj = obj.parent;
    if (state.goalInstances.includes(obj)) {
      // clicking a goal always (re)designates it as the trajectory target,
      // independent of the selection ring toggle below - so you can pick a
      // goal once, then freely select/move the ball without losing it
      state.targetGoal = obj;
      targetGoalLabelEl.textContent = labelFor(obj);
    }
    if (state.selected === obj) {
      deselectAll();
    } else {
      selectObject(obj);
    }
    return;
  }

  const p = pointerToWorld(event);
  if (!p) return;
  coordClickEl.textContent = `x=${p.x.toFixed(0)}, z=${p.z.toFixed(0)} (tile ${tileLabelFor(p.x, p.z)})`;

  if (state.selected === state.ballGroup) {
    state.ballGroup.position.x = p.x;
    state.ballGroup.position.z = p.z;
    selectObject(state.ballGroup); // refresh the ring position under the moved ball
  } else if (state.selected === state.goalieGroup) {
    state.goalieGroup.position.x = p.x;
    state.goalieGroup.position.z = p.z;
    selectObject(state.goalieGroup); // refresh the ring position under the moved goalie
  }
});
