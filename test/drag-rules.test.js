// Which objects a left-drag moves (selection.js). Plan: chips, shapes, cones,
// extra balls and extra goals, in the 2D view only (in 3D a left-drag orbits
// the camera). Train (A-BACK-054 follow-up): the match ball and the goalies,
// in 2D and 3D alike, since Train has no 2D / 3D switch and moving them is
// the whole exercise. An active tool always wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { canBodyDrag } = await import('../web/src/drag-rules.js');

const PLAN_KINDS = ['chip', 'shape', 'cone', 'extraBall', 'extraGoal'];

test('Plan: the usual kinds in 2D only; ball and goalies never', () => {
  for (const kind of PLAN_KINDS) {
    assert.equal(canBodyDrag(kind, { mode: 'plan', topDown: true, tool: null }), true, kind);
    assert.equal(canBodyDrag(kind, { mode: 'plan', topDown: false, tool: null }), false, kind);
  }
  for (const kind of ['matchBall', 'goalie']) assert.equal(canBodyDrag(kind, { mode: 'plan', topDown: true, tool: null }), false, kind);
});

test('Train: the match ball and the goalies, in 3D and 2D; nothing else', () => {
  for (const topDown of [false, true]) {
    for (const kind of ['matchBall', 'goalie']) assert.equal(canBodyDrag(kind, { mode: 'train', topDown, tool: null }), true, `${kind} ${topDown}`);
    for (const kind of PLAN_KINDS) assert.equal(canBodyDrag(kind, { mode: 'train', topDown, tool: null }), false, kind);
  }
});

test('an active tool, no object, or another mode: no drag', () => {
  assert.equal(canBodyDrag('chip', { mode: 'plan', topDown: true, tool: 'arrow' }), false);
  assert.equal(canBodyDrag('goalie', { mode: 'train', topDown: false, tool: 'chip' }), false);
  assert.equal(canBodyDrag(null, { mode: 'train', topDown: false, tool: null }), false);
  assert.equal(canBodyDrag('goalie', { mode: 'analyze', topDown: false, tool: null }), false);
});
