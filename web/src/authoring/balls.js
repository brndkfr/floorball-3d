// Additional ("extra") balls placed by the Ball tool. The main ball
// (state.ballGroup) is still boot-loaded from ball.obj and drives
// coverage / trajectory / carrier logic; extras are decorative markers
// coaches use to represent multiple balls in a drill (rebound piles,
// dry-shot targets, second-puck scenarios).
//
// Persisted per-frame as scheme.balls.extras = [{id, x, z, color?, label?}]
// alongside scheme.balls.main. Selection, drag, delete, layers-panel row,
// and Inspector all match the cone patterns.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { BALL_RADIUS } from '../constants.js';
import { ensureDoc, newId } from './doc.js';
import { saveDoc } from './storage.js';

const DEFAULT_BALL_COLOR = '#ffffff';
// Extras are drawn 5x real size so they read from top-down without the
// enterTopDown() scale hack that the main ball uses; keeps them uniform
// in both camera modes.
const EXTRA_RADIUS = BALL_RADIUS * 5;   // = 180 mm

state.extraBalls = [];
state.extraBallsRoot = new THREE.Group();
scene.add(state.extraBallsRoot);

const ballGeo = new THREE.SphereGeometry(EXTRA_RADIUS, 24, 16);

function buildBallMesh(entry) {
  const material = new THREE.MeshStandardMaterial({ color: entry.color || DEFAULT_BALL_COLOR, roughness: 0.5, metalness: 0.0 });
  const mesh = new THREE.Mesh(ballGeo, material);
  mesh.position.set(entry.x, EXTRA_RADIUS, entry.z);
  mesh.userData.ball = { id: entry.id };
  mesh.visible = !entry.hidden;
  state.extraBallsRoot.add(mesh);
  state.extraBalls.push(mesh);
  return mesh;
}

export const BALL_DEFAULT_COLOR = DEFAULT_BALL_COLOR;

export function spawnBall({ x, z, pushHistory = true }) {
  const doc = ensureDoc();
  if (!doc.scheme.balls) doc.scheme.balls = {};
  if (!doc.scheme.balls.extras) doc.scheme.balls.extras = [];
  const id = newId('b');
  const entry = { id, x, z };
  doc.scheme.balls.extras.push(entry);
  buildBallMesh(entry);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
  return id;
}

export function removeBall(id, pushHistory = true) {
  const doc = ensureDoc();
  const arr = doc.scheme.balls?.extras;
  const idx = arr?.findIndex((b) => b.id === id) ?? -1;
  if (idx < 0) return;
  arr.splice(idx, 1);
  const i = state.extraBalls.findIndex((m) => m.userData.ball?.id === id);
  if (i >= 0) {
    const mesh = state.extraBalls[i];
    state.extraBallsRoot.remove(mesh);
    mesh.material?.dispose?.();
    state.extraBalls.splice(i, 1);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
}

export function setBallHidden(id, hidden) {
  const doc = ensureDoc();
  const entry = doc.scheme.balls?.extras?.find((b) => b.id === id);
  if (!entry) return;
  const next = !!hidden;
  if (!!entry.hidden === next) return;
  if (next) entry.hidden = true; else delete entry.hidden;
  const mesh = state.extraBalls.find((m) => m.userData.ball?.id === id);
  if (mesh) mesh.visible = !next;
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function persistBallPosition(mesh) {
  const doc = ensureDoc();
  const entry = doc.scheme.balls?.extras?.find((b) => b.id === mesh.userData.ball?.id);
  if (!entry) return;
  entry.x = mesh.position.x;
  entry.z = mesh.position.z;
  saveDoc();
}

export function updateBall(id, patch) {
  const doc = ensureDoc();
  const entry = doc.scheme.balls?.extras?.find((b) => b.id === id);
  if (!entry) return;
  if ('color' in patch) entry.color = patch.color || undefined;
  if ('label' in patch) {
    const t = (patch.label ?? '').trim();
    if (t) entry.label = t.slice(0, 32); else delete entry.label;
  }
  const mesh = state.extraBalls.find((m) => m.userData.ball?.id === id);
  if (mesh && 'color' in patch) mesh.material.color.set(entry.color || DEFAULT_BALL_COLOR);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function ballDataFor(obj) {
  const id = obj?.userData?.ball?.id;
  if (!id) return null;
  const doc = ensureDoc();
  return doc.scheme.balls?.extras?.find((b) => b.id === id) || null;
}

export function rebuildBallsFromDoc() {
  for (const m of state.extraBalls) {
    state.extraBallsRoot.remove(m);
    m.material?.dispose?.();
  }
  state.extraBalls.length = 0;
  const doc = ensureDoc();
  for (const entry of doc.scheme.balls?.extras || []) buildBallMesh(entry);
}
