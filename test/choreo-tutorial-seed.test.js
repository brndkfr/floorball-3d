import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildTutorialDoc, TUTORIAL_NAME } = await import('../web/src/authoring/choreo-tutorial-seed.js');
const { acceptDoc } = await import('../web/src/authoring/doc.js');
const { RINK_L, HALF_W } = await import('../web/src/constants.js');

const players = (doc) => Object.values(doc.frames[0].scheme.players);
const byNumber = (doc, n) => players(doc).find((p) => p.number === String(n));

test('seed survives a JSON round-trip through acceptDoc', () => {
  const doc = acceptDoc(JSON.parse(JSON.stringify(buildTutorialDoc())));
  assert.ok(doc);
  assert.equal(doc.frames.length, 1);
  assert.equal(doc.currentFrame, 0);
  assert.equal(players(doc).length, 3);
  assert.equal(doc.meta.name, TUTORIAL_NAME);
});

test('seed has attackers #7 and #9 on team 1 and one defender on team 2', () => {
  const doc = buildTutorialDoc();
  assert.equal(byNumber(doc, 7)?.team, 1);
  assert.equal(byNumber(doc, 9)?.team, 1);
  assert.equal(players(doc).filter((p) => p.team === 2).length, 1);
});

test('#7 carries the ball and the stored ball position sits next to him', () => {
  const doc = buildTutorialDoc();
  const seven = byNumber(doc, 7);
  const ball = doc.frames[0].scheme.balls.main;
  assert.equal(ball.carrier, seven.id);
  assert.ok(Math.hypot(ball.x - seven.x, ball.z - seven.z) < 500);
});

test('every player is well inside the boards and keyed by its own id', () => {
  const doc = buildTutorialDoc();
  const margin = 2000;   // rink x is centred on 0: [-HALF_W, HALF_W]; z is [0, RINK_L]
  for (const [key, p] of Object.entries(doc.frames[0].scheme.players)) {
    assert.equal(key, p.id);
    assert.ok(Math.abs(p.x) < HALF_W - margin, `x ${p.x}`);
    assert.ok(p.z > margin && p.z < RINK_L - margin, `z ${p.z}`);
  }
});

test('the defender stands between #7 and #9 so the pass reads as a pass', () => {
  const doc = buildTutorialDoc();
  const a = byNumber(doc, 7), b = byNumber(doc, 9);
  const d = players(doc).find((p) => p.team === 2);
  const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
  assert.ok(d.z > minZ && d.z < maxZ);
});

test('each call returns a fresh project and player ids', () => {
  const a = buildTutorialDoc(), b = buildTutorialDoc();
  assert.notEqual(a.meta.id, b.meta.id);
  assert.notEqual(byNumber(a, 7).id, byNumber(b, 7).id);
});
