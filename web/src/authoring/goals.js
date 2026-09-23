// User-placed extra goals. The two fixed IFF goals live in
// state.goalInstances (loaded by layers.js from assets/floorball_goal.obj);
// extras are a separate collection so they don't interfere with
// trajectory / coverage / photo-overlay code that hard-references the two
// end-of-rink goals by index.
//
// Persisted per-frame as scheme.goals.extras = [{id, x, z, rotY?, hidden?, label?}].
// The mesh is a clone of the loaded goal Object3D; a shared placeholder
// group is created immediately so spawnGoal is synchronous, and the
// actual OBJ is grafted in once layers.js finishes loading it.

import * as THREE from 'three';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { ensureDoc, newId } from './doc.js';
import { saveDoc } from './storage.js';

state.extraGoals = [];
state.extraGoalsRoot = new THREE.Group();
scene.add(state.extraGoalsRoot);

// Resolved with a pristine, unpositioned goal Object3D the first time
// layers.js dispatches `layers:goal-loaded`. Consumers `await` this or
// register a `.then()` and grab a `.clone(true)`.
let templateResolve;
const templatePromise = new Promise((r) => { templateResolve = r; });

function tryResolveTemplate() {
  if (state.goalInstances && state.goalInstances[0]) {
    // Clone the goal AT the pristine loader origin: goalInstances[0] has
    // been rotated + translated to sit at Goal A. Undo that so our
    // template is centered at (0, 0, 0) facing +Z; spawnGoal then applies
    // the requested placement pose without inheriting Goal A's offset.
    const src = state.goalInstances[0].clone(true);
    src.position.set(0, 0, 0);
    src.rotation.set(0, 0, 0);
    src.updateMatrix();
    templateResolve(src);
  }
}
document.addEventListener('layers:goal-loaded', tryResolveTemplate, { once: true });
tryResolveTemplate(); // in case the event already fired

export function whenGoalTemplateReady() { return templatePromise; }

function buildGoalMesh(goal, template) {
  const node = template.clone(true);
  node.position.set(goal.x, 0, goal.z);
  node.rotation.y = goal.rotY || 0;
  node.userData.goal = { id: goal.id, extra: true };
  node.visible = !goal.hidden;
  state.extraGoalsRoot.add(node);
  state.extraGoals.push(node);
  return node;
}

export function spawnGoal({ x, z, rotY = 0, pushHistory = true }) {
  const doc = ensureDoc();
  if (!doc.scheme.goals) doc.scheme.goals = {};
  if (!doc.scheme.goals.extras) doc.scheme.goals.extras = [];
  const id = newId('g');
  const goal = { id, x, z };
  if (rotY) goal.rotY = rotY;
  doc.scheme.goals.extras.push(goal);
  templatePromise.then((tpl) => buildGoalMesh(goal, tpl));
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
  return id;
}

export function removeGoal(id, pushHistory = true) {
  const doc = ensureDoc();
  const arr = doc.scheme.goals?.extras;
  const idx = arr?.findIndex((g) => g.id === id) ?? -1;
  if (idx < 0) return;
  arr.splice(idx, 1);
  const i = state.extraGoals.findIndex((m) => m.userData.goal?.id === id);
  if (i >= 0) {
    const node = state.extraGoals[i];
    state.extraGoalsRoot.remove(node);
    node.traverse((n) => n.material?.dispose?.());
    state.extraGoals.splice(i, 1);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) import('./history.js').then((h) => h.pushHistory());
}

export function updateGoal(id, patch) {
  const doc = ensureDoc();
  const goal = doc.scheme.goals?.extras?.find((g) => g.id === id);
  if (!goal) return;
  if ('rotY' in patch) {
    goal.rotY = Number(patch.rotY) || 0;
    if (!goal.rotY) delete goal.rotY;
  }
  if ('label' in patch) {
    const t = (patch.label ?? '').trim();
    if (t) goal.label = t.slice(0, 32); else delete goal.label;
  }
  const node = state.extraGoals.find((m) => m.userData.goal?.id === id);
  if (node && 'rotY' in patch) node.rotation.y = goal.rotY || 0;
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function setGoalHidden(id, hidden) {
  const doc = ensureDoc();
  const goal = doc.scheme.goals?.extras?.find((g) => g.id === id);
  if (!goal) return;
  const next = !!hidden;
  if (!!goal.hidden === next) return;
  if (next) goal.hidden = true; else delete goal.hidden;
  const node = state.extraGoals.find((m) => m.userData.goal?.id === id);
  if (node) node.visible = !next;
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function persistGoalPosition(node) {
  const doc = ensureDoc();
  const goal = doc.scheme.goals?.extras?.find((g) => g.id === node.userData.goal?.id);
  if (!goal) return;
  goal.x = node.position.x;
  goal.z = node.position.z;
  goal.rotY = node.rotation.y || 0;
  if (!goal.rotY) delete goal.rotY;
  saveDoc();
}

export function goalDataFor(obj) {
  const id = obj?.userData?.goal?.id;
  if (!id || !obj.userData.goal.extra) return null;
  const doc = ensureDoc();
  return doc.scheme.goals?.extras?.find((g) => g.id === id) || null;
}

export function rebuildGoalsFromDoc() {
  for (const m of state.extraGoals) {
    state.extraGoalsRoot.remove(m);
    m.traverse((n) => n.material?.dispose?.());
  }
  state.extraGoals.length = 0;
  const doc = ensureDoc();
  const extras = doc.scheme.goals?.extras || [];
  if (!extras.length) return;
  templatePromise.then((tpl) => {
    for (const goal of extras) buildGoalMesh(goal, tpl);
  });
}
