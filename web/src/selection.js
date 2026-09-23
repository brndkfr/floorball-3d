import * as THREE from 'three';
import { HALF_W, GRID_TILE_SIZE, GRID_N_COLS, GRID_N_ROWS } from './constants.js';
import { state } from './state.js';
import { scene, camera, renderer, setCameraLook } from './scene.js';
import { handleFloorClickForTool, activateTool } from './authoring/dock.js';
import { chipDataFor, persistChipPosition, scheduleHistoryPush } from './authoring/chips.js';
import * as pathHandles from './authoring/path-handles.js';
import * as shapeHandles from './authoring/shape-handles.js';
import { shapeDataFor, translateShapes } from './authoring/shapes.js';
import { coneDataFor, persistConePosition } from './authoring/cones.js';
import { ballDataFor, persistBallPosition } from './authoring/balls.js';
import { setPointerHint, isPrimitiveTool, beginPrimitiveDrag, updatePrimitiveDrag, commitPrimitiveDrag, cancelPrimitiveDrag, tryCommitArrow } from './authoring/draw-tool.js';
import { spawnMoveMarker } from './authoring/move-marker.js';
import { startWalk, setWalkTickCallback } from './authoring/walk-tween.js';
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

// --- selection rings + shape highlights ------------------------------
//
// Multi-select: state.selectedSet holds every selected object; state.selected
// is the "primary" (last added), kept for the many single-selection consumers
// (inspector, popover, path-handles) that only reason about one thing.

const selectedLabelEl = document.getElementById('selectedLabel');

// Shared geometry/material for a pool of yellow selection rings - one per
// selected chip / ball / goalie / goal. Grown on demand, hidden when unused.
const selectionRingGeo = new THREE.RingGeometry(0.85, 1.0, 48);
const selectionRingMat = new THREE.MeshBasicMaterial({ color: 0xffd21a, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false });
const selRings = [];
function getRing(i) {
  if (!selRings[i]) {
    const m = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    selRings[i] = m;
  }
  return selRings[i];
}
function hideRingsFrom(i) { for (let k = i; k < selRings.length; k++) selRings[k].visible = false; }

// All shape outline highlights live under one group so a multi-shape
// selection just parents N children here.
const shapeHighlightGroup = new THREE.Group();
scene.add(shapeHighlightGroup);
function clearShapeHighlight() {
  for (const c of [...shapeHighlightGroup.children]) {
    shapeHighlightGroup.remove(c);
    c.traverse?.((n) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });
  }
}

function buildShapeHighlight(obj) {
  const shape = shapeDataFor(obj);
  if (!shape) return null;
  const y = 6;   // just above SHAPE_Y=5
  // Shape geometry bakes world coords, so a live drag only offsets the
  // Object3D transform - fold that offset in so the outline tracks the drag
  // (normally 0,0 for zones/arrows; non-zero only mid-move).
  const ox = obj.position.x, oz = obj.position.z;
  const color = 0xffd21a;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, depthTest: false });
  if (shape.type === 'zone' && shape.points?.length >= 3) {
    const positions = new Float32Array(shape.points.length * 3);
    for (let i = 0; i < shape.points.length; i++) {
      positions[i * 3] = shape.points[i].x + ox;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = shape.points[i].z + oz;
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
      ring.position.set(p.x + ox, y, p.z + oz);
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
  const cone = coneDataFor(obj);
  if (cone) return `${cone.kind} cone`;
  const ball = ballDataFor(obj);
  if (ball) return ball.label?.trim() || 'ball (extra)';
  if (obj?.userData?.shape) return obj.userData.shape.type;
  return 'object';
}

// Redraw rings + shape outlines + the readout label for the current
// selectedSet. Pure visual refresh - does NOT notify subscribers, so it's
// cheap to call every frame during a drag.
export function applySelectionVisuals() {
  clearShapeHighlight();
  let ringIdx = 0;
  for (const obj of state.selectedSet) {
    if (!obj) continue;
    if (obj.userData?.shape) {
      const hl = buildShapeHighlight(obj);
      if (hl) { shapeHighlightGroup.add(hl); continue; }
      // Text shapes get their own dotted rect + resize handles from
      // shape-handles.js - suppress the fallback yellow ring.
      if (obj.userData.shape.type === 'text') continue;
      // Otherwise fall through to the bounding-box ring.
    }
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) / 2 + 120;
    const ring = getRing(ringIdx++);
    ring.scale.set(radius, radius, 1);
    ring.position.set(center.x, 4, center.z);
    ring.visible = true;
  }
  hideRingsFrom(ringIdx);

  const n = state.selectedSet.length;
  selectedLabelEl.textContent = n === 0 ? '-' : n === 1 ? labelFor(state.selectedSet[0]) : `${n} selected`;

  pathHandles.refreshForSelection();
  pathHandles.rebuild();
}

// Keep the yellow ring(s) glued to objects while a walk-tween eases them.
setWalkTickCallback(applySelectionVisuals);

// Replace the selection with exactly `obj` (or clear it when null).
export function selectObject(obj) {
  if (!obj) return deselectAll();
  state.selectedSet = [obj];
  state.selected = obj;
  applySelectionVisuals();
  notifySelection();
}

// Replace the selection with a set (marquee commit). Order is preserved;
// the last entry becomes the primary.
export function setSelection(objs) {
  const uniq = [];
  for (const o of objs) if (o && !uniq.includes(o)) uniq.push(o);
  state.selectedSet = uniq;
  state.selected = uniq.length ? uniq[uniq.length - 1] : null;
  applySelectionVisuals();
  notifySelection();
}

// Add object(s) to the current selection without dropping what's there.
export function addToSelection(objs) {
  const add = Array.isArray(objs) ? objs : [objs];
  setSelection([...state.selectedSet, ...add]);
}

// Toggle one object in/out of the selection (Shift-click).
export function toggleInSelection(obj) {
  if (!obj) return;
  const set = state.selectedSet.slice();
  const i = set.indexOf(obj);
  if (i >= 0) set.splice(i, 1); else set.push(obj);
  setSelection(set);
}

// Just the chips in the current selection, in selection order.
export function selectedChips() {
  return state.selectedSet.filter((o) => state.chipGroups.includes(o));
}

// Objects whose body can be grabbed and dragged on the top-down floor:
// chips plus every shape (arrow / zone / text) plus marker cones plus
// user-spawned extra balls and extra goals. The two fixed goals, the
// main ball and the goalie are deliberately excluded - they have their
// own gestures.
function isBodyDraggable(obj) {
  return !!obj && (state.chipGroups.includes(obj) || state.shapeObjects.includes(obj) || state.coneObjects.includes(obj) || state.extraBalls.includes(obj) || state.extraGoals.includes(obj));
}

export function deselectAll() {
  state.selectedSet = [];
  state.selected = null;
  hideRingsFrom(0);
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
let lmb = null;   // { downX, downY, lastX, lastY, hit, mode, additive, dragObjs, dragBase, dragOrigin, dragDelta }
// modes: 'idle' | 'obj-drag' | 'look' | 'path-handle' | 'shape-handle' | 'shape-drag' | 'marquee'

// Right-button state; null when the button isn't down.
let rmb = null;   // { downX, downY }

// --- marquee (box) multi-select -------------------------------------
// A screen-space rubber-band rect drawn on empty top-down floor. On release
// every chip (and, when state.marqueeIncludesShapes, every shape) whose
// projected anchor lands inside the rect is selected. Shift keeps the
// existing selection and unions the hits in.
const marqueeEl = document.createElement('div');
marqueeEl.id = 'marqueeRect';
marqueeEl.style.display = 'none';
document.body.appendChild(marqueeEl);

function updateMarqueeRect(x, y) {
  const x0 = Math.min(x, lmb.downX), y0 = Math.min(y, lmb.downY);
  marqueeEl.style.display = 'block';
  marqueeEl.style.left = x0 + 'px';
  marqueeEl.style.top = y0 + 'px';
  marqueeEl.style.width = Math.abs(x - lmb.downX) + 'px';
  marqueeEl.style.height = Math.abs(y - lmb.downY) + 'px';
}
function hideMarqueeRect() { marqueeEl.style.display = 'none'; }

const projV = new THREE.Vector3();
const projBox = new THREE.Box3();
function commitMarquee(captured, event) {
  const x0 = Math.min(event.clientX, captured.downX);
  const x1 = Math.max(event.clientX, captured.downX);
  const y0 = Math.min(event.clientY, captured.downY);
  const y1 = Math.max(event.clientY, captured.downY);
  // Sub-threshold drag = a click; treat as empty-floor deselect (unless
  // Shift, which then leaves the current selection untouched).
  if (x1 - x0 < DRAG_THRESHOLD && y1 - y0 < DRAG_THRESHOLD) {
    if (!captured.additive) deselectAll();
    return;
  }
  const cam = state.activeCamera;
  const w = window.innerWidth, h = window.innerHeight;
  const candidates = [...state.chipGroups];
  if (state.marqueeIncludesShapes) candidates.push(...state.shapeObjects);
  const hits = [];
  for (const obj of candidates) {
    if (!obj.visible) continue;
    if (state.chipGroups.includes(obj)) {
      projV.set(obj.position.x, 0, obj.position.z);
    } else {
      projBox.setFromObject(obj);
      projBox.getCenter(projV);
    }
    projV.project(cam);
    if (projV.z < -1 || projV.z > 1) continue; // behind the camera
    const sx = (projV.x * 0.5 + 0.5) * w;
    const sy = (-projV.y * 0.5 + 0.5) * h;
    if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) hits.push(obj);
  }
  if (captured.additive) addToSelection(hits);
  else setSelection(hits);
}

function selectablesUnderCursor(event) {
  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, state.activeCamera);
  const selectables = [...state.goalInstances, ...state.chipGroups, ...state.shapeObjects, ...state.coneObjects, ...state.extraBalls, ...state.extraGoals];
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

  // 2D top-down: left-drag on a chip or shape body moves it. If the grabbed
  // object is part of a multi-selection, the whole set translates by the drag
  // delta (relative offsets preserved). Grabbing something that ISN'T selected
  // makes it the sole selection first (RTS convention). Chips move via their
  // Object3D position; shapes bake world coords, so during the drag they only
  // get a transform offset - the doc coords are rewritten once on release.
  if (lmb.mode === 'obj-drag' || (lmb.mode === 'idle' && moved && isBodyDraggable(lmb.hit) && isTopDown() && !state.activeTool)) {
    if (lmb.mode !== 'obj-drag') {
      if (!state.selectedSet.includes(lmb.hit)) selectObject(lmb.hit);
      lmb.mode = 'obj-drag';
      const multi = state.selectedSet.includes(lmb.hit) && state.selectedSet.length > 1;
      const set = (multi ? state.selectedSet.slice() : [lmb.hit]).filter(isBodyDraggable);
      lmb.dragObjs = set;
      lmb.dragOrigin = p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
      lmb.dragBase = new Map();
      for (const o of set) lmb.dragBase.set(o, { x: o.position.x, z: o.position.z });
      lmb.dragDelta = { dx: 0, dz: 0 };
    }
    if (p) {
      const dx = p.x - lmb.dragOrigin.x;
      const dz = p.z - lmb.dragOrigin.z;
      for (const o of lmb.dragObjs) {
        const b = lmb.dragBase.get(o);
        o.position.x = b.x + dx;
        o.position.z = b.z + dz;
      }
      lmb.dragDelta = { dx, dz };
      applySelectionVisuals(); // refresh ring(s)/outline(s) under the moved objects
    }
    return;
  }

  // 2D top-down: left-drag starting on empty floor draws a marquee box.
  if (lmb.mode === 'marquee' || (lmb.mode === 'idle' && moved && !lmb.hit && isTopDown() && !state.activeTool)) {
    lmb.mode = 'marquee';
    updateMarqueeRect(event.clientX, event.clientY);
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
    additive: event.shiftKey, // Shift held at press -> union, not replace
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

  // Pre-hit-test so pointermove knows whether a drag should be an obj-drag,
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
  if (captured.mode === 'obj-drag') {
    const { dx, dz } = captured.dragDelta || { dx: 0, dz: 0 };
    const objs = captured.dragObjs || [];
    for (const o of objs) if (state.chipGroups.includes(o)) persistChipPosition(o);
    for (const o of objs) if (state.coneObjects.includes(o)) persistConePosition(o);
    for (const o of objs) if (state.extraBalls.includes(o)) persistBallPosition(o);
    for (const o of objs) if (state.extraGoals.includes(o)) import('./authoring/goals.js').then((g) => g.persistGoalPosition(o));
    const shapeIds = objs.filter((o) => state.shapeObjects.includes(o))
      .map((o) => o.userData.shape.id);
    if (shapeIds.length && (dx || dz)) {
      const remap = translateShapes(shapeIds, dx, dz);
      // translateShapes rebuilds each shape into a fresh Object3D - re-bind
      // the selection to those so rings / handles / inspector stay live.
      setSelection(state.selectedSet.map((o) => {
        const id = o?.userData?.shape?.id;
        return (id && remap.get(id)) || o;
      }));
    } else {
      applySelectionVisuals();
    }
    scheduleHistoryPush();
    return;
  }
  if (captured.mode === 'marquee') {
    hideMarqueeRect();
    commitMarquee(captured, event);
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
    // Shift-click adds/removes a chip or shape from the current selection.
    if (event.shiftKey && (state.chipGroups.includes(obj) || state.shapeObjects.includes(obj))) {
      toggleInSelection(obj);
      return;
    }
    if (state.selectedSet.length === 1 && state.selected === obj) deselectAll();
    else selectObject(obj);
    return;
  }

  // Empty floor click, no tool: deselect. Ball / goalie no longer teleport
  // on left click - use right-click (move command) or drag instead.
  if (p) coordClickEl.textContent = `x=${p.x.toFixed(0)}, z=${p.z.toFixed(0)} (tile ${tileLabelFor(p.x, p.z)})`;
  if (state.selectedSet.length) deselectAll();
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

  // 1b) Pass gesture: ball selected + right-click on a chip = hand the
  //     ball to that chip. Empty floor falls through to a move-command
  //     (which also detaches the ball from any current carrier).
  if (state.selected === state.ballGroup) {
    const chip = chipUnderCursor(event);
    if (chip) {
      import('./authoring/actors.js').then((a) => a.setBallCarrier(chip.userData.chip.id));
      spawnMoveMarker(chip.position.x, chip.position.z, { color: 0xffb347 });
      return;
    }
    // Move-command on empty floor: detach carrier first.
    import('./authoring/actors.js').then((a) => a.setBallCarrier(null));
  }

  // 2) Move-command on the selected chip / ball / goalie. Works in both 2D
  //    top-down and 3D perspective: the raycast against the floor plane is
  //    well-defined in either camera - only the visual "arc of the throw"
  //    would be more intuitive in top-down.
  const p = pointerToWorld(event);
  if (!p) return;

  // Multi-select (or a single shape): translate the whole selection so its
  // centroid lands on the click point, preserving every object's relative
  // offset (RTS "move group"). Chips use their position; shapes use their
  // bbox centre and get their doc coords rewritten via translateShapes.
  const dragObjs = state.selectedSet.filter(isBodyDraggable);
  if (dragObjs.length > 1 || (dragObjs.length === 1 && state.shapeObjects.includes(dragObjs[0]))) {
    const tmp = new THREE.Vector3();
    let cx = 0, cz = 0;
    for (const o of dragObjs) {
      if (state.chipGroups.includes(o)) { cx += o.position.x; cz += o.position.z; }
      else { new THREE.Box3().setFromObject(o).getCenter(tmp); cx += tmp.x; cz += tmp.z; }
    }
    cx /= dragObjs.length; cz /= dragObjs.length;
    const dx = p.x - cx, dz = p.z - cz;
    for (const o of dragObjs) {
      if (state.chipGroups.includes(o)) {
        const fromX = o.position.x, fromZ = o.position.z;
        o.position.x += dx;
        o.position.z += dz;
        persistChipPosition(o);
        startWalk(o, fromX, fromZ, o.position.x, o.position.z);
      } else if (state.coneObjects.includes(o)) {
        const fromX = o.position.x, fromZ = o.position.z;
        o.position.x += dx;
        o.position.z += dz;
        persistConePosition(o);
        startWalk(o, fromX, fromZ, o.position.x, o.position.z);
      } else if (state.extraBalls.includes(o)) {
        const fromX = o.position.x, fromZ = o.position.z;
        o.position.x += dx;
        o.position.z += dz;
        persistBallPosition(o);
        startWalk(o, fromX, fromZ, o.position.x, o.position.z);
      } else if (state.extraGoals.includes(o)) {
        const fromX = o.position.x, fromZ = o.position.z;
        o.position.x += dx;
        o.position.z += dz;
        import('./authoring/goals.js').then((g) => g.persistGoalPosition(o));
        startWalk(o, fromX, fromZ, o.position.x, o.position.z);
      }
    }
    const shapeIds = dragObjs.filter((o) => state.shapeObjects.includes(o))
      .map((o) => o.userData.shape.id);
    if (shapeIds.length) {
      const remap = translateShapes(shapeIds, dx, dz);
      setSelection(state.selectedSet.map((o) => {
        const id = o?.userData?.shape?.id;
        return (id && remap.get(id)) || o;
      }));
    } else {
      applySelectionVisuals();
    }
    scheduleHistoryPush();
    spawnMoveMarker(p.x, p.z);
    return;
  }

  const sel = state.selected;
  if (state.chipGroups.includes(sel)) {
    const fromX = sel.position.x, fromZ = sel.position.z;
    sel.position.x = p.x;
    sel.position.z = p.z;
    persistChipPosition(sel);
    scheduleHistoryPush();
    startWalk(sel, fromX, fromZ, p.x, p.z);   // snaps sel back to (fromX,fromZ)
    selectObject(sel);
    spawnMoveMarker(p.x, p.z);
  } else if (state.coneObjects.includes(sel)) {
    const fromX = sel.position.x, fromZ = sel.position.z;
    sel.position.x = p.x;
    sel.position.z = p.z;
    persistConePosition(sel);
    scheduleHistoryPush();
    startWalk(sel, fromX, fromZ, p.x, p.z);
    selectObject(sel);
    spawnMoveMarker(p.x, p.z);
  } else if (state.extraBalls.includes(sel)) {
    const fromX = sel.position.x, fromZ = sel.position.z;
    sel.position.x = p.x;
    sel.position.z = p.z;
    persistBallPosition(sel);
    scheduleHistoryPush();
    startWalk(sel, fromX, fromZ, p.x, p.z);
    selectObject(sel);
    spawnMoveMarker(p.x, p.z);
  } else if (state.extraGoals.includes(sel)) {
    const fromX = sel.position.x, fromZ = sel.position.z;
    sel.position.x = p.x;
    sel.position.z = p.z;
    import('./authoring/goals.js').then((g) => g.persistGoalPosition(sel));
    scheduleHistoryPush();
    startWalk(sel, fromX, fromZ, p.x, p.z);
    selectObject(sel);
    spawnMoveMarker(p.x, p.z);
  } else if (sel === state.ballGroup || sel === state.goalieGroup) {
    const fromX = sel.position.x, fromZ = sel.position.z;
    sel.position.x = p.x;
    sel.position.z = p.z;
    startWalk(sel, fromX, fromZ, p.x, p.z);
    selectObject(sel);
    spawnMoveMarker(p.x, p.z);
  }
}

// Suppress the browser context menu on the canvas so right-click is ours.
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
