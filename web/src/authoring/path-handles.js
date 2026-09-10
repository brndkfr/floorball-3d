// Bezier path handles + live path preview for the selected chip (A5).
// Shown only in 2D top-down mode when a chip is selected and there's a
// next frame that also has that player. Two draggable spheres set
// pa.im1 (outgoing control from the current frame) and pb.im2 (incoming
// control at the destination frame). Missing im1/im2 default to the
// straight-line 1/3 and 2/3 positions.
//
// A dashed line preview traces the current bezier so the user sees what
// the arc will look like without needing to play back.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { bezierPos } from './playback.js';
import { saveDoc } from './storage.js';
import { isTopDown } from './topdown-camera.js';

const HANDLE_RADIUS = 120;   // world mm; visible from top-down
const HANDLE_Y = 30;         // just above the rink surface

const group = new THREE.Group();
group.visible = false;
scene.add(group);

const handle1 = makeHandle(0x2fbf4e);   // green: outgoing (from current frame)
const handle2 = makeHandle(0xd94b2f);   // red:   incoming (to next frame)
group.add(handle1);
group.add(handle2);

// Dashed bezier curve preview.
const curveGeom = new THREE.BufferGeometry();
const curveMat = new THREE.LineDashedMaterial({ color: 0xffb347, dashSize: 200, gapSize: 120, depthTest: false });
const curve = new THREE.Line(curveGeom, curveMat);
curve.renderOrder = 2;
curve.frustumCulled = false;
group.add(curve);

// Small numbered discs at each frame's chip position for the selected id.
const waypoints = new THREE.Group();
group.add(waypoints);

function makeHandle(color) {
  const geom = new THREE.SphereGeometry(HANDLE_RADIUS, 16, 12);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 3;
  mesh.userData.isPathHandle = true;
  return mesh;
}

let currentChipId = null;
let currentFrameIdx = 0;
let dragTarget = null;   // 'im1' | 'im2' | null

// Public entry: call whenever selection changes.
export function refreshForSelection() {
  // Path editing is a single-chip concern - suppress it during a multi-select.
  currentChipId = state.selectedSet.length > 1 ? null : (state.selected?.userData?.chip?.id || null);
  hideIfInvalid();
}

// Refresh the visible geometry to reflect the current doc + frame + selection.
export function rebuild() {
  hideIfInvalid();
  if (!group.visible) return;

  const doc = ensureDoc();
  const frames = doc.frames;
  const k = doc.currentFrame;
  currentFrameIdx = k;
  const pa = frames[k]?.scheme.players[currentChipId];
  const pb = frames[k + 1]?.scheme.players[currentChipId];
  if (!pa || !pb) { group.visible = false; return; }

  const c1x = pa.im1 ? pa.x + pa.im1.dx : pa.x + (pb.x - pa.x) / 3;
  const c1z = pa.im1 ? pa.z + pa.im1.dz : pa.z + (pb.z - pa.z) / 3;
  const c2x = pb.im2 ? pb.x + pb.im2.dx : pa.x + 2 * (pb.x - pa.x) / 3;
  const c2z = pb.im2 ? pb.z + pb.im2.dz : pa.z + 2 * (pb.z - pa.z) / 3;

  handle1.position.set(c1x, HANDLE_Y, c1z);
  handle2.position.set(c2x, HANDLE_Y, c2z);

  // Sample the bezier for the dashed preview (32 segments is plenty).
  const N = 32;
  const pts = new Float32Array((N + 1) * 3);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts[i * 3] = bezierPos(pa.x, pb.x, c1x, c2x, t);
    pts[i * 3 + 1] = 8;
    pts[i * 3 + 2] = bezierPos(pa.z, pb.z, c1z, c2z, t);
  }
  curveGeom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  curveGeom.computeBoundingSphere();
  curve.computeLineDistances();

  // Waypoint discs at every frame the chip appears in (not just k..k+1).
  disposeChildren(waypoints);
  for (let i = 0; i < frames.length; i++) {
    const p = frames[i].scheme.players[currentChipId];
    if (!p) continue;
    const isCurrent = i === k;
    const g = new THREE.Mesh(
      new THREE.RingGeometry(180, 260, 32),
      new THREE.MeshBasicMaterial({ color: isCurrent ? 0xffb347 : 0x7ee06b, depthTest: false, transparent: true, opacity: isCurrent ? 0.9 : 0.5 }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(p.x, 6, p.z);
    g.renderOrder = 2;
    waypoints.add(g);
  }
}

function disposeChildren(g) {
  for (const c of g.children.slice()) {
    g.remove(c);
    c.geometry?.dispose?.();
    c.material?.dispose?.();
  }
}

function hideIfInvalid() {
  const doc = ensureDoc();
  const k = doc.currentFrame;
  const chip = currentChipId;
  const pa = chip && doc.frames[k]?.scheme.players[chip];
  const pb = chip && doc.frames[k + 1]?.scheme.players[chip];
  const show = !!(chip && pa && pb && !state.playback?.playing && isTopDown() && !state.activeTool);
  group.visible = show;
}

// --- drag handling ---------------------------------------------------
// Called from selection.js's pointer handlers. Returns true if the handle
// captured the pointerdown/pointermove so the caller skips its normal
// select/drag logic.

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function pointerToWorld(event) {
  ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, state.activeCamera);
  return raycaster.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint : null;
}

export function tryStartDrag(event) {
  if (!group.visible) return false;
  ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, state.activeCamera);
  const hits = raycaster.intersectObjects([handle1, handle2], false);
  if (hits.length === 0) return false;
  dragTarget = (hits[0].object === handle1) ? 'im1' : 'im2';
  return true;
}

export function isDragging() { return dragTarget !== null; }

export function onDragMove(event) {
  if (!dragTarget) return false;
  const p = pointerToWorld(event);
  if (!p) return true;
  const doc = ensureDoc();
  const k = doc.currentFrame;
  if (dragTarget === 'im1') {
    const pa = doc.frames[k].scheme.players[currentChipId];
    pa.im1 = { dx: p.x - pa.x, dz: p.z - pa.z };
  } else {
    const pb = doc.frames[k + 1].scheme.players[currentChipId];
    pb.im2 = { dx: p.x - pb.x, dz: p.z - pb.z };
  }
  rebuild();
  return true;
}

export function endDrag() {
  if (!dragTarget) return;
  dragTarget = null;
  saveDoc();
  import('./history.js').then((h) => h.pushHistory());
}

// Rebuild whenever anything relevant changes.
window.addEventListener('framesChanged', rebuild);
window.addEventListener('playbackChanged', rebuild);
