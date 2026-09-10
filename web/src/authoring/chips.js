// Player chips: the coloured, numbered discs users drop onto the rink.
//
// Geometry is loaded once from player_chip.obj/.mtl (see
// generators/generate_player_chip.py); each chip in the scene is a shallow
// clone of that prototype with a per-instance material colour and a
// canvas-texture number sprite as a child. Selection, drag and delete are
// wired into the existing selection.js / controls.js paths - see the
// state.chipGroups mentions there.

import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { CACHE_BUST } from '../constants.js';
import { state } from '../state.js';
import { scene } from '../scene.js';
import { loaded, failed } from '../status.js';
import { TEAM_HOME, TEAM_AWAY } from '../tokens.js';
import { ensureDoc, newId } from './doc.js';
import { saveDoc } from './storage.js';
import { drawRoleGlyph } from './role-icons.js';

export const CHIP_HEIGHT = 20;   // matches generate_player_chip.py
export const CHIP_RADIUS = 100;  // matches generate_player_chip.py
// Runtime display multiplier - the OBJ is player-diameter to keep coverage /
// trajectory math honest, but at rink scale the chip reads tiny both in
// perspective and in the top-down authoring view. Scale up the visible
// mesh (and everything anchored to it) so the disc is easy to grab and
// number sprite is easy to read. 5.0 = 1 m diameter at rink scale.
export const CHIP_DISPLAY_SCALE = 5;

// Two team colours, distinct from the cyan analytical HUD accent and from
// the amber authoring accent so a chip on screen never blurs into UI chrome.
// Values come from web/src/tokens.js so Mode B chips + preview-3d.js match.
export const TEAM_COLORS = {
  1: TEAM_HOME.hex,
  2: TEAM_AWAY.hex,
};

// prototype loaded once from the OBJ; every chip is a fresh clone
let chipPrototype = null;
const pendingRebuilds = [];  // chips whose spawn was requested before load finished

// per-chip drop animations, ticked from main.js's animate() via updateChipAnimations()
const drops = [];   // { group, elapsed, dur, fromScale, toScale }
const rings = [];   // { mesh, elapsed, dur, fromScale, toScale, fromOpacity }

// --- geometry loading -------------------------------------------------

state.chipsRoot = new THREE.Group();
scene.add(state.chipsRoot);

const chipMtl = new MTLLoader();
chipMtl.load(
  'assets/player_chip.mtl' + CACHE_BUST,
  (materials) => {
    materials.preload();
    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(
      'assets/player_chip.obj' + CACHE_BUST,
      (object) => {
        chipPrototype = object;
        loaded('player_chip.obj');
        // spawn any chips that were requested (e.g. by loadDoc()) before
        // the OBJ finished loading
        while (pendingRebuilds.length) {
          const p = pendingRebuilds.shift();
          spawnChipMesh(p);
        }
      },
      undefined,
      (err) => failed('player_chip.obj', err),
    );
  },
  undefined,
  (err) => failed('player_chip.mtl', err),
);

// --- sprites: number / label / role icon ------------------------------

export const ROLES = ['defender', 'center', 'wing'];

function makeNumberSprite(number) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeText(String(number), size / 2, size / 2 + 4);
  ctx.fillText(String(number), size / 2, size / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1;
  // Sprite scale is relative to the group, so ~110 mm here becomes
  // 110 * CHIP_DISPLAY_SCALE mm on screen - keep it clearly smaller than
  // the disc (200 mm * scale) so a rim of team colour is always visible
  // around the number from directly above.
  sprite.scale.set(110, 110, 1);
  sprite.position.set(0, CHIP_HEIGHT + 10, 0);
  return sprite;
}

function makeLabelSprite(text) {
  const font = 'bold 64px system-ui, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const padding = 24;
  const height = 96;
  const textWidth = Math.ceil(measure.measureText(text || ' ').width);
  const width = Math.max(height, textWidth + padding * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeText(text, width / 2, height / 2 + 2);
  ctx.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1;
  // Same on-disc height as the number sprite (~110 mm), width scales.
  const worldHeight = 110;
  sprite.scale.set(worldHeight * (width / height), worldHeight, 1);
  sprite.position.set(0, CHIP_HEIGHT + 10, 0);
  return sprite;
}

function makeRoleSprite(role) {
  if (!ROLES.includes(role)) return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawRoleGlyph(ctx, role, size, { withBackground: true });
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 2;
  // Small badge floating above the chip so the disc + label stay unobstructed.
  const badge = 70;
  sprite.scale.set(badge, badge, 1);
  sprite.position.set(0, CHIP_HEIGHT + 130, 0);
  return sprite;
}

// Rebuild the number-or-label + role-icon child sprites for a chip group
// in-place. Cheap enough to call on every label / role edit.
function refreshChipSprites(group, player) {
  const old = group.userData.sprites;
  if (old) {
    for (const s of old) {
      group.remove(s);
      s.material?.map?.dispose?.();
      s.material?.dispose?.();
    }
  }
  const sprites = [];
  const trimmed = player.label?.trim();
  const primary = trimmed ? makeLabelSprite(trimmed) : makeNumberSprite(player.number);
  group.add(primary);
  sprites.push(primary);
  if (player.role) {
    const role = makeRoleSprite(player.role);
    if (role) {
      group.add(role);
      sprites.push(role);
    }
  }
  group.userData.sprites = sprites;
}

// --- spawn / remove ---------------------------------------------------

function spawnChipMesh(player) {
  const group = chipPrototype.clone(true);
  // clone materials so per-instance colour doesn't bleed across chips
  group.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      child.material.color.setHex(TEAM_COLORS[player.team] || 0x888888);
    }
  });
  group.position.set(player.x, 0, player.z);
  group.rotation.y = player.angle || 0;
  group.userData.chip = { id: player.id };  // let selection.js find the record
  group.visible = !player.hidden;
  refreshChipSprites(group, player);
  state.chipsRoot.add(group);
  state.chipGroups.push(group);

  // drop micro-interaction: chip scales in from 0.7 -> 1.0 (times display
  // scale) with a cyan ring flash. Cheap, defining for the "playful" feel
  // called out in the plan's §3.7.
  group.scale.setScalar(0.7 * CHIP_DISPLAY_SCALE);
  drops.push({ group, elapsed: 0, dur: 0.2, fromScale: 0.7 * CHIP_DISPLAY_SCALE, toScale: CHIP_DISPLAY_SCALE });

  const ring = new THREE.Mesh(
    new THREE.RingGeometry((CHIP_RADIUS + 20) * CHIP_DISPLAY_SCALE, (CHIP_RADIUS + 40) * CHIP_DISPLAY_SCALE, 48),
    new THREE.MeshBasicMaterial({ color: 0x4fe0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(player.x, 3, player.z);
  scene.add(ring);
  rings.push({ mesh: ring, elapsed: 0, dur: 0.4, fromScale: 1.0, toScale: 2.4, fromOpacity: 0.9 });

  return group;
}

export function spawnChip({ team, x, z, number, angle = 0, pushHistory = true }) {
  const doc = ensureDoc();
  const num = String(number ?? nextNumber(team));
  const id = newId('p');
  const player = { id, team, number: num, x, z, angle };
  doc.scheme.players[id] = player;
  if (chipPrototype) spawnChipMesh(player); else pendingRebuilds.push(player);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  if (pushHistory) {
    // late import to avoid a circular dep: history.js imports from chips.js
    import('./history.js').then((h) => h.pushHistory());
  }
  return id;
}

export function removeChip(id) {
  const doc = ensureDoc();
  if (!doc.scheme.players[id]) return;
  delete doc.scheme.players[id];
  const i = state.chipGroups.findIndex((g) => g.userData.chip && g.userData.chip.id === id);
  if (i >= 0) {
    const group = state.chipGroups[i];
    state.chipsRoot.remove(group);
    state.chipGroups.splice(i, 1);
    disposeGroup(group);
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function updateChipTeam(id, team) {
  const doc = ensureDoc();
  const player = doc.scheme.players[id];
  if (!player || player.team === team) return;
  player.team = team;
  const group = state.chipGroups.find((g) => g.userData.chip && g.userData.chip.id === id);
  if (group) {
    group.userData.chip = player;
    group.traverse((child) => {
      if (child.isMesh && child.material?.color) child.material.color.setHex(TEAM_COLORS[team] || 0x888888);
    });
  }
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function updateChipLabel(id, label) {
  const doc = ensureDoc();
  const player = doc.scheme.players[id];
  if (!player) return;
  const trimmed = (label ?? '').trim();
  const next = trimmed ? trimmed.slice(0, 32) : undefined;
  if (player.label === next) return;
  if (next === undefined) delete player.label; else player.label = next;
  const group = state.chipGroups.find((g) => g.userData.chip && g.userData.chip.id === id);
  if (group) refreshChipSprites(group, player);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function updateChipRole(id, role) {
  const doc = ensureDoc();
  const player = doc.scheme.players[id];
  if (!player) return;
  const next = ROLES.includes(role) ? role : undefined;
  if ((player.role || undefined) === next) return;
  if (next === undefined) delete player.role; else player.role = next;
  const group = state.chipGroups.find((g) => g.userData.chip && g.userData.chip.id === id);
  if (group) refreshChipSprites(group, player);
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

export function setChipHidden(id, hidden) {
  const doc = ensureDoc();
  const player = doc.scheme.players[id];
  if (!player) return;
  const next = !!hidden;
  if (!!player.hidden === next) return;
  if (next) player.hidden = true; else delete player.hidden;
  const group = state.chipGroups.find((g) => g.userData.chip && g.userData.chip.id === id);
  if (group) group.visible = !next;
  saveDoc();
  document.dispatchEvent(new CustomEvent('layers:dirty'));
  import('./history.js').then((h) => h.pushHistory());
}

// Called by selection.js after a floor-click drag on a chip, and by
// controls.js after WASD movement, to persist the new position.
export function persistChipPosition(group) {
  const chip = group.userData.chip;
  if (!chip) return;
  const doc = ensureDoc();
  const player = doc.scheme.players[chip.id];
  if (!player) return;
  player.x = group.position.x;
  player.z = group.position.z;
  player.angle = group.rotation.y;
  saveDoc();
}

// Debounced-ish history push after drag/keyboard-move settles, so we don't
// spam a hundred snapshots per second while the user is holding a key or
// dragging the mouse. Callers call schedulePush() as often as they want.
let pushTimer = null;
export function scheduleHistoryPush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    import('./history.js').then((h) => h.pushHistory());
  }, 250);
}

function disposeGroup(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose?.();
      child.material?.dispose?.();
    }
    if (child.isSprite) {
      child.material.map?.dispose?.();
      child.material.dispose?.();
    }
  });
}

// --- team / numbering -------------------------------------------------

// The smallest positive integer 1..25 that isn't used by any current chip on
// the given team. Wraps to 1 after 25, so long sessions still yield a number.
export function nextNumber(team) {
  const doc = ensureDoc();
  const used = new Set();
  for (const p of Object.values(doc.scheme.players)) {
    if (p.team === team) used.add(Number(p.number));
  }
  for (let i = 1; i <= 25; i++) if (!used.has(i)) return i;
  return 1;
}

// --- rebuild from doc (used by history undo/redo and initial load) ----

// Wipes all chip meshes and reconstructs them from state.doc.scheme.players.
// Preserves the same THREE.Group root so any external references stay valid.
export function rebuildFromDoc() {
  for (const group of state.chipGroups) {
    state.chipsRoot.remove(group);
    disposeGroup(group);
  }
  state.chipGroups.length = 0;
  drops.length = 0;
  for (const r of rings) scene.remove(r.mesh);
  rings.length = 0;

  const doc = ensureDoc();
  for (const player of Object.values(doc.scheme.players)) {
    if (chipPrototype) spawnChipMesh(player); else pendingRebuilds.push(player);
  }
  document.dispatchEvent(new CustomEvent('layers:dirty'));
}

// --- per-frame animation update ---------------------------------------

export function updateChipAnimations(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.elapsed += dt;
    const t = Math.min(d.elapsed / d.dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);   // ease-out cubic
    const s = d.fromScale + (d.toScale - d.fromScale) * eased;
    d.group.scale.set(s, s, s);
    if (t >= 1) drops.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.elapsed += dt;
    const t = Math.min(r.elapsed / r.dur, 1);
    const s = r.fromScale + (r.toScale - r.fromScale) * t;
    r.mesh.scale.set(s, s, s);
    r.mesh.material.opacity = r.fromOpacity * (1 - t);
    if (t >= 1) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      rings.splice(i, 1);
    }
  }
}

// --- lookup helper for selection.js / controls.js ---------------------

export function chipDataFor(group) {
  const chip = group?.userData?.chip;
  if (!chip) return null;
  return ensureDoc().scheme.players[chip.id] || null;
}
