// Draw-tool state machine. While a shape tool is active, floor clicks route
// here instead of moving the selected object (see dock.js's
// handleFloorClickForTool). Ghost preview follows the cursor between clicks.
//
// A2 supports:
//   arrow         - 2 clicks (start, end), auto-commits on the 2nd (straight)
//   arrow-curved  - N clicks; Enter / double-click / right-click commits (>=2)
//   zone   - N clicks, close by clicking near point 0 (>= 3 points), or Enter
//   text   - 1 click -> inline <input> at the click point, Enter commits
//
// Zone primitives (rect / circle / triangle) use a drag pipeline instead of
// discrete clicks: begin/update/commit called from selection.js's lmb
// tracker. A short drag (or a single click) still commits with a small
// default size, so pure-clicks aren't a dead end.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { pointerToWorld } from '../selection.js';
import { buildShapeObject, addShape, rebuildZonePoints } from './shapes.js';

const ZONE_CLOSE_TOLERANCE = 500;   // mm - click within this of point 0 closes the zone
const PREVIEW_Y = 8;                // above SHAPE_Y so preview never z-fights with committed shapes
const PRIMITIVE_MIN_SIZE = 400;     // mm - below this, a drag-then-release commits at DEFAULT_SIZE instead
const PRIMITIVE_DEFAULT_SIZE = 3000; // mm - single-click size for rect/triangle side, circle diameter
const PRIMITIVE_TOOLS = new Set(['zone-rect', 'zone-circle', 'zone-triangle']);
export function isPrimitiveTool(tool) { return PRIMITIVE_TOOLS.has(tool); }

let previewObj = null;
let lastPointerWorld = null;
let textInputEl = null;

function clearPreview() {
  if (previewObj) {
    scene.remove(previewObj);
    previewObj.traverse?.((n) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });
    previewObj.geometry?.dispose?.();
    previewObj.material?.dispose?.();
    previewObj = null;
  }
}

function makeShapeDraft(tool, points, extras = {}) {
  const color = state.drawColor || '#ffb347';
  if (tool === 'arrow') return { type: 'arrow', color, width: 80, points, shaftStyle: 'solid', headStyle: 'filled', smooth: false };
  if (tool === 'arrow-curved') return { type: 'arrow', color, width: 80, points, shaftStyle: 'solid', headStyle: 'filled', smooth: true };
  if (tool === 'zone') return { type: 'zone', kind: 'polygon', color, opacity: 0.3, points };
  if (tool === 'text') return { type: 'text', color, x: extras.x, z: extras.z, text: extras.text || '', size: 1000 };
  return null;
}

// Build a primitive-kind zone from two world points (drag start + current).
// The single-click case (start ~= end) is handled by the caller passing an
// expanded end point so we always get a sane bbox.
function makePrimitiveDraft(tool, start, end) {
  const color = state.drawColor || '#ffb347';
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);
  const w = maxX - minX;
  const h = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  if (tool === 'zone-rect') {
    const shape = { type: 'zone', kind: 'rect', color, opacity: 0.3, x: minX, z: minZ, w, h };
    rebuildZonePoints(shape);
    return shape;
  }
  if (tool === 'zone-circle') {
    const r = Math.max(w, h) / 2;
    const shape = { type: 'zone', kind: 'circle', color, opacity: 0.3, cx, cz, r };
    rebuildZonePoints(shape);
    return shape;
  }
  if (tool === 'zone-triangle') {
    const shape = { type: 'zone', kind: 'triangle', color, opacity: 0.3, x: minX, z: minZ, w, h };
    rebuildZonePoints(shape);
    return shape;
  }
  return null;
}

// Build the zone drafting preview: an open polyline from p0..pN..cursor,
// small dots at every committed corner, and a bigger dot at p0 that turns
// green when the cursor is within the close tolerance (>=3 corners) to
// hint "click here to close".
function buildZonePreview(committedPoints, cursor) {
  const color = new THREE.Color(state.drawColor || '#ffb347');
  const group = new THREE.Group();
  group.frustumCulled = false;
  const all = [...committedPoints, cursor];
  // outline polyline (open) - drawn as a LineSegments so segments update cheaply
  const segPositions = new Float32Array((all.length - 1) * 2 * 3);
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i], b = all[i + 1];
    segPositions.set([a.x, PREVIEW_Y, a.z, b.x, PREVIEW_Y, b.z], i * 6);
  }
  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute('position', new THREE.BufferAttribute(segPositions, 3));
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const line = new THREE.LineSegments(lineGeom, lineMat);
  line.frustumCulled = false;
  group.add(line);
  // dashed line from cursor back to p0 once we can close, hinting the close edge
  if (committedPoints.length >= 3) {
    const p0 = committedPoints[0];
    const closeGeom = new THREE.BufferGeometry();
    closeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      cursor.x, PREVIEW_Y, cursor.z, p0.x, PREVIEW_Y, p0.z,
    ]), 3));
    const closeMat = new THREE.LineDashedMaterial({ color: 0x7ee06b, dashSize: 200, gapSize: 200, transparent: true, opacity: 0.9, depthWrite: false });
    const closeLine = new THREE.Line(closeGeom, closeMat);
    closeLine.computeLineDistances();
    closeLine.frustumCulled = false;
    group.add(closeLine);
  }
  // corner dots
  const dotGeom = new THREE.CircleGeometry(90, 16);
  dotGeom.rotateX(-Math.PI / 2);
  for (const p of committedPoints) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    const dot = new THREE.Mesh(dotGeom, mat);
    dot.position.set(p.x, PREVIEW_Y + 1, p.z);
    dot.frustumCulled = false;
    group.add(dot);
  }
  // first-point close hint: green pulsing ring when cursor is within tolerance
  if (committedPoints.length >= 3) {
    const p0 = committedPoints[0];
    const near = Math.hypot(cursor.x - p0.x, cursor.z - p0.z) < ZONE_CLOSE_TOLERANCE;
    const ringGeom = new THREE.RingGeometry(near ? 220 : 140, near ? 320 : 200, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7ee06b, side: THREE.DoubleSide, transparent: true, opacity: near ? 0.95 : 0.7, depthWrite: false });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.set(p0.x, PREVIEW_Y + 2, p0.z);
    ring.frustumCulled = false;
    group.add(ring);
  }
  return group;
}

// Called every animation frame from main.js. Rebuilds the ghost preview
// from the current in-progress points + the last known pointer position.
export function updateDrawPreview() {
  const ds = state.drawState;
  if (!ds) return;
  // Primitive drag mode: preview built from drag.start + drag.cur, not from
  // committed points. If the drag hasn't started yet, no preview.
  if (isPrimitiveTool(ds.tool)) {
    if (!ds.drag) return;
    clearPreview();
    const draft = makePrimitiveDraft(ds.tool, ds.drag.start, ds.drag.cur);
    if (!draft) return;
    const obj = buildShapeObject(draft, { ghost: true });
    if (!obj) return;
    previewObj = obj;
    scene.add(previewObj);
    return;
  }
  if (!ds.points.length) return;
  const cursor = lastPointerWorld;
  if (!cursor) return;
  clearPreview();
  if (ds.tool === 'zone') {
    previewObj = buildZonePreview(ds.points, cursor);
    scene.add(previewObj);
    return;
  }
  const points = (ds.tool === 'arrow' || ds.tool === 'arrow-curved')
    ? [...ds.points, { x: cursor.x, z: cursor.z }]
    : [ds.points[0], { x: cursor.x, z: cursor.z }];
  const draft = makeShapeDraft(ds.tool, points);
  if (!draft) return;
  const obj = buildShapeObject(draft, { ghost: true });
  if (!obj) return;
  previewObj = obj;
  scene.add(previewObj);
}

// Called from selection.js's pointermove handler to keep the ghost preview
// following the cursor even between committed clicks.
export function setPointerHint(worldPoint) {
  lastPointerWorld = worldPoint ? { x: worldPoint.x, z: worldPoint.z } : null;
}

export function startDrawing(tool) {
  cancelDrawing();
  state.drawState = { tool, points: [] };
}

export function cancelDrawing() {
  clearPreview();
  hideTextInput();
  state.drawState = null;
}

// Return true if we consumed the click; dock.js falls through to selection
// logic otherwise. Called from selection.js's pointerup handler.
export function handleFloorClick(worldPoint) {
  const ds = state.drawState;
  if (!ds) return false;
  const p = { x: worldPoint.x, z: worldPoint.z };
  if (ds.tool === 'text') {
    showTextInput(worldPoint);
    return true;
  }
  if (ds.tool === 'arrow') {
    ds.points.push(p);
    if (ds.points.length >= 2) commitCurrent();
    return true;
  }
  if (ds.tool === 'arrow-curved') {
    ds.points.push(p);
    return true;
  }
  if (ds.tool === 'zone') {
    // clicking near point 0 with >= 3 points closes the polygon
    if (ds.points.length >= 3) {
      const p0 = ds.points[0];
      if (Math.hypot(p.x - p0.x, p.z - p0.z) < ZONE_CLOSE_TOLERANCE) {
        commitCurrent();
        return true;
      }
    }
    ds.points.push(p);
    return true;
  }
  return false;
}

function commitCurrent() {
  const ds = state.drawState;
  if (!ds) return;
  const tool = ds.tool;
  const draft = makeShapeDraft(tool, ds.points);
  if (draft) addShape(draft);
  clearPreview();
  // stay in the tool so the user can drop another shape immediately
  state.drawState = { tool, points: [] };
}

// Called from dock.js's Enter/double-click handlers. Commits a zone when
// it already has >= 3 points; ignored otherwise.
export function tryCommitZone() {
  const ds = state.drawState;
  if (!ds || ds.tool !== 'zone' || ds.points.length < 3) return false;
  commitCurrent();
  return true;
}

// Commit the in-progress arrow (>= 2 points). Called from Enter,
// double-click, or right-click while the arrow / arrow-curved tool is active.
export function tryCommitArrow() {
  const ds = state.drawState;
  if (!ds || (ds.tool !== 'arrow' && ds.tool !== 'arrow-curved')) return false;
  if (ds.points.length < 2) return false;
  commitCurrent();
  return true;
}

export function drawPointCount() {
  return state.drawState?.points?.length ?? 0;
}

// --- primitive drag pipeline (rect / circle / triangle) --------------
// Called from selection.js's lmb handler when a primitive tool is active.
// The whole "click without drag -> commit a small default-sized primitive
// at the click point" convenience is handled here so single-clickers don't
// hit a dead end.

export function beginPrimitiveDrag(worldPoint) {
  const ds = state.drawState;
  if (!ds || !isPrimitiveTool(ds.tool)) return;
  ds.drag = {
    start: { x: worldPoint.x, z: worldPoint.z },
    cur: { x: worldPoint.x, z: worldPoint.z },
  };
}

export function updatePrimitiveDrag(worldPoint) {
  const ds = state.drawState;
  if (!ds?.drag || !isPrimitiveTool(ds.tool)) return;
  ds.drag.cur = { x: worldPoint.x, z: worldPoint.z };
}

// Returns true if a shape was committed. Caller (selection.js) uses the
// return only to decide whether to short-circuit its own click handler -
// today we always commit (single-click -> default-size primitive), so the
// caller never falls through to selection logic while a primitive tool is
// active.
export function commitPrimitiveDrag() {
  const ds = state.drawState;
  if (!ds || !isPrimitiveTool(ds.tool)) return false;
  const drag = ds.drag;
  ds.drag = null;
  clearPreview();
  if (!drag) return false;
  let end = drag.cur;
  const dx = Math.abs(drag.cur.x - drag.start.x);
  const dz = Math.abs(drag.cur.z - drag.start.z);
  if (dx < PRIMITIVE_MIN_SIZE && dz < PRIMITIVE_MIN_SIZE) {
    // Treat as a click -> commit a default-sized primitive centred on the
    // click point instead of leaving the user with nothing.
    const half = PRIMITIVE_DEFAULT_SIZE / 2;
    drag.start = { x: drag.start.x - half, z: drag.start.z - half };
    end = { x: drag.start.x + PRIMITIVE_DEFAULT_SIZE, z: drag.start.z + PRIMITIVE_DEFAULT_SIZE };
  }
  const draft = makePrimitiveDraft(ds.tool, drag.start, end);
  if (draft) addShape(draft);
  return true;
}

export function cancelPrimitiveDrag() {
  const ds = state.drawState;
  if (!ds) return;
  ds.drag = null;
  clearPreview();
}

// --- text input popover -----------------------------------------------

function showTextInput(worldPoint) {
  hideTextInput();
  const screen = worldToScreen(worldPoint);
  if (!screen) return;
  const el = document.createElement('input');
  el.type = 'text';
  el.className = 'draw-text-input';
  el.placeholder = 'label...';
  el.style.left = screen.x + 'px';
  el.style.top = screen.y + 'px';
  document.body.appendChild(el);
  el.focus();
  textInputEl = el;
  const submit = () => {
    if (!textInputEl) return;   // already submitted
    const text = el.value.trim();
    hideTextInput();
    if (text) addShape(makeShapeDraft('text', [], { x: worldPoint.x, z: worldPoint.z, text }));
    // stay in text tool so the user can drop another label immediately
  };
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); hideTextInput(); }
    ev.stopPropagation();   // don't let Esc bubble to dock.js's global handler
  });
  el.addEventListener('blur', submit);
}

function hideTextInput() {
  if (textInputEl) {
    textInputEl.remove?.();
    textInputEl = null;
  }
}

function worldToScreen(world) {
  const v = new THREE.Vector3(world.x, world.y ?? 0, world.z).project(state.activeCamera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}
