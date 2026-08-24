// Authoring document model - portable JSON snapshot of the current scene.
// See docs/floorball-3d-authoring-plan.md §3.2 for the full schema. Only the
// subset used by A1 (scheme.players) is populated so far; the animation
// object and shape / ball / goalie fields are added by later milestones.

import { state } from '../state.js';

export const DOC_VERSION = 1;

export function emptyDoc() {
  return {
    version: DOC_VERSION,
    hideMarkup: false,
    scheme: {
      players: {},   // id -> { id, team: 1|2, number: string, x, z, angle }
      balls: {},
      shapes: [],
    },
  };
}

// Cheap unique ids for authoring elements. Not cryptographically random; the
// only requirement is "unlikely to collide inside one document".
export function newId(prefix = 'p') {
  return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

// Ensure state.doc has the current-shape defaults - callers can rely on
// state.doc.scheme.players being an object even for a fresh session.
export function ensureDoc() {
  if (!state.doc) state.doc = emptyDoc();
  if (!state.doc.scheme) state.doc.scheme = emptyDoc().scheme;
  if (!state.doc.scheme.players) state.doc.scheme.players = {};
  if (!state.doc.scheme.shapes) state.doc.scheme.shapes = [];
  return state.doc;
}
