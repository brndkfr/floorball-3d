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

let previewObj = null;
let lastPointerWorld = null;
let textInputEl = null;

function clearPreview() {
  if (previewObj) {
    scene.remove(previewObj);
    previewObj.geometry?.dispose?.();
    previewObj.material?.dispose?.();
    previewObj = null;
  }
}

function makeShapeDraft(tool, points, extras = {}) {
  const color = '#ffb347';
  if (tool === 'arrow') return { type: 'arrow', color, width: 60, points };
  if (tool === 'zone') return { type: 'zone', color, opacity: 0.3, points };
  if (tool === 'text') return { type: 'text', color, x: extras.x, z: extras.z, text: extras.text || '', size: 1000 };
  return null;
}

// Called every animation frame from main.js. Rebuilds the ghost preview
// from the current in-progress points + the last known pointer position.
export function updateDrawPreview() {
  const ds = state.drawState;
  if (!ds || !ds.points.length) return;
  const cursor = lastPointerWorld;
  if (!cursor) return;
  const points = ds.tool === 'zone' ? [...ds.points, { x: cursor.x, z: cursor.z }] : [ds.points[0], { x: cursor.x, z: cursor.z }];
  const draft = makeShapeDraft(ds.tool, points);
  if (!draft) return;
  const obj = buildShapeObject(draft, { ghost: true });
  if (!obj) return;
  clearPreview();
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
  const draft = makeShapeDraft(ds.tool, ds.points);
  if (draft) addShape(draft);
  cancelDrawing();
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
