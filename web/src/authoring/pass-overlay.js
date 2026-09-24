// Pass overlay (A-BACK-021): for the pass arriving in the current frame, draws the passer's
// run, a draggable release marker on it, and a lane-coloured pass arrow. During playback it
// draws a short fading trail behind the ball instead.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene, renderer } from '../scene.js';
import { ensureDoc } from './doc.js';
import { CHIP_RADIUS, CHIP_DISPLAY_SCALE } from './chips.js';
import { buildArrowGeometry } from './shapes.js';
import { passPreview } from './choreo-pass.js';
import { passPlan, chipPosAt, nearestReleaseT } from './ball-pose.js';
import { setPassTiming } from './actors.js';
import { playbackSegment } from './playback.js';
import { VECTOR_PASS_CLEAR, VECTOR_PASS_BLOCKED } from '../tokens.js';

const RUN_COLOR = 0xffb347;
const ARROW_WIDTH = 120;
const TRAIL_WIDTH = 70;
const TRAIL_FADE_MS = 400;
const RUN_SAMPLES = 32;
const GRAB_PX = 18;   // screen-space grab radius: the diamond is only ~10 px at a full-rink zoom

const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide });

const arrow = new THREE.Mesh(new THREE.BufferGeometry(), mat(VECTOR_PASS_CLEAR.hex, 0.9));
arrow.name = 'passArrow';
const trail = new THREE.Mesh(new THREE.BufferGeometry(), mat(VECTOR_PASS_CLEAR.hex, 0.8));
trail.name = 'passTrail';
const marker = new THREE.Mesh(new THREE.CircleGeometry(340, 4), mat(RUN_COLOR, 0.95));
marker.name = 'passReleaseMarker';
marker.rotation.x = -Math.PI / 2;
const markerOutline = new THREE.Mesh(new THREE.RingGeometry(340, 420, 4), mat(0xffffff, 0.9));
marker.add(markerOutline);
const run = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: RUN_COLOR, dashSize: 200, gapSize: 120, depthTest: false }));
run.name = 'passRun';
for (const o of [arrow, trail, marker, run]) {
  o.visible = false;
  o.frustumCulled = false;
  o.renderOrder = 3;
  scene.add(o);
}
marker.renderOrder = 4;

let key = '';
let dragging = false;

// The current frame's scheme with player positions taken from the live chips (drag in progress).
function liveScheme(scheme) {
  const players = {};
  for (const [id, p] of Object.entries(scheme.players || {})) {
    const g = state.chipGroups.find((c) => c.userData.chip?.id === id);
    players[id] = g ? { ...p, x: g.position.x, z: g.position.z } : p;
  }
  return { ...scheme, players };
}

// { fa, fb, dur, plan } for the pass arriving in the current frame, or null.
export function currentPass() {
  const doc = ensureDoc();
  const k = doc.currentFrame;
  if (k < 1) return null;
  const fa = doc.frames[k - 1].scheme, fb = liveScheme(doc.frames[k].scheme);
  const dur = doc.frames[k - 1].duration;
  const plan = passPlan(fa, fb, dur);
  return plan ? { fa, fb, dur, plan } : null;
}

const r = (v) => Math.round(v);
function setGeometry(mesh, geom) {
  mesh.geometry.dispose();
  mesh.geometry = geom;
}

function hide(...objs) {
  let changed = false;
  for (const o of objs) if (o.visible) { o.visible = false; changed = true; }
  if (changed) key = '';
  return changed;
}

// Returns whether anything changed this frame (S-BACK-011 render gating).
export function tickPassOverlay() {
  if (state.playback?.playing) {
    const hidden = hide(arrow, marker, run);
    return updateTrail() || hidden;
  }
  const trailChanged = hide(trail);
  const cur = currentPass();
  if (!cur) return hide(arrow, marker, run) || trailChanged;
  const { fa, fb, plan } = cur;
  const runPts = plan.passerId ? [0, 0.5, 1].map((t) => chipPosAt(fa, fb, plan.passerId, t)) : [];
  const nextKey = JSON.stringify([ensureDoc().currentFrame, plan.from, plan.to, plan.releaseMark, plan.blockedBy, plan.late, runPts].flat(3).map((v) => (typeof v === 'number' ? r(v) : v)));
  if (nextKey === key) return trailChanged;
  key = nextKey;

  const color = plan.blockedBy.length ? VECTOR_PASS_BLOCKED.hex : VECTOR_PASS_CLEAR.hex;
  const trimmed = passPreview({
    startCarrier: plan.passerId, carrier: plan.receiverId, from: plan.from, to: plan.to,
    trim: CHIP_RADIUS * CHIP_DISPLAY_SCALE,
  });
  if (trimmed) {
    setGeometry(arrow, buildArrowGeometry([trimmed.from, trimmed.to], ARROW_WIDTH, { shaftStyle: plan.late ? 'dotted' : 'dashed' }));
    arrow.material.color.setHex(color);
    arrow.visible = true;
  } else {
    arrow.visible = false;
  }

  if (plan.passerId) {
    const pts = [];
    for (let i = 0; i <= RUN_SAMPLES; i++) {
      const p = chipPosAt(fa, fb, plan.passerId, i / RUN_SAMPLES);
      pts.push(new THREE.Vector3(p.x, 9, p.z));
    }
    run.geometry.dispose();
    run.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    run.computeLineDistances();
    run.visible = true;
    marker.position.set(plan.releaseMark.x, 12, plan.releaseMark.z);
    marker.visible = true;
  } else {
    run.visible = false;
    marker.visible = false;
  }
  return true;
}

function updateTrail() {
  const doc = ensureDoc();
  const seg = playbackSegment();
  if (!seg || seg.a === seg.b) return hide(trail);
  const dur = doc.frames[seg.a].duration;
  const plan = passPlan(doc.frames[seg.a].scheme, doc.frames[seg.b].scheme, dur);
  if (!plan || seg.t < plan.releaseT) return hide(trail);
  const after = (seg.t - plan.arriveT) * dur;
  if (after > TRAIL_FADE_MS) return hide(trail);
  const end = after >= 0 ? plan.to : { x: state.ballGroup?.position.x ?? plan.to.x, z: state.ballGroup?.position.z ?? plan.to.z };
  if (Math.hypot(end.x - plan.from.x, end.z - plan.from.z) < 50) return hide(trail);
  setGeometry(trail, buildArrowGeometry([plan.from, end], TRAIL_WIDTH, { headStyle: 'none' }));
  trail.material.color.setHex(plan.blockedBy.length ? VECTOR_PASS_BLOCKED.hex : VECTOR_PASS_CLEAR.hex);
  trail.material.opacity = after > 0 ? 0.8 * (1 - after / TRAIL_FADE_MS) : 0.8;
  trail.visible = true;
  return true;
}

// --- release-marker drag, called from selection.js like path-handles.js ---

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function setRay(event) {
  ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, state.activeCamera);
}

function nearMarker(event) {
  if (!marker.visible) return false;
  const r = renderer.domElement.getBoundingClientRect();
  const v = marker.position.clone().project(state.activeCamera);
  const sx = (v.x + 1) / 2 * r.width + r.left, sy = (1 - v.y) / 2 * r.height + r.top;
  return Math.hypot(event.clientX - sx, event.clientY - sy) <= GRAB_PX;
}

export function tryStartDrag(event) {
  if (!nearMarker(event)) return false;
  dragging = true;
  renderer.domElement.style.cursor = 'grabbing';
  return true;
}

export function isDragging() { return dragging; }

export function onDragMove(event) {
  if (!dragging) return;
  setRay(event);
  const p = raycaster.ray.intersectPlane(floorPlane, hitPoint);
  const cur = currentPass();
  if (!p || !cur?.plan.passerId) return;
  const t = nearestReleaseT(cur.fa, cur.fb, cur.plan.passerId, p);
  setPassTiming({ releaseT: Math.round(t * 100) / 100 }, { history: false });
}

export function endDrag() {
  if (!dragging) return;
  dragging = false;
  renderer.domElement.style.cursor = '';
  import('./history.js').then((h) => h.pushHistory());
}

// Hover feedback so the diamond reads as draggable; only touches the cursor it set itself.
let hoverCursor = false;
renderer.domElement.addEventListener('pointermove', (event) => {
  if (dragging) return;
  const near = nearMarker(event);
  if (near === hoverCursor) return;
  hoverCursor = near;
  renderer.domElement.style.cursor = near ? 'grab' : '';
});
