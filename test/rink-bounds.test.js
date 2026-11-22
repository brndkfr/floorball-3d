// S-BACK-033: the command layer's rink bounds. World frame: millimetres,
// x across the rink (-10000..10000, 0 on the centre line), z along it
// (0 at goal A's board .. 40000 at goal B's board); goals at z 3500 / 36500.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RINK_BOUNDS, rinkPointProblem, RINK_FRAME_NOTE } = await import('../web/src/commands/rink-bounds.js');

test('bounds are the rink in world mm: x across, z along', () => {
  assert.deepEqual(RINK_BOUNDS, { xMin: -10000, xMax: 10000, zMin: 0, zMax: 40000 });
});

test('points inside the rink are fine, including goal A in Train', () => {
  assert.equal(rinkPointProblem(0, 3500), null);
  assert.equal(rinkPointProblem(-10000, 0), null);
  assert.equal(rinkPointProblem(10000, 40000), null);
  assert.equal(rinkPointProblem(600, 36500), null);
});

test('the old full-length-as-x value is off the rink, with a useful message', () => {
  const m = rinkPointProblem(-17000, 600);
  assert.match(m, /x/);
  assert.match(m, /-17000/);
  assert.match(m, /-10000/);
  assert.match(m, /10000/);
  assert.match(rinkPointProblem(0, -5), /z/);
  assert.match(rinkPointProblem(0, 40001), /z/);
  assert.match(rinkPointProblem(0, 40001), /40000/);
});

test('the frame note names units, origin, axes and goals', () => {
  for (const w of ['millimetres', 'x', 'z', 'goal A', 'goal B', '3500', '36500']) assert.ok(RINK_FRAME_NOTE.includes(w), w);
});
