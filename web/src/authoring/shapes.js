// Shape objects: arrows, zones, text labels rendered flat on the rink.
//
// All shapes live at Y ~= 5 mm (above IFF markings at y=2, above the grid
// overlay at y=2.5) so they never z-fight with the rink surface. The scene
// mounts three layer groups (low / mid / high) added to `state.shapesRoot`
// in order; a shape is placed into the group matching its `layer` field.
//
// A single Shape doc entry (see docs/floorball-3d-authoring-plan.md §3.2)
// becomes one Object3D, tagged with `userData.shape = { id, type }` so
// selection.js can round-trip clicks back to the doc.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { ensureDoc, newId } from './doc.js';
import { saveDoc } from './storage.js';

const ARROW_BODY_HALF_W = 40;    // mm
const ARROW_HEAD_LEN = 400;
const ARROW_HEAD_HALF_W = 160;
const SHAPE_Y = 5;               // just above IFF markings + grid overlay

// --- one-time scene setup ---------------------------------------------

state.shapesRoot = new THREE.Group();
scene.add(state.shapesRoot);

const layerGroups = {
  low: new THREE.Group(),
  mid: new THREE.Group(),
  high: new THREE.Group(),
};
// order matters for renderOrder-agnostic overdraw: low added first
state.shapesRoot.add(layerGroups.low, layerGroups.mid, layerGroups.high);

// --- geometry builders ------------------------------------------------

function buildArrowGeometry(points) {
  const [a, b] = points;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;      // forward unit
  const nx = -uz, nz = ux;                 // left-perp unit
  const bodyLen = Math.max(len - ARROW_HEAD_LEN, 0);
  // shaft rectangle from a to (a + ux*bodyLen), width 2*ARROW_BODY_HALF_W
  const sx = a.x, sz = a.z;
  const ex = a.x + ux * bodyLen, ez = a.z + uz * bodyLen;
  const bl = { x: sx + nx * ARROW_BODY_HALF_W, z: sz + nz * ARROW_BODY_HALF_W };
  const br = { x: sx - nx * ARROW_BODY_HALF_W, z: sz - nz * ARROW_BODY_HALF_W };
  const tl = { x: ex + nx * ARROW_BODY_HALF_W, z: ez + nz * ARROW_BODY_HALF_W };
  const tr = { x: ex - nx * ARROW_BODY_HALF_W, z: ez - nz * ARROW_BODY_HALF_W };
  // arrowhead triangle: tip at b, base perpendicular at (ex, ez)
  const hl = { x: ex + nx * ARROW_HEAD_HALF_W, z: ez + nz * ARROW_HEAD_HALF_W };
  const hr = { x: ex - nx * ARROW_HEAD_HALF_W, z: ez - nz * ARROW_HEAD_HALF_W };
  const tip = { x: b.x, z: b.z };
  const positions = new Float32Array([
    // body two triangles
    bl.x, SHAPE_Y, bl.z,   tl.x, SHAPE_Y, tl.z,   tr.x, SHAPE_Y, tr.z,
    bl.x, SHAPE_Y, bl.z,   tr.x, SHAPE_Y, tr.z,   br.x, SHAPE_Y, br.z,
    // arrowhead triangle
    hl.x, SHAPE_Y, hl.z,   tip.x, SHAPE_Y, tip.z, hr.x, SHAPE_Y, hr.z,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

function buildZoneGeometry(points) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
  shape.lineTo(points[0].x, points[0].z);
  const g = new THREE.ShapeGeometry(shape);
  // Shape's local Y (2D) becomes world Z: rotate +90 deg around X, not -90,
  // so that shape-space (px, pz) maps to world (x, 0, +pz).
  g.rotateX(Math.PI / 2);
  g.translate(0, SHAPE_Y - 1, 0);   // slightly under arrows so they draw on top
  return g;
}

// Rebuild `points` for a primitive-kind zone from its parametric fields.
// Kept as an exported helper so shape-handles.js can call it after a drag
// mutation before writing back to the doc. Circles get 48 vertices - fine
// for both rendering and the coverage/trajectory math (they don't consume
// zone points).
const CIRCLE_SEGMENTS = 48;
export function rebuildZonePoints(shape) {
  if (!shape) return;
  const kind = shape.kind || 'polygon';
  if (kind === 'rect') {
    const { x = 0, z = 0, w = 0, h = 0 } = shape;
    shape.points = [
      { x, z },
      { x: x + w, z },
      { x: x + w, z: z + h },
      { x, z: z + h },
    ];
  } else if (kind === 'circle') {
    const { cx = 0, cz = 0, r = 0 } = shape;
    const pts = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r });
    }
    shape.points = pts;
  } else if (kind === 'triangle') {
    // Isoceles pointing "up" (toward -z) inscribed in { x,z,w,h }. Apex
    // handles are stored explicitly so a rotated triangle only needs to
    // update `points` and can drop back to arbitrary-triangle semantics.
    const { x = 0, z = 0, w = 0, h = 0 } = shape;
    shape.points = [
      { x: x + w / 2, z },        // apex top
      { x: x + w, z: z + h },     // base right
      { x, z: z + h },            // base left
    ];
  }
  // polygon: caller manages points directly.
}

function makeTextSprite(text, color) {
  const font = 'bold 96px system-ui, sans-serif';
  const padding = 24;
  // measure first so long strings don't get clipped by a fixed-size canvas
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  mctx.font = font;
  const textWidth = Math.ceil(mctx.measureText(text || ' ').width);
  const height = 128;
  const width = Math.max(height, textWidth + padding * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 8;
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 2;
  const worldHeight = 1500;
  sprite.scale.set(worldHeight * (width / height), worldHeight, 1);
  return sprite;
}

// --- shape -> Object3D ------------------------------------------------

// Build the visual Object3D for a shape doc entry. Also used by draw-tool.js
// to build the ghost preview (with reduced opacity).
export function buildShapeObject(shape, { ghost = false } = {}) {
  const color = new THREE.Color(shape.color || '#ffb347');
  const opacity = ghost ? 0.35 : (shape.type === 'zone' ? (shape.opacity ?? 0.35) : 0.95);
  if (shape.type === 'arrow' && shape.points.length >= 2) {
    const g = buildArrowGeometry(shape.points);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1;
    return mesh;
  }
  if (shape.type === 'zone' && shape.points.length >= 3) {
    const g = buildZoneGeometry(shape.points);
    if (!g) return null;
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    return new THREE.Mesh(g, m);
  }
  if (shape.type === 'text') {
    const sprite = makeTextSprite(shape.text || '', '#' + color.getHexString());
    sprite.position.set(shape.x, SHAPE_Y + 200, shape.z);
    sprite.material.opacity = opacity;
    return sprite;
  }
  return null;
}

// --- CRUD -------------------------------------------------------------

function layerFor(shape) {
  if (shape.layer) return shape.layer;
  if (shape.type === 'zone') return 'low';
  if (shape.type === 'text') return 'high';
  return 'mid';
}

function attachShape(shape) {
  const obj = buildShapeObject(shape);
  if (!obj) return null;
  obj.userData.shape = { id: shape.id, type: shape.type };
  obj.visible = !shape.hidden;
  layerGroups[layerFor(shape)].add(obj);
  state.shapeObjects.push(obj);
  return obj;
}

export function addShape(shape) {
  const doc = ensureDoc();
  if (!doc.scheme.shapes) doc.scheme.shapes = [];
  if (!shape.id) shape.id = newId('s');
  doc.scheme.shapes.push(shape);
  attachShape(shape);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
  return shape.id;
}

export function removeShape(id) {
  const doc = ensureDoc();
  const idx = doc.scheme.shapes?.findIndex((s) => s.id === id) ?? -1;
  if (idx < 0) return;
  doc.scheme.shapes.splice(idx, 1);
  const oi = state.shapeObjects.findIndex((o) => o.userData.shape && o.userData.shape.id === id);
  if (oi >= 0) {
    const obj = state.shapeObjects[oi];
    obj.parent?.remove(obj);
    disposeObject(obj);
    state.shapeObjects.splice(oi, 1);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function setShapeHidden(id, hidden) {
  const doc = ensureDoc();
  const shape = doc.scheme.shapes?.find((s) => s.id === id);
  if (!shape) return;
  const next = !!hidden;
  if (!!shape.hidden === next) return;
  if (next) shape.hidden = true; else delete shape.hidden;
  const obj = state.shapeObjects.find((o) => o.userData.shape && o.userData.shape.id === id);
  if (obj) obj.visible = !next;
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

// Replace the object for `id` in-place: mutate the doc shape, remove the
// old Object3D from its layer group, rebuild, and re-attach. Preserves the
// selection ring by re-selecting if the shape was selected before.
export function updateShape(id, patch) {
  const doc = ensureDoc();
  const shape = doc.scheme.shapes?.find((s) => s.id === id);
  if (!shape) return;
  Object.assign(shape, patch);
  const oi = state.shapeObjects.findIndex((o) => o.userData.shape && o.userData.shape.id === id);
  const wasSelected = oi >= 0 && state.selected === state.shapeObjects[oi];
  if (oi >= 0) {
    const old = state.shapeObjects[oi];
    old.parent?.remove(old);
    disposeObject(old);
    state.shapeObjects.splice(oi, 1);
  }
  const obj = attachShape(shape);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
  if (wasSelected && obj) {
    import('../selection.js').then((s) => s.selectObject(obj));
  }
  return obj;
}

function disposeObject(obj) {
  obj.traverse?.((child) => {
    if (child.isMesh) {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    if (child.isSprite) {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
  });
  if (obj.isSprite) {
    obj.material?.map?.dispose?.();
    obj.material?.dispose?.();
  }
}

// Called from authoring/index.js (initial load) and history.js (undo/redo).
export function rebuildShapesFromDoc() {
  for (const obj of state.shapeObjects) {
    obj.parent?.remove(obj);
    disposeObject(obj);
  }
  state.shapeObjects.length = 0;
  const doc = ensureDoc();
  const shapes = doc.scheme.shapes || [];
  for (const s of shapes) attachShape(s);
  document.dispatchEvent(new CustomEvent('layers:dirty'));
}

// --- helpers used by draw-tool.js and dock.js -------------------------

export function shapeDataFor(obj) {
  const meta = obj?.userData?.shape;
  if (!meta) return null;
  const doc = ensureDoc();
  return doc.scheme.shapes?.find((s) => s.id === meta.id) || null;
}
