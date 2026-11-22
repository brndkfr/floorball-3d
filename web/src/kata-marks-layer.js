// KATA marks on the rink (A-BACK-046 follow-up): the target band, the ideal
// footprint, the facing rays with the turn arc and the placement offset,
// drawn on the floor in Train from state.kataReadout (kata-readout.js) via
// kataMarks() (kata-visuals.js). Rebuilt when the readout changes (it is
// gated to 1 cm / 1 degree steps), shown while the Marks toggle is on.
// WebGL ignores line widths above 1, so every stroke is a thin flat ribbon.

import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import { quietAllows } from './lesson-view.js';
import { kataMarks, KATA_MARKS_STORAGE_KEY, parseKataMarksShown } from './kata-visuals.js';
import { VECTOR_SHOT_BLOCKED_CENTRED, VECTOR_SHOT_BLOCKED_OFF } from './tokens.js';
import { markRenderDirty } from './render-dirty.js';

const Y = 4;                 // mm: over the goalie zones (1.5 mm) and the markings (2 mm)
const STROKE = 45;           // mm ribbon width (estimate, reads from the Train camera)
const GREEN = VECTOR_SHOT_BLOCKED_CENTRED.hex;
const YELLOW = VECTOR_SHOT_BLOCKED_OFF.hex;
const WHITE = 0xffffff;

let stored = null;
try { stored = localStorage.getItem(KATA_MARKS_STORAGE_KEY); } catch { /* storage blocked: on */ }
state.kataMarksShown = parseKataMarksShown(stored);

export function setKataMarksShown(on) {
  const v = !!on;
  try { localStorage.setItem(KATA_MARKS_STORAGE_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  if (v === state.kataMarksShown) return;
  state.kataMarksShown = v;
  window.dispatchEvent(new Event('kataMarksChanged'));
}

const group = new THREE.Group();
group.name = 'kataMarks';
group.visible = false;
scene.add(group);
state.kataMarksLayer = group;

const material = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

// Flat quads along floor segments [[a, b], ...] (points { x, z }).
function ribbonGeometry(segments, width = STROKE) {
  const pos = [];
  for (const [a, b] of segments) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (width / 2), nz = (dx / len) * (width / 2);
    const p = [[a.x + nx, a.z + nz], [a.x - nx, a.z - nz], [b.x - nx, b.z - nz], [b.x + nx, b.z + nz]];
    for (const i of [0, 1, 2, 0, 2, 3]) pos.push(p[i][0], Y, p[i][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
const polyline = (pts, closed = false) => {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
  if (closed && pts.length > 2) out.push([pts[pts.length - 1], pts[0]]);
  return out;
};
// Chop segments into dashes (mm).
function dashed(segments, dash = 160, gap = 110) {
  const out = [];
  for (const [a, b] of segments) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0; s < len; s += dash + gap) {
      const e = Math.min(len, s + dash);
      const at = (t) => ({ x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len });
      out.push([at(s), at(e)]);
    }
  }
  return out;
}
// Ellipse points around c, long axis along yaw.
function ellipse(c, yaw, rLong, rShort, n = 18) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const u = Math.cos(t) * rLong, v = Math.sin(t) * rShort;
    pts.push({ x: c.x + Math.sin(yaw) * u + Math.cos(yaw) * v, z: c.z + Math.cos(yaw) * u - Math.sin(yaw) * v });
  }
  return pts;
}

function add(name, geometry, mat) {
  const m = new THREE.Mesh(geometry, mat);
  m.name = name;
  m.frustumCulled = false;   // rebuilt geometry (CLAUDE.md rendering gotchas)
  m.raycast = () => {};      // never a click target
  m.renderOrder = 30;
  group.add(m);
  return m;
}

function clear() {
  for (const c of group.children) { c.geometry.dispose(); c.material.dispose(); }
  group.clear();
}

let dirty = true;
function rebuild() {
  clear();
  const r = state.kataReadout;
  if (!r?.inputs) { state.kataMarks = null; return; }
  const m = kataMarks({ ...r.inputs, targets: r.targets, judged: r.judged });
  state.kataMarks = m;
  if (m.band) {
    const col = m.band.inside ? GREEN : YELLOW;
    const [a, b, c, d] = m.band.corners;
    const shape = new THREE.Shape([a, b, c, d].map((p) => new THREE.Vector2(p.x, -p.z)));
    const fill = new THREE.ShapeGeometry(shape);
    fill.rotateX(-Math.PI / 2);
    fill.translate(0, Y - 0.5, 0);
    add('band', fill, material(col, m.band.inside ? 0.5 : 0.22));
    add('band-edge', ribbonGeometry(polyline(m.band.corners, true), 30), material(col, 0.9));
  }
  if (m.footprint) {
    const yaw = m.rays.target ? Math.atan2(m.rays.target.to.x - m.rays.target.from.x, m.rays.target.to.z - m.rays.target.from.z) : 0;
    const side = { x: Math.cos(yaw) * 110, z: -Math.sin(yaw) * 110 };
    const feet = [{ x: m.footprint.x + side.x, z: m.footprint.z + side.z }, { x: m.footprint.x - side.x, z: m.footprint.z - side.z }];
    const segs = feet.flatMap((f) => dashed(polyline(ellipse(f, yaw, 130, 70), true), 45, 35));
    add('footprint', ribbonGeometry(segs, 25), material(GREEN, 0.95));
  }
  add('ray-current', ribbonGeometry([[m.rays.current.from, m.rays.current.to]]), material(WHITE, 0.95));
  if (m.rays.target) add('ray-target', ribbonGeometry([[m.rays.target.from, m.rays.target.to]]), material(GREEN, 0.95));
  if (m.rays.target && m.rays.status === 'adjust') add('arc', ribbonGeometry(dashed(polyline(m.rays.arc), 120, 80), 35), material(YELLOW, 0.95));
  if (m.offset) add('offset', ribbonGeometry(dashed([[m.offset.from, m.offset.to]], 120, 80), 35), material(YELLOW, 0.95));
}

const shown = () => document.body.dataset.mode === 'train' && !!state.kataReadout && state.kataMarksShown && quietAllows(state.quiet, 'marks');

// Called every frame from main.js. Returns true when something on screen changed.
export function updateKataMarks() {
  let changed = false;
  if (dirty) { rebuild(); dirty = false; changed = true; }
  const v = shown();
  if (group.visible !== v) { group.visible = v; changed = true; }
  return changed;
}

window.addEventListener('kataReadoutChanged', () => { dirty = true; markRenderDirty(); });
window.addEventListener('kataMarksChanged', markRenderDirty);
