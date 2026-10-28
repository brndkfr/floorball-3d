import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptDoc, emptyDoc, isValidId, DOC_VERSION } from '../web/src/authoring/doc.js';

const TRI = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 0, z: 1000 }];

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
    scheme: { players: { p_a1: { team: 'home', x: 1, z: 2 } }, balls: {}, shapes: [] },
  };
  const doc = acceptDoc(v1);
  assert.equal(doc.version, DOC_VERSION);
  assert.equal(doc.frames.length, 1);
  assert.deepEqual(doc.scheme.players, { p_a1: { team: 'home', x: 1, z: 2 } });
});

// --- acceptDoc: goalie schema migration (A-BACK-024) ----------------------

test('acceptDoc migrates a per-frame scheme.goalie into scheme.goalies.A', () => {
  const raw = {
    version: DOC_VERSION,
    currentFrame: 0,
    frames: [{
      id: 'f_1',
      duration: 1000,
      scheme: { players: {}, balls: {}, shapes: [], goalie: { x: 100, z: 200, angle: 0.5 } },
    }],
  };
  const doc = acceptDoc(raw);
  assert.deepEqual(doc.scheme.goalies, { A: { x: 100, z: 200, angle: 0.5 } });
  assert.equal(doc.scheme.goalie, undefined);
});

test('acceptDoc migrates a v1 doc\'s scheme.goalie into scheme.goalies.A too', () => {
  const v1 = {
    version: 1,
    hideMarkup: false,
    scheme: { players: {}, balls: {}, shapes: [], goalie: { x: 10, z: 20, angle: 1 } },
  };
  const doc = acceptDoc(v1);
  assert.deepEqual(doc.scheme.goalies, { A: { x: 10, z: 20, angle: 1 } });
});

test('acceptDoc leaves an already-migrated scheme.goalies untouched', () => {
  const raw = {
    version: DOC_VERSION,
    currentFrame: 0,
    frames: [{
      id: 'f_1',
      duration: 1000,
      scheme: { players: {}, balls: {}, shapes: [], goalies: { A: { x: 1, z: 2, angle: 0 }, B: { x: 3, z: 4, angle: 1 } } },
    }],
  };
  const doc = acceptDoc(raw);
  assert.deepEqual(doc.scheme.goalies, { A: { x: 1, z: 2, angle: 0 }, B: { x: 3, z: 4, angle: 1 } });
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
          'p_ok1': { id: 'p_ok1', team: 1, x: 0, z: 0 },
          '"><img src=x onerror=alert(1)>': { team: 2, x: 0, z: 0 },
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
          { id: 'shape_ok', type: 'zone', points: TRI },
          { id: '<script>evil()</script>', type: 'zone', points: TRI },
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

// --- acceptDoc: structural validation (S-BACK-029 H2) -------------------
// A share link or imported file is untrusted. Before H2 only ids were
// checked, so e.g. a zone without `points` passed, was saved as the current
// project and then threw in rebuildShapesFromDoc() during boot - on every
// reload. acceptDoc() also loads every saved project, so a valid doc must
// come through unchanged.

const frameWith = (scheme, extra = {}) => ({
  version: DOC_VERSION,
  currentFrame: 0,
  frames: [{ id: 'f_1', duration: 1000, scheme: { players: {}, balls: {}, shapes: [], cones: [], ...scheme }, ...extra }],
});

function fullValidDoc() {
  return {
    version: DOC_VERSION,
    meta: { id: 'proj_abc', name: 'Zone entry', createdAt: 1, modifiedAt: 2 },
    hideMarkup: false,
    zones: ['slotNear', 'pocket'],
    currentFrame: 1,
    frames: [
      {
        id: 'f_1',
        duration: 1000,
        camera: { mode: 'perspective', position: [1, 2, 3], quaternion: [0, 0, 0, 1], fov: 50, zoom: 1 },
        scheme: {
          players: {
            p_1: { id: 'p_1', team: 1, number: '7', x: 100, z: -200, angle: 0.5, label: 'Wing', role: 'C', hidden: false },
            p_2: { id: 'p_2', team: 2, number: 12, x: 0, z: 0 },
          },
          balls: { main: { x: 10, z: 20, carrier: 'p_1', color: '#ff0' }, extras: [{ id: 'b_1', x: 1, z: 2, color: '#fff' }] },
          goalies: { A: { x: 0, z: -18000, angle: 0 } },
          goals: {
            extras: [{ id: 'g_1', x: 0, z: 0, rotY: 1.2, label: 'Mini', labelVisible: true, labelColor: '#fff', labelSize: 900 }],
            fixed: { A: { label: 'Home' } },
          },
          shapes: [
            { id: 's_1', type: 'arrow', points: [{ x: 0, z: 0 }, { x: 500, z: 500 }], width: 120, shaftStyle: 'dashed', headStyle: 'filled', smooth: true, color: '#ffb347', label: 'Pass', labelSize: 600, labelBold: true, labelRotation: 0.2, layer: 'mid' },
            { id: 's_2', type: 'zone', kind: 'rect', x: 0, z: 0, w: 1000, h: 500, points: TRI, opacity: 0.4, label: 'Slot', hidden: true },
            { id: 's_3', type: 'zone', kind: 'circle', cx: 0, cz: 0, r: 800, points: TRI },
            { id: 's_4', type: 'text', text: 'Go', x: 5, z: 6, size: 1500, color: '#fff', layer: 'high' },
          ],
          cones: [{ id: 'c_1', kind: 'disc', x: 3, z: 4, color: '#f80' }],
        },
      },
      { id: 'f_2', duration: 800, scheme: { players: {}, balls: {}, shapes: [], cones: [], goalies: {} } },
    ],
  };
}

test('acceptDoc keeps a realistic valid doc unchanged', () => {
  const raw = fullValidDoc();
  const doc = acceptDoc(structuredClone(raw));
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), raw);
});

test('acceptDoc rejects a doc whose frames are not a non-empty array of objects', () => {
  assert.equal(acceptDoc({ version: DOC_VERSION, frames: 'x' }), null);
  assert.equal(acceptDoc({ version: DOC_VERSION }), null);
  assert.equal(acceptDoc({ version: DOC_VERSION, frames: [] }), null);
  assert.equal(acceptDoc({ version: DOC_VERSION, frames: [null, 5] }), null);
});

test('acceptDoc rejects a doc with an absurd number of frames', () => {
  const raw = frameWith({});
  raw.frames = Array.from({ length: 5000 }, (_, i) => ({ ...raw.frames[0], id: `f_${i}` }));
  assert.equal(acceptDoc(raw), null);
});

test('acceptDoc drops non-object frames and repairs a non-object scheme', () => {
  const raw = frameWith({});
  raw.frames.push(7, { id: 'f_2', duration: 500, scheme: 'boom' });
  const doc = acceptDoc(raw);
  assert.equal(doc.frames.length, 2);
  assert.deepEqual(doc.frames[1].scheme, { players: {}, balls: {}, shapes: [], cones: [], goalies: {} });
});

test('acceptDoc drops shapes the renderer cannot build', () => {
  const doc = acceptDoc(frameWith({ shapes: [
    { id: 'z1', type: 'zone' }, // no points (the audit's example)
    { id: 'z2', type: 'zone', points: [{ x: 0, z: 0 }, 'x', { x: 1, z: 1 }] },
    { id: 'a1', type: 'arrow', points: 'nope' },
    { id: 't1', type: 'text', text: 'hi', x: 'a', z: 0 },
    { id: 'u1', type: 'blob', points: TRI },
    null,
    { id: 'ok', type: 'zone', points: TRI },
  ] }));
  assert.deepEqual(doc.scheme.shapes.map((s) => s.id), ['ok']);
});

test('acceptDoc removes shape fields of the wrong type instead of crashing later', () => {
  const doc = acceptDoc(frameWith({ shapes: [
    { id: 's1', type: 'zone', points: TRI, layer: 'x', label: 5, color: {}, opacity: 'a', labelSize: NaN },
    { id: 's2', type: 'arrow', points: TRI, width: -1, shaftStyle: 3, smooth: 'yes' },
  ] }));
  const [z, a] = doc.scheme.shapes;
  assert.deepEqual(Object.keys(z).sort(), ['id', 'points', 'type']);
  assert.equal(a.width, undefined);
  assert.equal(a.shaftStyle, undefined);
  assert.equal(a.smooth, 'yes'); // only `!== false` is read: harmless, kept
});

test('acceptDoc truncates oversized strings', () => {
  const doc = acceptDoc(frameWith({ shapes: [{ id: 't', type: 'text', x: 0, z: 0, text: 'a'.repeat(100000) }] }));
  assert.ok(doc.scheme.shapes[0].text.length <= 500);
});

test('acceptDoc drops players that are not objects or have no finite position', () => {
  const doc = acceptDoc(frameWith({ players: {
    p_null: null,
    p_str: 'x',
    p_nopos: { id: 'p_nopos', team: 1 },
    p_inf: { id: 'p_inf', team: 1, x: Infinity, z: 0 },
    p_ok: { id: 'p_ok', team: 1, x: 0, z: 0, label: 5, role: [], angle: 'a', number: {} },
  } }));
  assert.deepEqual(Object.keys(doc.scheme.players), ['p_ok']);
  assert.deepEqual(doc.scheme.players.p_ok, { id: 'p_ok', team: 1, x: 0, z: 0 });
});

test('acceptDoc keeps a valid stick hand and drops an invalid one (A-BACK-034)', () => {
  const doc = acceptDoc(frameWith({ players: {
    p_r: { id: 'p_r', team: 1, x: 0, z: 0, hand: 'R' },
    p_x: { id: 'p_x', team: 1, x: 0, z: 0, hand: 'left' },
  } }));
  assert.equal(doc.scheme.players.p_r.hand, 'R');
  assert.ok(!('hand' in doc.scheme.players.p_x));
});

test('acceptDoc keeps a player id consistent with its key', () => {
  const doc = acceptDoc(frameWith({ players: { p_a: { id: 'p_b', team: 1, x: 0, z: 0 } } }));
  assert.equal(doc.scheme.players.p_a.id, 'p_a');
});

test('acceptDoc validates cones, extra balls, extra goals, goalies and the main ball', () => {
  const doc = acceptDoc(frameWith({
    cones: [{ id: 'c1', x: 0 }, { id: 'c2', x: 0, z: 0, color: 5 }, 'x'],
    balls: { main: { x: 'a', z: 0 }, extras: [{ id: 'b1', x: 0, z: 0 }, { id: 'b2' }] },
    goals: {
      extras: [{ id: 'g1', x: 0, z: 0, label: 5, rotY: 'r' }, { id: 'g2', x: null, z: 0 }],
      fixed: { A: { label: 7 }, C: {} },
    },
    goalies: { A: { x: 'a', z: 0 }, B: { x: 0, z: 0, angle: 1 } },
  }));
  const s = doc.scheme;
  assert.deepEqual(s.cones, [{ id: 'c2', x: 0, z: 0 }]);
  assert.equal(s.balls.main, undefined);
  assert.deepEqual(s.balls.extras.map((b) => b.id), ['b1']);
  assert.deepEqual(s.goals.extras, [{ id: 'g1', x: 0, z: 0 }]);
  assert.deepEqual(s.goals.fixed, { A: {} });
  assert.deepEqual(s.goalies, { B: { x: 0, z: 0, angle: 1 } });
});

test('acceptDoc drops a malformed frame camera and a bad duration', () => {
  const doc = acceptDoc(frameWith({}, { camera: { mode: 'perspective', position: [1, 2], quaternion: 'q' }, duration: 'slow' }));
  assert.equal(doc.frames[0].camera, undefined);
  assert.equal(doc.frames[0].duration, undefined);
});
