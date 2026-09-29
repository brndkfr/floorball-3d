// A-BACK-026: the palette's Ball tool places the match ball (scheme.balls.main).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ballToolAction, placeMatchBall, swapWithMatchBall } = await import('../web/src/authoring/ball-tool.js');

test('ballToolAction: plain floor click moves the match ball', () => {
  assert.deepEqual(ballToolAction({ tool: 'ball', chipId: null, shift: false }), { kind: 'move' });
});

test('ballToolAction: click on a chip hands that player the ball', () => {
  assert.deepEqual(ballToolAction({ tool: 'ball', chipId: 'p1', shift: false }), { kind: 'carry', chipId: 'p1' });
});

test('ballToolAction: Shift+click with the Ball tool drops an extra ball, even over a chip', () => {
  assert.deepEqual(ballToolAction({ tool: 'ball', chipId: null, shift: true }), { kind: 'extra' });
  assert.deepEqual(ballToolAction({ tool: 'ball', chipId: 'p1', shift: true }), { kind: 'extra' });
});

test('ballToolAction: the Extra ball tool always drops an extra', () => {
  assert.deepEqual(ballToolAction({ tool: 'ball-extra', chipId: 'p1', shift: false }), { kind: 'extra' });
  assert.deepEqual(ballToolAction({ tool: 'ball-extra', chipId: null, shift: false }), { kind: 'extra' });
});

test('ballToolAction: other tools are not ball actions', () => {
  assert.equal(ballToolAction({ tool: 'chip', chipId: null, shift: false }), null);
  assert.equal(ballToolAction({ tool: null, chipId: null, shift: false }), null);
});

test('placeMatchBall: moves the ball, detaches it and drops pass + shot', () => {
  const scheme = { balls: { main: { x: 0, z: 0, carrier: 'p1', color: '#ff0000', pass: { releaseT: 0.5 }, shot: { goal: 'A' } } } };
  placeMatchBall(scheme, { x: 1200, z: -3400 });
  assert.deepEqual(scheme.balls.main, { x: 1200, z: -3400, carrier: null, color: '#ff0000' });
});

test('placeMatchBall: creates balls.main when the frame has none yet', () => {
  const scheme = {};
  placeMatchBall(scheme, { x: 5, z: 6 });
  assert.deepEqual(scheme.balls.main, { x: 5, z: 6, carrier: null });
});

test('placeMatchBall: only touches the scheme it is given (other frames keep their ball)', () => {
  const other = { balls: { main: { x: 1, z: 1, carrier: 'p2' } } };
  const current = { balls: { main: { x: 1, z: 1, carrier: 'p2' } } };
  placeMatchBall(current, { x: 9, z: 9 });
  assert.deepEqual(other.balls.main, { x: 1, z: 1, carrier: 'p2' });
});

test('swapWithMatchBall: extra and match ball trade position and colour', () => {
  const scheme = { balls: {
    main: { x: 0, z: 0, carrier: null, color: '#ffffff' },
    extras: [{ id: 'b1', x: 100, z: 200, color: '#aa66ff', label: 'Rebound' }],
  } };
  assert.equal(swapWithMatchBall(scheme, 'b1', { x: 0, z: 0 }), true);
  assert.deepEqual(scheme.balls.main, { x: 100, z: 200, carrier: null, color: '#aa66ff' });
  assert.deepEqual(scheme.balls.extras[0], { id: 'b1', x: 0, z: 0, color: '#ffffff', label: 'Rebound' });
});

test('swapWithMatchBall: a carried match ball leaves the extra at its shown spot and detaches', () => {
  const scheme = { balls: {
    main: { x: 0, z: 0, carrier: 'p1', pass: { releaseT: 0.3 } },
    extras: [{ id: 'b1', x: 100, z: 200 }],
  } };
  swapWithMatchBall(scheme, 'b1', { x: 700, z: 800 });
  assert.deepEqual(scheme.balls.main, { x: 100, z: 200, carrier: null });
  assert.deepEqual(scheme.balls.extras[0], { id: 'b1', x: 700, z: 800 });
});

test('swapWithMatchBall: unknown extra id is a no-op', () => {
  const scheme = { balls: { main: { x: 0, z: 0, carrier: null }, extras: [] } };
  assert.equal(swapWithMatchBall(scheme, 'nope', { x: 0, z: 0 }), false);
  assert.deepEqual(scheme.balls.main, { x: 0, z: 0, carrier: null });
});
