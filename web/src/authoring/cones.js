// Marker cones (training cones): coach-friendly non-player markers.
// Two kinds: a traffic-cone style "full" cone and a low-profile "disc"
// (puck-cone). Persisted in `frame.scheme.cones = [{id, kind, x, z}]`.
//
// Mirrors the chips.js patterns for spawn / remove / rebuild / translate,
// scaled down: no team colour, no sprite, no drop animation. Selection
// wiring, delete, drag, and layers-panel row all reuse the same "userData
// tag + shared collection on state" idiom.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { ensureDoc, newId } from './doc.js';
import { saveDoc } from './storage.js';

const DEFAULT_CONE_COLOR = '#ff7a1a';   // safety-cone orange
const FULL_RADIUS = 130;
const FULL_HEIGHT = 500;
const DISC_RADIUS = 170;
const DISC_HEIGHT = 40;

state.coneObjects = [];
state.conesRoot = new THREE.Group();
scene.add(state.conesRoot);

const fullGeo = new THREE.ConeGeometry(FULL_RADIUS, FULL_HEIGHT, 24);
const discGeo = new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, DISC_HEIGHT, 32);

export const CONE_KINDS = new Set(['full', 'disc']);
export const CONE_DEFAULT_COLOR = DEFAULT_CONE_COLOR;

function buildConeMesh(cone) {
  const geom = cone.kind === 'disc' ? discGeo : fullGeo;
  const height = cone.kind === 'disc' ? DISC_HEIGHT : FULL_HEIGHT;
  const material = new THREE.MeshStandardMaterial({ color: cone.color || DEFAULT_CONE_COLOR, roughness: 0.7, metalness: 0.0 });
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(cone.x, height / 2, cone.z);   // ConeGeom/CylinderGeom origin is at centre; raise to sit on floor
  mesh.userData.cone = { id: cone.id };
  mesh.visible = !cone.hidden;
  state.conesRoot.add(mesh);
  state.coneObjects.push(mesh);
  return mesh;
}

export function spawnCone({ kind = 'disc', x, z, pushHistory = true }) {
  if (!CONE_KINDS.has(kind)) kind = 'disc';
  const doc = ensureDoc();
  if (!doc.scheme.cones) doc.scheme.cones = [];
  const id = newId('c');
  const cone = { id, kind, x, z };
  doc.scheme.cones.push(cone);
  buildConeMesh(cone);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
  return id;
}

export function removeCone(id, pushHistory = true) {
  const doc = ensureDoc();
  const idx = doc.scheme.cones?.findIndex((c) => c.id === id) ?? -1;
  if (idx < 0) return;
  doc.scheme.cones.splice(idx, 1);
  const i = state.coneObjects.findIndex((m) => m.userData.cone?.id === id);
  if (i >= 0) {
    const mesh = state.coneObjects[i];
    state.conesRoot.remove(mesh);
    mesh.material?.dispose?.();
    state.coneObjects.splice(i, 1);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
}

// Patch { color, label, kind } for a cone. Color updates the mesh material
// in place; kind rebuilds the mesh so the geometry actually swaps.
export function updateCone(id, patch) {
  const doc = ensureDoc();
  const cone = doc.scheme.cones?.find((c) => c.id === id);
  if (!cone) return;
  let needsRebuild = false;
  if ('color' in patch) cone.color = patch.color || undefined;
  if ('label' in patch) {
    const t = (patch.label ?? '').trim();
    if (t) cone.label = t.slice(0, 32); else delete cone.label;
  }
  if ('kind' in patch && CONE_KINDS.has(patch.kind) && patch.kind !== cone.kind) {
    cone.kind = patch.kind;
    needsRebuild = true;
  }
  const mesh = state.coneObjects.find((m) => m.userData.cone?.id === id);
  if (mesh) {
    if (needsRebuild) {
      state.conesRoot.remove(mesh);
      mesh.material?.dispose?.();
      const i = state.coneObjects.indexOf(mesh);
      if (i >= 0) state.coneObjects.splice(i, 1);
      buildConeMesh(cone);
    } else if ('color' in patch) {
      mesh.material.color.set(cone.color || DEFAULT_CONE_COLOR);
    }
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function setConeHidden(id, hidden) {
  const doc = ensureDoc();
  const cone = doc.scheme.cones?.find((c) => c.id === id);
  if (!cone) return;
  const next = !!hidden;
  if (!!cone.hidden === next) return;
  if (next) cone.hidden = true; else delete cone.hidden;
  const mesh = state.coneObjects.find((m) => m.userData.cone?.id === id);
  if (mesh) mesh.visible = !next;
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

// Called by the drag path in selection.js when a set is translated.
export function persistConePosition(mesh) {
  const doc = ensureDoc();
  const cone = doc.scheme.cones?.find((c) => c.id === mesh.userData.cone?.id);
  if (!cone) return;
  cone.x = mesh.position.x;
  cone.z = mesh.position.z;
  saveDoc();
}

export function coneDataFor(obj) {
  const id = obj?.userData?.cone?.id;
  if (!id) return null;
  const doc = ensureDoc();
  return doc.scheme.cones?.find((c) => c.id === id) || null;
}

export function rebuildConesFromDoc() {
  for (const m of state.coneObjects) {
    state.conesRoot.remove(m);
    m.material?.dispose?.();
  }
  state.coneObjects.length = 0;
  const doc = ensureDoc();
  for (const cone of doc.scheme.cones || []) buildConeMesh(cone);
}
