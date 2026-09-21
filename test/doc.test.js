import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptDoc, emptyDoc, isValidId, DOC_VERSION } from '../web/src/authoring/doc.js';

// --- isValidId ----------------------------------------------------------

test('isValidId accepts newId()-shaped ids', () => {
  assert.equal(isValidId('p_ab12cd34'), true);
  assert.equal(isValidId('f_xyz'), true);
});

test('isValidId rejects non-id-shaped strings', () => {
  assert.equal(isValidId(''), false);
  assert.equal(isValidId('<script>'), false);
  assert.equal(isValidId('"><img src=x onerror=alert(1)>'), false);
  assert.equal(isValidId('has space'), false);
  assert.equal(isValidId(null), false);
  assert.equal(isValidId(undefined), false);
  assert.equal(isValidId(42), false);
});

// --- acceptDoc: basic shape / version handling ---------------------------

test('acceptDoc rejects non-object and unknown-version input', () => {
  assert.equal(acceptDoc(null), null);
  assert.equal(acceptDoc('not a doc'), null);
  assert.equal(acceptDoc({ version: 99 }), null);
});

test('acceptDoc returns a usable v2 doc for a fresh emptyDoc()', () => {
  const doc = acceptDoc(JSON.parse(JSON.stringify(emptyDoc())));
  assert.equal(doc.version, DOC_VERSION);
  assert.equal(doc.frames.length, 1);
  // scheme accessor must be reinstalled after the JSON round-trip
  assert.deepEqual(doc.scheme, doc.frames[0].scheme);
});

test('acceptDoc migrates a v1 doc to v2', () => {
  const v1 = {
    version: 1,
    hideMarkup: false,
    scheme: { players: { p_a1: { team: 'home' } }, balls: {}, shapes: [] },
  };
  const doc = acceptDoc(v1);
  assert.equal(doc.version, DOC_VERSION);
  assert.equal(doc.frames.length, 1);
  assert.deepEqual(doc.scheme.players, { p_a1: { team: 'home' } });
});

// --- acceptDoc: id sanitization (S-BACK-002) ------------------------------

test('acceptDoc drops scheme.players entries with a malformed id key', () => {
  const raw = {
    version: DOC_VERSION,
    currentFrame: 0,
    frames: [{
      id: 'f_1',
      duration: 1000,
      scheme: {
        players: {
          'p_ok1': { team: 'home' },
          '"><img src=x onerror=alert(1)>': { team: 'away' },
        },
        balls: {},
        shapes: [],
      },
    }],
  };
  const doc = acceptDoc(raw);
  assert.deepEqual(Object.keys(doc.scheme.players), ['p_ok1']);
});

test('acceptDoc drops shapes with a malformed id', () => {
  const raw = {
    version: DOC_VERSION,
    currentFrame: 0,
    frames: [{
      id: 'f_1',
      duration: 1000,
      scheme: {
        players: {},
        balls: {},
        shapes: [
          { id: 'shape_ok', type: 'zone' },
          { id: '<script>evil()</script>', type: 'zone' },
        ],
      },
    }],
  };
  const doc = acceptDoc(raw);
  assert.equal(doc.scheme.shapes.length, 1);
  assert.equal(doc.scheme.shapes[0].id, 'shape_ok');
});

test('acceptDoc drops frame.photo players with malformed ids and clears dangling references', () => {
  const raw = {
    version: DOC_VERSION,
    currentFrame: 0,
    frames: [{
      id: 'f_1',
      duration: 1000,
      scheme: { players: {}, balls: {}, shapes: [] },
      photo: {
        players: [
          { id: 'pl_ok', team: 'home' },
          { id: '"><svg onload=alert(1)>', team: 'home' },
        ],
        ballCarrier: '"><svg onload=alert(1)>',
        goalies: { home: 'pl_ok', away: '"><svg onload=alert(1)>' },
      },
    }],
  };
  const doc = acceptDoc(raw);
  const photo = doc.frames[0].photo;
  assert.deepEqual(photo.players.map((p) => p.id), ['pl_ok']);
  // dangling reference to the dropped id must be cleared, not left pointing
  // at a player that no longer exists
  assert.equal(photo.ballCarrier, null);
  assert.equal(photo.goalies.home, 'pl_ok');
  assert.equal(photo.goalies.away, null);
});

test('acceptDoc keeps valid frame.photo data untouched', () => {
  const raw = {
    version: DOC_VERSION,
    currentFrame: 0,
    frames: [{
      id: 'f_1',
      duration: 1000,
      scheme: { players: {}, balls: {}, shapes: [] },
      photo: {
        players: [{ id: 'pl_ok', team: 'home' }],
        ballCarrier: 'pl_ok',
        goalies: { home: 'pl_ok', away: null },
      },
    }],
  };
  const doc = acceptDoc(raw);
  const photo = doc.frames[0].photo;
  assert.equal(photo.players.length, 1);
  assert.equal(photo.ballCarrier, 'pl_ok');
  assert.equal(photo.goalies.home, 'pl_ok');
});
