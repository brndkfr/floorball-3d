import * as THREE from 'three';
import { HALF_W, GRID_TILE_SIZE, GRID_N_COLS, GRID_N_ROWS } from './constants.js';
import { state } from './state.js';
import { scene, camera, renderer, setCameraLook } from './scene.js';
import { handleFloorClickForTool, activateTool } from './authoring/dock.js';
import { chipDataFor, persistChipPosition, scheduleHistoryPush } from './authoring/chips.js';
import * as pathHandles from './authoring/path-handles.js';
import * as shapeHandles from './authoring/shape-handles.js';
import { shapeDataFor } from './authoring/shapes.js';
import { setPointerHint, isPrimitiveTool, beginPrimitiveDrag, updatePrimitiveDrag, commitPrimitiveDrag, cancelPrimitiveDrag, tryCommitArrow } from './authoring/draw-tool.js';
import { spawnMoveMarker } from './authoring/move-marker.js';
import { isTopDown } from './authoring/topdown-camera.js';

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

// --- selection ring + shape highlight ---------------------------------

const selectedLabelEl = document.getElementById('selectedLabel');

const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1.0, 48),
  new THREE.MeshBasicMaterial({ color: 0xffd21a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.visible = false;
scene.add(selectionRing);

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
      notifySelection();
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
  pathHandles.refreshForSelection();
  pathHandles.rebuild();
  notifySelection();
}

export function deselectAll() {
  state.selected = null;
  selectionRing.visible = false;
  clearShapeHighlight();
  selectedLabelEl.textContent = '-';
  pathHandles.refreshForSelection();
  pathHandles.rebuild();
  notifySelection();
}

const selectionSubs = new Set();
export function onSelectionChanged(cb) { selectionSubs.add(cb); return () => selectionSubs.delete(cb); }
function notifySelection() { for (const cb of selectionSubs) { try { cb(state.selected); } catch (e) { console.error(e); } } }

// --- input model (RTS-style, dedicated verbs per button) --------------
//
// LMB    = select / drag-move a chip / place with active tool.
// LMB-drag in 3D perspective still turns the camera (walking view). In 2D
//         top-down there is no camera yaw, so LMB never turns anything.
// RMB    = move-command (selected chip / ball / goalie walks to click point)
//         or cancel active tool. Right-DRAG is pan and is owned entirely
//         by topdown-camera.js.
// MMB    = pan (topdown-camera.js).
// Wheel  = zoom (topdown-camera.js).
// Keyboard = camera pan / tool hotkeys / goalie rotate (controls.js).

const DRAG_THRESHOLD = 5; // px of movement before a press is considered a drag
const LOOK_SENSITIVITY = 0.0035; // radians per pixel of 3D look-drag

// Left-button state; null when the button isn't down.
let lmb = null;   // { downX, downY, lastX, lastY, hit, mode }
// modes: 'idle' | 'chip-drag' | 'look' | 'path-handle'

// Right-button state; null when the button isn't down.
let rmb = null;   // { downX, downY }

function selectablesUnderCursor(event) {
  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, state.activeCamera);
  const selectables = [...state.goalInstances, ...state.chipGroups, ...state.shapeObjects];
  if (state.ballGroup) selectables.push(state.ballGroup);
  if (state.goalieGroup) selectables.push(state.goalieGroup);
  const hits = raycaster.intersectObjects(selectables, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj.parent && !selectables.includes(obj)) obj = obj.parent;
  return obj;
}

function chipUnderCursor(event) {
  if (!state.chipGroups.length) return null;
  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, state.activeCamera);
  const hits = raycaster.intersectObjects(state.chipGroups, true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj.parent && !state.chipGroups.includes(obj)) obj = obj.parent;
  return obj;
}

function commitTargetGoal(obj) {
  state.targetGoal = obj;
  targetGoalLabelEl.textContent = labelFor(obj);
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const p = pointerToWorld(event);
  if (p) {
    coordXEl.textContent = p.x.toFixed(0);
    coordZEl.textContent = p.z.toFixed(0);
    coordTileEl.textContent = tileLabelFor(p.x, p.z);
  }
  setPointerHint(p);

  if (pathHandles.isDragging()) { pathHandles.onDragMove(event); return; }
  if (shapeHandles.isDragging()) { shapeHandles.onDragMove(event); return; }
  if (!lmb) return;

  // Primitive-tool drag: continuous update, no threshold - the ghost preview
  // starts at the click point and grows with the cursor.
  if (lmb.mode === 'shape-drag') {
    if (p) updatePrimitiveDrag(p);
    return;
  }

  const moved = Math.hypot(event.clientX - lmb.downX, event.clientY - lmb.downY) > DRAG_THRESHOLD;

  // 3D perspective: left-drag turns the camera (no tool active, walking view).
  if (lmb.mode === 'look' || (lmb.mode === 'idle' && moved && state.activeCamera === camera && !state.activeTool)) {
    lmb.mode = 'look';
    setCameraLook(
      state.camYaw - (event.clientX - lmb.lastX) * LOOK_SENSITIVITY,
      state.camPitch - (event.clientY - lmb.lastY) * LOOK_SENSITIVITY,
    );
    lmb.lastX = event.clientX;
    lmb.lastY = event.clientY;
    return;
  }

  // 2D top-down: left-drag on a chip moves that chip.
  if (lmb.mode === 'chip-drag' || (lmb.mode === 'idle' && moved && lmb.hit && state.chipGroups.includes(lmb.hit) && isTopDown() && !state.activeTool)) {
    if (lmb.mode !== 'chip-drag') {
      selectObject(lmb.hit);
      lmb.mode = 'chip-drag';
    }
    if (p) {
      lmb.hit.position.x = p.x;
      lmb.hit.position.z = p.z;
      selectObject(lmb.hit); // refresh ring under the moved chip
    }
    return;
  }
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  // Right button: track for click-vs-drag. The pan-drag itself is wired in
  // topdown-camera.js; we only care about clicks (no-move releases).
  if (event.button === 2) {
    rmb = { downX: event.clientX, downY: event.clientY };
    return;
  }
  if (event.button !== 0) return;

  // Path-handle drag wins over everything else while it's active.
  if (pathHandles.tryStartDrag(event)) {
    lmb = { downX: event.clientX, downY: event.clientY, lastX: event.clientX, lastY: event.clientY, mode: 'path-handle', hit: null };
    return;
  }
  // Shape edit-handle drag (zone corners / edges / vertices).
  if (shapeHandles.tryStartDrag(event)) {
    lmb = { downX: event.clientX, downY: event.clientY, lastX: event.clientX, lastY: event.clientY, mode: 'shape-handle', hit: null };
    return;
  }

  lmb = {
    downX: event.clientX,
    downY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    hit: null,
    mode: 'idle',
  };

  // Primitive shape tool (rect/circle/triangle) - start a drag immediately.
  if (isPrimitiveTool(state.activeTool)) {
    const p = pointerToWorld(event);
    if (p) {
      beginPrimitiveDrag(p);
      lmb.mode = 'shape-drag';
    }
    return;
  }

  // Pre-hit-test so pointermove knows whether a drag should be a chip-drag,
  // and so pointerup can toggle selection without a second raycast.
  if (!state.activeTool || state.activeTool === 'chip') {
    lmb.hit = chipUnderCursor(event) || selectablesUnderCursor(event);
  }
});

window.addEventListener('pointerup', (event) => {
  // Right-button up: if it wasn't a pan-drag, treat as a right-click command.
  if (event.button === 2 && rmb) {
    const moved = Math.hypot(event.clientX - rmb.downX, event.clientY - rmb.downY) > DRAG_THRESHOLD;
    rmb = null;
    if (moved) return;
    handleRightClick(event);
    return;
  }

  if (event.button !== 0 || !lmb) return;

  const captured = lmb;
  lmb = null;

  if (captured.mode === 'path-handle') {
    if (pathHandles.isDragging()) pathHandles.endDrag();
    return;
  }
  if (captured.mode === 'shape-handle') {
    if (shapeHandles.isDragging()) shapeHandles.endDrag();
    return;
  }
  if (captured.mode === 'shape-drag') {
    commitPrimitiveDrag();
    return;
  }
  if (captured.mode === 'chip-drag') {
    persistChipPosition(state.selected);
    scheduleHistoryPush();
    return;
  }
  if (captured.mode === 'look') return;   // just finished turning the camera

  // Genuine click - tiny wobble still counts as click.
  const moved = Math.hypot(event.clientX - captured.downX, event.clientY - captured.downY) > DRAG_THRESHOLD;
  if (moved) return;

  handleLeftClick(event, captured.hit);
});

function handleLeftClick(event, prehitObj) {
  const p = pointerToWorld(event);

  // Tool active: place / stamp / draw. Except: with the chip stamp, a click
  // ON an existing chip selects it instead of stacking a new one on top.
  if (state.activeTool) {
    if (state.activeTool === 'chip' && prehitObj && state.chipGroups.includes(prehitObj)) {
      if (state.selected === prehitObj) deselectAll(); else selectObject(prehitObj);
      return;
    }
    if (!p) return;
    coordClickEl.textContent = `x=${p.x.toFixed(0)}, z=${p.z.toFixed(0)} (tile ${tileLabelFor(p.x, p.z)})`;
    handleFloorClickForTool(p);
    return;
  }

  // Hit a selectable: toggle selection. Goals also (re)set the target goal.
  const obj = prehitObj || selectablesUnderCursor(event);
  if (obj) {
    if (state.goalInstances.includes(obj)) commitTargetGoal(obj);
    if (state.selected === obj) deselectAll(); else selectObject(obj);
    return;
  }

  // Empty floor click, no tool: deselect. Ball / goalie no longer teleport
  // on left click - use right-click (move command) or drag instead.
  if (p) coordClickEl.textContent = `x=${p.x.toFixed(0)}, z=${p.z.toFixed(0)} (tile ${tileLabelFor(p.x, p.z)})`;
  if (state.selected) deselectAll();
}

function handleRightClick(event) {
  // 1) Cancel active tool (game-standard "right-click cancels build order").
  //    Exception: curved-arrow tool with >= 2 points committed treats
  //    right-click as "finish this arrow" (analogous to Enter / double-click).
  if (state.activeTool) {
    if (state.activeTool === 'arrow-curved' && tryCommitArrow()) return;
    activateTool(null);
    return;
  }

  // 2) Move-command on the selected chip / ball / goalie. Works in both 2D
  //    top-down and 3D perspective: the raycast against the floor plane is
  //    well-defined in either camera - only the visual "arc of the throw"
  //    would be more intuitive in top-down.
  const p = pointerToWorld(event);
  if (!p) return;
  const sel = state.selected;
  if (state.chipGroups.includes(sel)) {
    sel.position.x = p.x;
    sel.position.z = p.z;
    persistChipPosition(sel);
    scheduleHistoryPush();
    selectObject(sel);
    spawnMoveMarker(p.x, p.z);
  } else if (sel === state.ballGroup || sel === state.goalieGroup) {
    sel.position.x = p.x;
    sel.position.z = p.z;
    selectObject(sel);
    spawnMoveMarker(p.x, p.z);
  }
}

// Suppress the browser context menu on the canvas so right-click is ours.
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
