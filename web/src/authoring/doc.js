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

// A-BACK-024: older docs (and older frames within a still-current-version
// doc) store a single `scheme.goalie = { x, z, angle }`. Mode A now has a
// goalie per goal end, so that value becomes goal A's; goal B just falls
// back to its own default stance until the user moves it. Mutates in place.
function migrateGoalieScheme(scheme) {
  if (!scheme) return;
  if (!scheme.goalies) scheme.goalies = {};
  if (scheme.goalie) {
    if (!scheme.goalies.A) scheme.goalies.A = scheme.goalie;
    delete scheme.goalie;
  }
}

// --- structural validation (S-BACK-029 H2) ------------------------------
// Ids alone are not enough: a share link with e.g. a zone without `points`
// was saved as the current project and then threw in rebuildShapesFromDoc()
// during boot, on every reload. The rules below drop entries the rebuild
// code cannot build (missing or non-finite position, malformed points) and
// remove optional fields of the wrong type, so the renderer falls back to its
// defaults. Fields not listed are kept as they are: nothing here may change a
// doc the app itself wrote, since every saved project passes through it too.

// Limits are estimates, far above any real play.
const MAX_FRAMES = 500;
const MAX_ITEMS = 2000;   // entries per collection per frame
const MAX_POINTS = 5000;  // points per shape
const MAX_STR = 500;      // characters per string field

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPos = (v) => isNum(v) && v > 0;
const isStr = (v) => typeof v === 'string';
const isPt = (p) => isObj(p) && isNum(p.x) && isNum(p.z);
const isNumArray = (n) => (a) => Array.isArray(a) && a.length === n && a.every(isNum);
const hasPos = (e) => isObj(e) && isNum(e.x) && isNum(e.z);

const PLAYER_FIELDS = { angle: isNum, label: isStr, role: isStr, number: (v) => isStr(v) || isNum(v) };
const SHAPE_FIELDS = {
  color: isStr, label: isStr, text: isStr, kind: isStr, shaftStyle: isStr, headStyle: isStr,
  layer: (v) => v === 'low' || v === 'mid' || v === 'high',
  opacity: isNum, labelRotation: isNum, width: isPos, size: isPos, labelSize: isPos,
  x: isNum, z: isNum, w: isNum, h: isNum, cx: isNum, cz: isNum, r: isNum,
};
const CONE_FIELDS = { color: isStr, kind: isStr };
const BALL_FIELDS = { color: isStr, carrier: isValidId };
const GOAL_LABEL_FIELDS = { label: isStr, labelColor: isStr, labelSize: isPos };
const GOAL_FIELDS = { ...GOAL_LABEL_FIELDS, rotY: isNum };
const GOALIE_FIELDS = { angle: isNum };
const CAMERA_FIELDS = { mode: isStr, fov: isPos, zoom: isPos };

// Removes listed fields whose value has the wrong type; truncates strings.
// null / undefined are left alone (every reader treats them as "unset").
function cleanFields(entry, spec) {
  for (const key of Object.keys(spec)) {
    const v = entry[key];
    if (v == null) continue;
    if (!spec[key](v)) delete entry[key];
    else if (isStr(v) && v.length > MAX_STR) entry[key] = v.slice(0, MAX_STR);
  }
  return entry;
}

function isValidShape(s) {
  if (!isObj(s) || !isValidId(s.id)) return false;
  if (s.type === 'arrow' || s.type === 'zone') {
    return Array.isArray(s.points) && s.points.length <= MAX_POINTS && s.points.every(isPt);
  }
  if (s.type === 'text') return isNum(s.x) && isNum(s.z);
  return false;
}

// id-keyed list (cones, extra balls, extra goals): valid id + finite position.
const cleanList = (list, fields) => list
  .filter((e) => hasPos(e) && isValidId(e.id))
  .map((e) => cleanFields(e, fields));

// Returns false when the scheme is too large to accept at all.
function sanitizeScheme(scheme) {
  if (!isObj(scheme.players)) scheme.players = {};
  if (!Array.isArray(scheme.shapes)) scheme.shapes = [];
  if (!Array.isArray(scheme.cones)) scheme.cones = [];
  if (!isObj(scheme.balls)) scheme.balls = {};
  const playerIds = Object.keys(scheme.players);
  if (playerIds.length > MAX_ITEMS || scheme.shapes.length > MAX_ITEMS || scheme.cones.length > MAX_ITEMS) return false;

  for (const id of playerIds) {
    const p = scheme.players[id];
    if (!isValidId(id) || !hasPos(p)) { delete scheme.players[id]; continue; }
    cleanFields(p, PLAYER_FIELDS);
    if (p.id !== undefined && p.id !== id) p.id = id;
  }
  scheme.shapes = scheme.shapes.filter(isValidShape).map((s) => cleanFields(s, SHAPE_FIELDS));
  scheme.cones = cleanList(scheme.cones, CONE_FIELDS);

  const balls = scheme.balls;
  if (balls.main != null && !hasPos(balls.main)) delete balls.main;
  else if (balls.main) cleanFields(balls.main, BALL_FIELDS);
  if (balls.extras != null) {
    if (!Array.isArray(balls.extras) || balls.extras.length > MAX_ITEMS) balls.extras = [];
    balls.extras = cleanList(balls.extras, BALL_FIELDS);
  }

  if (scheme.goals != null && !isObj(scheme.goals)) delete scheme.goals;
  const goals = scheme.goals;
  if (goals) {
    if (goals.extras != null) {
      if (!Array.isArray(goals.extras) || goals.extras.length > MAX_ITEMS) goals.extras = [];
      goals.extras = cleanList(goals.extras, GOAL_FIELDS);
    }
    if (goals.fixed != null) {
      if (!isObj(goals.fixed)) goals.fixed = {};
      for (const k of Object.keys(goals.fixed)) {
        if ((k !== 'A' && k !== 'B') || !isObj(goals.fixed[k])) delete goals.fixed[k];
        else cleanFields(goals.fixed[k], GOAL_LABEL_FIELDS);
      }
    }
  }

  if (!isObj(scheme.goalies)) scheme.goalies = {};
  for (const k of Object.keys(scheme.goalies)) {
    const g = scheme.goalies[k];
    if ((k !== 'A' && k !== 'B') || !hasPos(g)) delete scheme.goalies[k];
    else cleanFields(g, GOALIE_FIELDS);
  }
  return true;
}

function sanitizeFrame(frame) {
  if (frame.duration != null && !isPos(frame.duration)) delete frame.duration;
  const cam = frame.camera;
  if (cam != null) {
    if (!isObj(cam) || !isNumArray(3)(cam.position) || !isNumArray(4)(cam.quaternion)) delete frame.camera;
    else cleanFields(cam, CAMERA_FIELDS);
  }
  if (!isObj(frame.scheme)) frame.scheme = emptyScheme();
  migrateGoalieScheme(frame.scheme);
  return sanitizeScheme(frame.scheme);
}

// Validates a doc that came from an untrusted source (file import, share
// link) or storage: structure (see above) and ids, since some ids reach
// innerHTML (see isValidId). Mutates in place. Returns null when the doc
// can't be accepted at all.
function sanitizeDoc(doc) {
  if (!doc || !Array.isArray(doc.frames) || doc.frames.length > MAX_FRAMES) return null;
  doc.frames = doc.frames.filter(isObj);
  if (doc.frames.length === 0) return null;
  for (const frame of doc.frames) {
    if (!sanitizeFrame(frame)) return null;
    const photo = frame.photo;
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
    if (doc.scheme.goalie) scheme.goalie = doc.scheme.goalie; // migrateGoalieScheme() folds this into goalies.A downstream
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
  if (!migrated) return null;
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
    migrateGoalieScheme(f.scheme);
    if (typeof f.duration !== 'number' || f.duration <= 0) f.duration = DEFAULT_FRAME_MS;
    if (!f.id) f.id = newId('f');
  }
  installSchemeAccessor(state.doc);
  return state.doc;
}
