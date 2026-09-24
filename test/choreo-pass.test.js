import { test } from 'node:test';
import assert from 'node:assert/strict';

const { passPreview, passTargets, passStatus, shotStatus } = await import('../web/src/authoring/choreo-pass.js');

test('shotStatus: open shot, nothing in the way', () => {
  assert.deepEqual(shotStatus('open', [], {}), { key: 'open', text: 'Open shot' });
});

test('shotStatus: goalie verdicts keep the existing shot-line wording', () => {
  assert.deepEqual(shotStatus('blocked-off', [], {}), { key: 'blocked-off', text: 'Goalie in the way, not squared up' });
  assert.deepEqual(shotStatus('blocked-centred', [], {}), { key: 'blocked-centred', text: 'Goalie squared up' });
});

test('shotStatus: an opponent in the lane makes an open shot yellow and is named', () => {
  const players = { d4: { number: '4' } };
  assert.deepEqual(shotStatus('open', ['d4'], players), { key: 'blocked-off', text: 'Blocked by #4' });
  assert.deepEqual(shotStatus('blocked-centred', ['d4'], players), { key: 'blocked-centred', text: 'Goalie squared up, also #4 in the lane' });
});

test('passStatus: clear lane, on time', () => {
  const s = passStatus({ blockedBy: [], late: false, releaseT: 0.5, arriveT: 0.8 }, {}, 1000);
  assert.deepEqual(s, { lane: 'Clear lane', blocked: false, late: null });
});

test('passStatus: names the blockers by number', () => {
  const players = { d4: { number: '4' }, d5: { number: '5' } };
  const s = passStatus({ blockedBy: ['d4', 'd5'], late: false, releaseT: 0.5, arriveT: 0.8 }, players, 1000);
  assert.equal(s.lane, 'Blocked by #4, #5');
  assert.equal(s.blocked, true);
});

test('passStatus: late pass says how long it needs vs the time left', () => {
  const s = passStatus({ blockedBy: [], late: true, releaseT: 0.5, arriveT: 1, needMs: 1333 }, {}, 1000);
  assert.equal(s.late, 'Late: needs 1.3 s, only 0.5 s left in the frame');
});

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const A = { x: 0, z: 0 };
const B = { x: 3000, z: 4000 };   // 5000 mm from A

test('no arrow when the carrier did not change', () => {
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p1', from: A, to: B, trim: 500 }), null);
});

test('no arrow when the ball stayed loose (null -> null)', () => {
  assert.equal(passPreview({ startCarrier: null, carrier: null, from: A, to: B, trim: 500 }), null);
});

test('carrier A -> carrier B trims both ends by the chip radius', () => {
  const out = passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: B, trim: 500 });
  assert.ok(out);
  assert.ok(close(out.from.x, 300) && close(out.from.z, 400), JSON.stringify(out.from));
  assert.ok(close(out.to.x, 2700) && close(out.to.z, 3600), JSON.stringify(out.to));
});

test('carrier -> loose ball trims only the start', () => {
  const out = passPreview({ startCarrier: 'p1', carrier: null, from: A, to: B, trim: 500 });
  assert.ok(close(out.from.x, 300) && close(out.from.z, 400));
  assert.ok(close(out.to.x, 3000) && close(out.to.z, 4000));
});

test('loose ball -> carrier trims only the end', () => {
  const out = passPreview({ startCarrier: null, carrier: 'p2', from: A, to: B, trim: 500 });
  assert.ok(close(out.from.x, 0) && close(out.from.z, 0));
  assert.ok(close(out.to.x, 2700) && close(out.to.z, 3600));
});

test('no arrow when the trimmed length is below the minimum', () => {
  const near = { x: 0, z: 1200 };
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: near, trim: 500, minLen: 300 }), null);
  assert.ok(passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: near, trim: 500, minLen: 100 }));
});

test('no arrow when an endpoint is missing or not finite', () => {
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p2', from: null, to: B, trim: 0 }), null);
  assert.equal(passPreview({ startCarrier: 'p1', carrier: 'p2', from: A, to: { x: NaN, z: 0 }, trim: 0 }), null);
});

const P = [
  { id: 'a', team: 1, number: '7' },
  { id: 'b', team: 1, number: '9' },
  { id: 'c', team: 2, number: '4' },
  { id: 'd', team: 1, number: '10' },
];

test('passTargets: teammates of the carrier, sorted by number, carrier excluded', () => {
  assert.deepEqual(passTargets(P, 'a').map((t) => t.id), ['b', 'd']);
  assert.equal(passTargets(P, 'a')[0].text, '#9');
});

test('passTargets: loose ball lists every player, team 1 first', () => {
  assert.deepEqual(passTargets(P, null).map((t) => t.id), ['a', 'b', 'd', 'c']);
});

test('passTargets: unknown carrier is treated as a loose ball', () => {
  assert.equal(passTargets(P, 'zzz').length, 4);
});

test('passTargets: prefers the chip label when set', () => {
  const out = passTargets([{ id: 'a', team: 1, number: '7' }, { id: 'b', team: 1, number: '9', label: 'Wing' }], 'a');
  assert.equal(out[0].text, '#9 Wing');
});
