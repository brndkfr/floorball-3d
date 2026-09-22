// Edit handles for the selected shape (zones + arrows). Mirrors
// path-handles.js's pattern (raycast against handle meshes, drag to
// mutate, save+push history on end). Handles live in a scene-level
// THREE.Group and follow selection changes via onSelectionChanged.
//
// Handle layout per kind:
//   rect      - 4 corners + 4 edge midpoints
//   circle    - 4 cardinal points on the circumference (any drags radius)
//   triangle  - 3 vertex handles (arbitrary triangle after first drag)
//   polygon   - 1 handle per point (freehand)
//   arrow     - 1 handle per point (drag to reshape, extend, or curve)

import * as THREE from 'three';
import { state } from '../state.js';
import { scene, topDownCamera } from '../scene.js';
import { ensureDoc } from './doc.js';
import { shapeDataFor, rebuildZonePoints, updateShape, TEXT_MIN_SIZE, TEXT_MAX_SIZE, TEXT_DEFAULT_SIZE } from './shapes.js';
import { onSelectionChanged } from '../selection.js';
import { isTopDown } from './topdown-camera.js';
import { saveDoc } from './storage.js';
import { topdownAxes, textCorners, resizeFromCornerDrag } from './text-resize-math.js';

const HANDLE_Y = 20;
const CORNER_COLOR = 0xffb347;
const EDGE_COLOR = 0x7ee06b;

const group = new THREE.Group();
group.visible = false;
scene.add(group);

const handleMeshes = [];   // { mesh, role: 'corner'|'edge'|'vertex'|'point', index, kind }
let outlineMesh = null;    // dotted bbox outline shown for text shapes

let currentShapeId = null;
let dragTarget = null;     // matches an entry in handleMeshes
let dragShape = null;      // mutable snapshot; committed on endDrag
let dragOrigBbox = null;   // bbox + size at drag start (text shapes only)

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function pointerToFloor(event) {
  ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, state.activeCamera);
  return raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint : null;
}

function makeHandleMesh(color, radius = 140) {
  const geom = new THREE.CircleGeometry(radius, 24);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

function disposeHandles() {
  for (const h of handleMeshes) {
    group.remove(h.mesh);
    h.mesh.geometry?.dispose?.();
    h.mesh.material?.dispose?.();
  }
  handleMeshes.length = 0;
  if (outlineMesh) {
    group.remove(outlineMesh);
    outlineMesh.geometry?.dispose?.();
    outlineMesh.material?.dispose?.();
    outlineMesh = null;
  }
}

// Dotted rectangle spanning the four given world-XZ corners at y=HANDLE_Y-5.
// Corners are supplied in NW,NE,SE,SW order so the rectangle can be tilted
// (text is a billboard, so its bbox axes rotate with the top-down view).
function makeDottedRect(corners) {
  const y = HANDLE_Y - 5;
  const [nw, ne, se, sw] = corners;
  const pts = new Float32Array([
    nw.x, y, nw.z,  ne.x, y, ne.z,
    ne.x, y, ne.z,  se.x, y, se.z,
    se.x, y, se.z,  sw.x, y, sw.z,
    sw.x, y, sw.z,  nw.x, y, nw.z,
  ]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const mat = new THREE.LineDashedMaterial({
    color: 0xffb347, dashSize: 200, gapSize: 150, depthTest: false, transparent: true, opacity: 0.9,
  });
  const line = new THREE.LineSegments(geom, mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  line.renderOrder = 3;
  return line;
}

// Screen-space axes of the top-down camera projected onto the floor plane.
// Sprite's local +Y aligns with camera up, +X with camera right - so a
// billboard's bbox is axis-aligned with these, not with world X/Z.
function topdownAxesFromCamera() {
  return topdownAxes(topDownCamera.up);
}

// World-XZ corners of the text sprite's tight bbox, oriented along the
// current top-down camera axes. Order: NW, NE, SE, SW (screen space).
function textCornersFromMesh(shapeId) {
  const mesh = state.shapeObjects.find((o) => o.userData.shape?.id === shapeId);
  if (!mesh) return null;
  const tight = mesh.userData?.textWorldBbox;
  const w = tight?.w ?? mesh.scale.x;
  const h = tight?.h ?? mesh.scale.y;
  const cx = mesh.position.x, cz = mesh.position.z;
  const { up, right } = topdownAxesFromCamera();
  return { w, h, cx, cz, right, up, corners: textCorners(cx, cz, w, h, right, up) };
}

function rectHandlePositions(s) {
  const { x = 0, z = 0, w = 0, h = 0 } = s;
  const cx = x + w / 2, cz = z + h / 2;
  return [
    { role: 'corner', index: 0, x, z },              // NW
    { role: 'corner', index: 1, x: x + w, z },        // NE
    { role: 'corner', index: 2, x: x + w, z: z + h }, // SE
    { role: 'corner', index: 3, x, z: z + h },        // SW
    { role: 'edge',   index: 0, x: cx, z },           // N
    { role: 'edge',   index: 1, x: x + w, z: cz },    // E
    { role: 'edge',   index: 2, x: cx, z: z + h },    // S
    { role: 'edge',   index: 3, x, z: cz },           // W
  ];
}

function circleHandlePositions(s) {
  const { cx = 0, cz = 0, r = 0 } = s;
  return [
    { role: 'edge', index: 0, x: cx, z: cz - r },
    { role: 'edge', index: 1, x: cx + r, z: cz },
    { role: 'edge', index: 2, x: cx, z: cz + r },
    { role: 'edge', index: 3, x: cx - r, z: cz },
  ];
}

function triangleHandlePositions(s) {
  const pts = s.points || [];
  return pts.map((p, i) => ({ role: 'vertex', index: i, x: p.x, z: p.z }));
}

function polygonHandlePositions(s) {
  return (s.points || []).map((p, i) => ({ role: 'point', index: i, x: p.x, z: p.z }));
}

function arrowHandlePositions(s) {
  return (s.points || []).map((p, i) => ({ role: 'point', index: i, x: p.x, z: p.z }));
}

function build() {
  disposeHandles();
  currentShapeId = null;
  const sel = state.selected;
  const shape = shapeDataFor(sel);
  // Edit handles are a single-shape concern - hide them during a multi-select.
  if (!shape || state.selectedSet.length > 1 || !isTopDown() || state.activeTool) {
    group.visible = false;
    return;
  }
  if (shape.type !== 'zone' && shape.type !== 'arrow' && shape.type !== 'text') {
    group.visible = false;
    return;
  }
  currentShapeId = shape.id;
  if (shape.type === 'text') {
    const info = textCornersFromMesh(shape.id);
    if (!info) { group.visible = false; return; }
    outlineMesh = makeDottedRect(info.corners);
    group.add(outlineMesh);
    info.corners.forEach((p, i) => {
      const mesh = makeHandleMesh(CORNER_COLOR, 260);
      mesh.position.set(p.x, HANDLE_Y, p.z);
      group.add(mesh);
      handleMeshes.push({ mesh, role: 'corner', index: i, kind: 'text' });
    });
    group.visible = true;
    return;
  }
  const kind = shape.type === 'arrow' ? 'arrow' : (shape.kind || 'polygon');
  let positions;
  if (kind === 'rect') positions = rectHandlePositions(shape);
  else if (kind === 'circle') positions = circleHandlePositions(shape);
  else if (kind === 'triangle') positions = triangleHandlePositions(shape);
  else if (kind === 'arrow') positions = arrowHandlePositions(shape);
  else positions = polygonHandlePositions(shape);

  for (const p of positions) {
    const color = p.role === 'corner' || p.role === 'vertex' || p.role === 'point'
      ? CORNER_COLOR : EDGE_COLOR;
    const mesh = makeHandleMesh(color);
    mesh.position.set(p.x, HANDLE_Y, p.z);
    group.add(mesh);
    handleMeshes.push({ mesh, role: p.role, index: p.index, kind });
  }
  group.visible = true;
}

// Defer the subscription past a microtask so `selection.js`'s module body
// finishes running first (this file is imported *from* selection.js -
// calling onSelectionChanged synchronously would hit its TDZ for
// selectionSubs).
Promise.resolve().then(() => onSelectionChanged(build));
document.addEventListener('layers:dirty', build);
document.addEventListener('topdownRotated', build);

export function refreshShapeHandles() { build(); }

export function tryStartDrag(event) {
  if (!group.visible) return false;
  ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, state.activeCamera);
  const meshes = handleMeshes.map((h) => h.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return false;
  const idx = meshes.indexOf(hits[0].object);
  dragTarget = handleMeshes[idx];
  const doc = ensureDoc();
  const shape = doc.scheme.shapes?.find((s) => s.id === currentShapeId);
  dragShape = shape ? JSON.parse(JSON.stringify(shape)) : null;
  dragOrigBbox = null;
  if (dragShape && dragShape.type === 'text') {
    const info = textCornersFromMesh(currentShapeId);
    if (info) {
      dragOrigBbox = {
        w: info.w, h: info.h, size: dragShape.size || TEXT_DEFAULT_SIZE,
        cx: info.cx, cz: info.cz,
        right: info.right, up: info.up,
      };
    }
  }
  return !!dragShape;
}

export function isDragging() { return dragTarget !== null; }

// Recompute the dragShape (parametric fields + points) after a handle move.
function applyDrag(worldX, worldZ) {
  if (!dragTarget || !dragShape) return;
  const t = dragTarget;
  if (t.kind === 'rect') {
    const s = dragShape;
    if (t.role === 'corner') {
      // Anchor is the diagonally opposite corner (fixed while dragging).
      const anchors = [
        { x: s.x + s.w, z: s.z + s.h }, // NW dragging -> anchor SE
        { x: s.x,       z: s.z + s.h }, // NE dragging -> anchor SW
        { x: s.x,       z: s.z },       // SE dragging -> anchor NW
        { x: s.x + s.w, z: s.z },       // SW dragging -> anchor NE
      ];
      const anc = anchors[t.index];
      const minX = Math.min(anc.x, worldX);
      const maxX = Math.max(anc.x, worldX);
      const minZ = Math.min(anc.z, worldZ);
      const maxZ = Math.max(anc.z, worldZ);
      s.x = minX; s.z = minZ; s.w = maxX - minX; s.h = maxZ - minZ;
    } else if (t.role === 'edge') {
      if (t.index === 0) { // N - move top edge
        const bottom = s.z + s.h;
        s.z = Math.min(worldZ, bottom - 1);
        s.h = bottom - s.z;
      } else if (t.index === 1) { // E
        s.w = Math.max(1, worldX - s.x);
      } else if (t.index === 2) { // S
        s.h = Math.max(1, worldZ - s.z);
      } else if (t.index === 3) { // W
        const right = s.x + s.w;
        s.x = Math.min(worldX, right - 1);
        s.w = right - s.x;
      }
    }
    rebuildZonePoints(s);
  } else if (t.kind === 'circle') {
    const s = dragShape;
    const dx = worldX - s.cx, dz = worldZ - s.cz;
    s.r = Math.max(50, Math.hypot(dx, dz));
    rebuildZonePoints(s);
  } else if (t.kind === 'triangle') {
    // Once any vertex moves, we drop to freeform triangle semantics: the
    // three points live on their own, bbox fields go stale (kept for
    // reference only). rebuildZonePoints is a no-op after this because it
    // reads bbox fields; we just mutate `points` directly.
    const s = dragShape;
    if (!s.points) rebuildZonePoints(s);
    s.points[t.index] = { x: worldX, z: worldZ };
    // Invalidate parametric fields so a future kind-check sees "custom".
    delete s.x; delete s.z; delete s.w; delete s.h;
  } else if (t.kind === 'arrow') {
    const s = dragShape;
    if (s.points && s.points[t.index]) s.points[t.index] = { x: worldX, z: worldZ };
  } else if (t.kind === 'text') {
    const s = dragShape;
    if (!dragOrigBbox) return;
    const orig = dragOrigBbox;
    const { newSize, newCx, newCz } = resizeFromCornerDrag({
      cx: orig.cx, cz: orig.cz, w: orig.w, h: orig.h, size: orig.size,
      right: orig.right, up: orig.up, cornerIndex: t.index,
      worldX, worldZ,
      minSize: TEXT_MIN_SIZE, maxSize: TEXT_MAX_SIZE,
    });
    s.size = newSize;
    s.x = newCx;
    s.z = newCz;
  } else {
    // polygon
    const s = dragShape;
    if (s.points && s.points[t.index]) s.points[t.index] = { x: worldX, z: worldZ };
  }
}

export function onDragMove(event) {
  if (!dragTarget) return false;
  const p = pointerToFloor(event);
  if (!p) return true;
  applyDrag(p.x, p.z);
  // Mutate the doc shape live and rebuild the mesh via updateShape's
  // in-place replace path; avoids a full rebuildShapesFromDoc.
  updateShape(currentShapeId, dragShape);
  // updateShape rebuilds handles via layers:dirty; that reassigns
  // handleMeshes but does NOT reassign dragTarget - it can go stale.
  // Instead, we manually reposition the same handle mesh, and defer the
  // handle rebuild to endDrag.
  const t = dragTarget;
  if (t.kind === 'text') {
    const info = textCornersFromMesh(currentShapeId);
    if (info) {
      for (const h of handleMeshes) {
        const c = info.corners[h.index];
        if (c) h.mesh.position.set(c.x, HANDLE_Y, c.z);
      }
      if (outlineMesh) {
        group.remove(outlineMesh);
        outlineMesh.geometry?.dispose?.();
        outlineMesh.material?.dispose?.();
      }
      outlineMesh = makeDottedRect(info.corners);
      group.add(outlineMesh);
    }
    return true;
  }
  const positions = t.kind === 'rect' ? rectHandlePositions(dragShape)
    : t.kind === 'circle' ? circleHandlePositions(dragShape)
    : t.kind === 'triangle' ? triangleHandlePositions(dragShape)
    : t.kind === 'arrow' ? arrowHandlePositions(dragShape)
    : polygonHandlePositions(dragShape);
  for (const h of handleMeshes) {
    const match = positions.find((pp) => pp.role === h.role && pp.index === h.index);
    if (match) h.mesh.position.set(match.x, HANDLE_Y, match.z);
  }
  return true;
}

export function endDrag() {
  if (!dragTarget) return;
  dragTarget = null;
  dragShape = null;
  dragOrigBbox = null;
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
  build();
}

// Also rebuild when top-down mode toggles or shapes are rebuilt from doc.
window.addEventListener('framesChanged', build);
