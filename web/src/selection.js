import * as THREE from 'three';
import { HALF_W, GRID_TILE_SIZE, GRID_N_COLS, GRID_N_ROWS } from './constants.js';
import { state } from './state.js';
import { scene, camera, renderer, setCameraLook } from './scene.js';
import { handleFloorClickForTool } from './authoring/dock.js';
import { chipDataFor, persistChipPosition, scheduleHistoryPush } from './authoring/chips.js';
import { removeShape } from './authoring/shapes.js';
import { shapeDataFor } from './authoring/shapes.js';
import { setPointerHint } from './authoring/draw-tool.js';

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
  raycaster.setFromCamera(mouseNDC, state.activeCamera);
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

// Separate highlight for shapes (arrows/zones/text): traces the actual
// perimeter of the shape rather than a bounding-box ring, so a zone reads
// as "this zone is selected" not "something in this area is selected".
let shapeHighlight = null;

function clearShapeHighlight() {
  if (!shapeHighlight) return;
  shapeHighlight.parent?.remove(shapeHighlight);
  shapeHighlight.traverse?.((n) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });
  shapeHighlight = null;
}

function buildShapeHighlight(obj) {
  const shape = shapeDataFor(obj);
  if (!shape) return null;
  const y = 6;   // just above SHAPE_Y=5
  const color = 0xffd21a;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, depthTest: false });
  if (shape.type === 'zone' && shape.points?.length >= 3) {
    const positions = new Float32Array(shape.points.length * 3);
    for (let i = 0; i < shape.points.length; i++) {
      positions[i * 3] = shape.points[i].x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = shape.points[i].z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const loop = new THREE.LineLoop(g, mat);
    loop.renderOrder = 3;
    loop.frustumCulled = false;
    return loop;
  }
  if (shape.type === 'arrow' && shape.points?.length >= 2) {
    // ring around each endpoint so both start and end are clearly marked
    const group = new THREE.Group();
    const ringGeom = new THREE.RingGeometry(180, 260, 24);
    ringGeom.rotateX(-Math.PI / 2);
    for (const p of shape.points) {
      const rm = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
      const ring = new THREE.Mesh(ringGeom, rm);
      ring.position.set(p.x, y, p.z);
      ring.renderOrder = 3;
      ring.frustumCulled = false;
      group.add(ring);
    }
    return group;
  }
  return null;
}

export function labelFor(obj) {
  if (obj === state.ballGroup) return 'ball';
  if (obj === state.goalieGroup) return 'goalie';
  const i = state.goalInstances.indexOf(obj);
  if (i === 0) return 'goal A (z=0 end)';
  if (i === 1) return 'goal B (z=40000 end)';
  const chip = chipDataFor(obj);
  if (chip) return `Team ${chip.team} #${chip.number}`;
  if (obj?.userData?.shape) return obj.userData.shape.type;
  return 'object';
}

export function selectObject(obj) {
  state.selected = obj;
  clearShapeHighlight();
  const isShape = !!obj?.userData?.shape;
  if (isShape) {
    const hl = buildShapeHighlight(obj);
    if (hl) {
      shapeHighlight = hl;
      scene.add(shapeHighlight);
      selectionRing.visible = false;
      selectedLabelEl.textContent = labelFor(obj);
      return;
    }
    // text sprite (or unbuildable) - fall through to the bounding-box ring
  }
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
  clearShapeHighlight();
  selectedLabelEl.textContent = '-';
}

// pointerdown/pointerup with a movement threshold, instead of the native
// 'click' event, so we can tell a genuine click (select/place) apart from a
// look-drag (hold + drag to turn the camera) - both start as a plain
// mousedown on the canvas, and only the total movement distinguishes them.
let downX = 0, downY = 0;
let isLooking = false;
let lastLookX = 0, lastLookY = 0;
let isDraggingChip = false;   // set when a chip is selected in 2D and the user starts dragging
const CLICK_MOVE_THRESHOLD = 5; // pixels
const LOOK_SENSITIVITY = 0.0035; // radians per pixel of drag

renderer.domElement.addEventListener('pointermove', (event) => {
  const p = pointerToWorld(event);
  if (p) {
    coordXEl.textContent = p.x.toFixed(0);
    coordZEl.textContent = p.z.toFixed(0);
    coordTileEl.textContent = tileLabelFor(p.x, p.z);
  }
  setPointerHint(p);

  // 2D drag: while a chip is selected and the pointer moves past the click
  // threshold, slide the chip under the cursor instead of look-dragging.
  if (isLooking && !state.activeTool && state.chipGroups.includes(state.selected)
      && state.activeCamera !== camera
      && (isDraggingChip || Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_MOVE_THRESHOLD)) {
    isDraggingChip = true;
    if (p) {
      state.selected.position.x = p.x;
      state.selected.position.z = p.z;
      selectObject(state.selected);
    }
    return;
  }

  if (isLooking) {
    // Look-drag is meaningful only for the perspective camera. In top-down
    // authoring mode the drag drives pan (handled in topdown-camera.js);
    // don't secretly rotate the parked perspective camera in the background.
    if (state.activeCamera === camera) {
      setCameraLook(state.camYaw - (event.clientX - lastLookX) * LOOK_SENSITIVITY, state.camPitch - (event.clientY - lastLookY) * LOOK_SENSITIVITY);
    }
    lastLookX = event.clientX;
    lastLookY = event.clientY;
  }
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  downX = event.clientX;
  downY = event.clientY;
  isLooking = true;
  isDraggingChip = false;
  lastLookX = event.clientX;
  lastLookY = event.clientY;
});

window.addEventListener('pointerup', (event) => {
  isLooking = false;
  if (isDraggingChip) {
    isDraggingChip = false;
    persistChipPosition(state.selected);
    scheduleHistoryPush();
    return;
  }
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;
  // Shape / chip tools: user is placing points, not looking around. Skip
  // the look-drag threshold so click-across-the-rink still commits.
  if (!state.activeTool && Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) return;

  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, state.activeCamera);

  // When an authoring tool is active, the tool always wins over hit-testing
  // existing objects. Otherwise clicking a spot that happens to sit under a
  // zone / shape / chip would select that object instead of dropping the
  // new chip or committing the next shape point.
  if (state.activeTool) {
    const p = pointerToWorld(event);
    if (!p) return;
    coordClickEl.textContent = `x=${p.x.toFixed(0)}, z=${p.z.toFixed(0)} (tile ${tileLabelFor(p.x, p.z)})`;
    handleFloorClickForTool(p);
    return;
  }

  const selectables = [...state.goalInstances, ...state.chipGroups, ...state.shapeObjects];
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

  // Tool mode wins over "move the selected thing" - clicking the rink while
  // the chip stamp is active drops a new chip regardless of what's selected.
  if (handleFloorClickForTool(p)) return;

  if (state.selected === state.ballGroup) {
    state.ballGroup.position.x = p.x;
    state.ballGroup.position.z = p.z;
    selectObject(state.ballGroup); // refresh the ring position under the moved ball
  } else if (state.selected === state.goalieGroup) {
    state.goalieGroup.position.x = p.x;
    state.goalieGroup.position.z = p.z;
    selectObject(state.goalieGroup); // refresh the ring position under the moved goalie
  } else if (state.chipGroups.includes(state.selected)) {
    state.selected.position.x = p.x;
    state.selected.position.z = p.z;
    persistChipPosition(state.selected);
    scheduleHistoryPush();
    selectObject(state.selected); // refresh the ring position under the moved chip
    state.goalieGroup.position.z = p.z;
    selectObject(state.goalieGroup); // refresh the ring position under the moved goalie
  }
});
