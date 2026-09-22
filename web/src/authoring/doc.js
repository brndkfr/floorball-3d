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

// Every id newId() generates matches this. Ids can also arrive from an
// imported JSON file or a #doc= share link, which acceptDoc() does not
// otherwise validate - and some of those ids reach innerHTML verbatim at
// render time (photo-overlay.js's goalieOptionsHtml), so a crafted id like
// `"><img src=x onerror=...>` could inject script. sanitizeDoc() below
// drops any entry whose id doesn't match this pattern before the doc is
// accepted, closing that off at the ingestion boundary regardless of what
// any individual render site does.
const ID_RE = /^[\w-]+$/;
export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

// Strips scheme/photo entries with malformed ids from a doc that just came
// from an untrusted source (file import, share link). Mutates in place.
function sanitizeDoc(doc) {
  if (!doc || !Array.isArray(doc.frames)) return doc;
  for (const frame of doc.frames) {
    const scheme = frame?.scheme;
    if (scheme?.players && typeof scheme.players === 'object') {
      for (const id of Object.keys(scheme.players)) {
        if (!isValidId(id)) delete scheme.players[id];
      }
    }
    if (Array.isArray(scheme?.shapes)) {
      scheme.shapes = scheme.shapes.filter((s) => isValidId(s?.id));
    }
    const photo = frame?.photo;
    if (photo && Array.isArray(photo.players)) {
      photo.players = photo.players.filter((p) => isValidId(p?.id));
      const validIds = new Set(photo.players.map((p) => p.id));
      if (photo.ballCarrier != null && !validIds.has(photo.ballCarrier)) photo.ballCarrier = null;
      if (photo.goalies) {
        if (photo.goalies.home != null && !validIds.has(photo.goalies.home)) photo.goalies.home = null;
        if (photo.goalies.away != null && !validIds.has(photo.goalies.away)) photo.goalies.away = null;
      }
    }
  }
  return doc;
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
    meta: emptyMeta(),
    hideMarkup: false,
    currentFrame: 0,
    frames: [ emptyFrame() ],
  };
  installSchemeAccessor(doc);
  return doc;
}

// Project metadata (A-GAP-003). Carried inside the doc so exports round-trip
// the project name; the `id` is regenerated on import so an imported file
// never collides with an existing local project.
export function emptyMeta(name = 'Untitled') {
  const now = Date.now();
  return { id: newId('proj'), name, createdAt: now, modifiedAt: now };
}

function ensureMeta(doc, fallbackName = 'Untitled') {
  if (!doc.meta || typeof doc.meta !== 'object') doc.meta = emptyMeta(fallbackName);
  if (!doc.meta.id || !isValidId(doc.meta.id)) doc.meta.id = newId('proj');
  if (typeof doc.meta.name !== 'string' || !doc.meta.name.trim()) doc.meta.name = fallbackName;
  const now = Date.now();
  if (typeof doc.meta.createdAt !== 'number') doc.meta.createdAt = now;
  if (typeof doc.meta.modifiedAt !== 'number') doc.meta.modifiedAt = doc.meta.createdAt;
  return doc.meta;
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
      meta: emptyMeta(),
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
  const migrated = sanitizeDoc(migrate(raw));
  ensureMeta(migrated);
  installSchemeAccessor(migrated);
  return migrated;
}

export function ensureDoc() {
  if (!state.doc || typeof state.doc !== 'object') state.doc = emptyDoc();
  if (state.doc.version !== DOC_VERSION) state.doc = migrate(state.doc);
  ensureMeta(state.doc);
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
