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
import { makeTextSprite } from './shapes.js';

export const GOAL_LABEL_DEFAULT_COLOR = '#ffffff';
export const GOAL_LABEL_DEFAULT_SIZE = 1200;
export const GOAL_LABEL_MIN_SIZE = 300;
export const GOAL_LABEL_MAX_SIZE = 5000;
// Goal crossbar is at y=1150mm; float the label a bit above it.
const GOAL_LABEL_Y = 1500;

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
  syncGoalLabelSprite(node, goal);
  return node;
}

// Add / update / remove the floating text sprite that hovers above the
// goal's crossbar when the user toggles a visible label on the extras. The
// sprite is stored on node.userData.labelSprite so we can find + dispose it
// on re-render.
function syncGoalLabelSprite(node, goal) {
  const existing = node.userData.labelSprite;
  const wantLabel = !!goal.labelVisible && !!(goal.label && goal.label.trim());
  if (existing) {
    node.remove(existing);
    existing.material?.map?.dispose?.();
    existing.material?.dispose?.();
    node.userData.labelSprite = null;
  }
  if (!wantLabel) return;
  const color = goal.labelColor || GOAL_LABEL_DEFAULT_COLOR;
  const size = Number.isFinite(goal.labelSize) && goal.labelSize > 0
    ? goal.labelSize : GOAL_LABEL_DEFAULT_SIZE;
  const sprite = makeTextSprite(goal.label.trim(), color, size);
  sprite.position.set(0, GOAL_LABEL_Y, 0);
  sprite.userData.isGoalLabel = true;
  node.add(sprite);
  node.userData.labelSprite = sprite;
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
  if ('labelVisible' in patch) {
    if (patch.labelVisible) goal.labelVisible = true; else delete goal.labelVisible;
  }
  if ('labelColor' in patch) {
    const c = String(patch.labelColor || '').trim();
    if (c && c.toLowerCase() !== GOAL_LABEL_DEFAULT_COLOR) goal.labelColor = c;
    else delete goal.labelColor;
  }
  if ('labelSize' in patch) {
    const n = Number(patch.labelSize);
    if (Number.isFinite(n) && n > 0 && n !== GOAL_LABEL_DEFAULT_SIZE) goal.labelSize = n;
    else delete goal.labelSize;
  }
  const node = state.extraGoals.find((m) => m.userData.goal?.id === id);
  if (node) {
    if ('rotY' in patch) node.rotation.y = goal.rotY || 0;
    if ('label' in patch || 'labelVisible' in patch
      || 'labelColor' in patch || 'labelSize' in patch) {
      syncGoalLabelSprite(node, goal);
    }
  }
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
  templatePromise.then((tpl) => {
    for (const goal of extras) buildGoalMesh(goal, tpl);
  });
  syncFixedGoalLabels();
}

// A-BACK-017: same label sprite treatment for the two fixed IFF goals.
// Persisted per-frame at doc.scheme.goals.fixed = { A: {...}, B: {...} } so
// it round-trips through frame switches / project load the same way the
// extras array does. State fields per side mirror the extras' schema:
// label?, labelVisible?, labelColor?, labelSize?.
export const FIXED_GOAL_LETTERS = ['A', 'B'];
const FIXED_GOAL_DEFAULT_LABEL = { A: 'Home', B: 'Away' };

export function fixedGoalLetterOf(obj) {
  const i = state.goalInstances?.indexOf(obj) ?? -1;
  return i === 0 ? 'A' : i === 1 ? 'B' : null;
}

export function fixedGoalDataFor(letter) {
  if (letter !== 'A' && letter !== 'B') return null;
  const doc = ensureDoc();
  const stored = doc.scheme.goals?.fixed?.[letter] || {};
  return {
    letter,
    label: stored.label ?? FIXED_GOAL_DEFAULT_LABEL[letter],
    labelVisible: !!stored.labelVisible,
    labelColor: stored.labelColor || GOAL_LABEL_DEFAULT_COLOR,
    labelSize: Number.isFinite(stored.labelSize) && stored.labelSize > 0
      ? stored.labelSize : GOAL_LABEL_DEFAULT_SIZE,
  };
}

export function updateFixedGoal(letter, patch) {
  if (letter !== 'A' && letter !== 'B') return;
  const doc = ensureDoc();
  if (!doc.scheme.goals) doc.scheme.goals = {};
  if (!doc.scheme.goals.fixed) doc.scheme.goals.fixed = {};
  const stored = doc.scheme.goals.fixed[letter] || {};
  if ('label' in patch) {
    const t = (patch.label ?? '').trim();
    if (t && t !== FIXED_GOAL_DEFAULT_LABEL[letter]) stored.label = t.slice(0, 32);
    else delete stored.label;
  }
  if ('labelVisible' in patch) {
    if (patch.labelVisible) stored.labelVisible = true; else delete stored.labelVisible;
  }
  if ('labelColor' in patch) {
    const c = String(patch.labelColor || '').trim();
    if (c && c.toLowerCase() !== GOAL_LABEL_DEFAULT_COLOR) stored.labelColor = c;
    else delete stored.labelColor;
  }
  if ('labelSize' in patch) {
    const n = Number(patch.labelSize);
    if (Number.isFinite(n) && n > 0 && n !== GOAL_LABEL_DEFAULT_SIZE) stored.labelSize = n;
    else delete stored.labelSize;
  }
  if (Object.keys(stored).length === 0) delete doc.scheme.goals.fixed[letter];
  else doc.scheme.goals.fixed[letter] = stored;
  if (Object.keys(doc.scheme.goals.fixed).length === 0) delete doc.scheme.goals.fixed;
  syncFixedGoalLabels();
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function syncFixedGoalLabels() {
  if (!state.goalInstances || state.goalInstances.length < 2) return;
  for (const letter of FIXED_GOAL_LETTERS) {
    const node = state.goalInstances[letter === 'A' ? 0 : 1];
    if (!node) continue;
    const data = fixedGoalDataFor(letter);
    // Reuse the extras' sprite pipeline; the goal-shape it wants is the
    // { label, labelVisible, labelColor, labelSize } bag we just resolved.
    syncGoalLabelSprite(node, data);
  }
}

document.addEventListener('layers:goal-loaded', syncFixedGoalLabels, { once: true });
