// Authoring document model - portable JSON snapshot of the current scene.
// See docs/floorball-3d-authoring-plan.md §3.2 for the full schema.
//
// v2 (A4): the doc is a sequence of keyframes (`frames`), each with its own
// scheme + duration in ms. `currentFrame` is the index the user is editing.
// A non-enumerable `scheme` accessor is installed on the doc so every A1-A3
// callsite (`doc.scheme.players`, `doc.scheme.shapes`, ...) transparently
// reads / writes the active frame - keeps the 24-ish existing callers
// working with zero touch, and JSON.stringify still serializes only
// `frames` (the accessor is non-enumerable).
//
// v1 docs (single implicit frame) are auto-migrated on load via ensureDoc.

import { state } from '../state.js';

export const DOC_VERSION = 2;

const DEFAULT_FRAME_MS = 1000;

export function newId(prefix = 'p') {
  return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function emptyScheme() {
  return { players: {}, balls: {}, shapes: [], cones: [] };
}

export function emptyFrame(scheme = emptyScheme(), duration = DEFAULT_FRAME_MS) {
  return { id: newId('f'), duration, scheme };
}

export function emptyDoc() {
  const doc = {
    version: DOC_VERSION,
    hideMarkup: false,
    currentFrame: 0,
    frames: [ emptyFrame() ],
  };
  installSchemeAccessor(doc);
  return doc;
}

// Non-enumerable accessor - JSON.stringify skips it. Callers reading
// `doc.scheme` get the active frame's scheme; mutations to sub-keys
// (`doc.scheme.players[id] = ...`) mutate the frame's scheme in place,
// which is exactly what every A1-A3 callsite expects.
function installSchemeAccessor(doc) {
  const desc = Object.getOwnPropertyDescriptor(doc, 'scheme');
  if (desc && desc.get) return;
  Object.defineProperty(doc, 'scheme', {
    configurable: true,
    enumerable: false,
    get() {
      const i = Math.min(Math.max(this.currentFrame | 0, 0), this.frames.length - 1);
      return this.frames[i].scheme;
    },
  });
}

function migrate(doc) {
  if (!doc || typeof doc !== 'object') return emptyDoc();
  if (doc.version === DOC_VERSION) return doc;
  if (doc.version === 1 && doc.scheme) {
    const scheme = {
      players: doc.scheme.players || {},
      balls: doc.scheme.balls || {},
      shapes: doc.scheme.shapes || [],
      cones: doc.scheme.cones || [],
    };
    return {
      version: DOC_VERSION,
      hideMarkup: !!doc.hideMarkup,
      currentFrame: 0,
      frames: [ emptyFrame(scheme) ],
    };
  }
  return emptyDoc();
}

// Accept any doc version we can migrate, return a v2 doc with the scheme
// accessor installed. Returns null if raw isn't a doc we understand.
export function acceptDoc(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== 1 && raw.version !== DOC_VERSION) return null;
  const migrated = migrate(raw);
  installSchemeAccessor(migrated);
  return migrated;
}

export function ensureDoc() {
  if (!state.doc || typeof state.doc !== 'object') state.doc = emptyDoc();
  if (state.doc.version !== DOC_VERSION) state.doc = migrate(state.doc);
  if (!Array.isArray(state.doc.frames) || state.doc.frames.length === 0) {
    state.doc.frames = [ emptyFrame() ];
  }
  if (typeof state.doc.currentFrame !== 'number') state.doc.currentFrame = 0;
  state.doc.currentFrame = Math.min(Math.max(state.doc.currentFrame | 0, 0), state.doc.frames.length - 1);
  for (const f of state.doc.frames) {
    if (!f.scheme) f.scheme = emptyScheme();
    if (!f.scheme.players) f.scheme.players = {};
    if (!f.scheme.balls) f.scheme.balls = {};
    if (!f.scheme.shapes) f.scheme.shapes = [];
    if (!f.scheme.cones) f.scheme.cones = [];
    if (typeof f.duration !== 'number' || f.duration <= 0) f.duration = DEFAULT_FRAME_MS;
    if (!f.id) f.id = newId('f');
  }
  installSchemeAccessor(state.doc);
  return state.doc;
}
