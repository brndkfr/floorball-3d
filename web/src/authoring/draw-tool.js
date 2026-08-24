// Draw-tool state machine. While a shape tool is active, floor clicks route
// here instead of moving the selected object (see dock.js's
// handleFloorClickForTool). Ghost preview follows the cursor between clicks.
//
// A2 supports:
//   arrow  - 2 clicks (start, end), auto-commits on the 2nd
//   zone   - N clicks, close by clicking near point 0 (>= 3 points), or Enter
//   text   - 1 click -> inline <input> at the click point, Enter commits

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { pointerToWorld } from '../selection.js';
import { buildShapeObject, addShape } from './shapes.js';

const ZONE_CLOSE_TOLERANCE = 500;   // mm - click within this of point 0 closes the zone
const PREVIEW_Y = 8;                // above SHAPE_Y so preview never z-fights with committed shapes

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
  if (tool === 'arrow') return { type: 'arrow', color, width: 60, points };
  if (tool === 'zone') return { type: 'zone', color, opacity: 0.3, points };
  if (tool === 'text') return { type: 'text', color, x: extras.x, z: extras.z, text: extras.text || '', size: 1000 };
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
  if (!ds || !ds.points.length) return;
  const cursor = lastPointerWorld;
  if (!cursor) return;
  clearPreview();
  if (ds.tool === 'zone') {
    previewObj = buildZonePreview(ds.points, cursor);
    scene.add(previewObj);
    return;
  }
  const points = [ds.points[0], { x: cursor.x, z: cursor.z }];
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

export function drawPointCount() {
  return state.drawState?.points?.length ?? 0;
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
