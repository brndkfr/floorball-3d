// A-BACK-054 / A-Q-011: Train mode works on its own practice rink. Entering
// stashes the Plan doc as JSON; leaving restores it deep-equal, untouched by
// anything done in Train. The default practice situation: the ball in the
// danger zone in front of goal A, no players, the goalies where they stand.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { practiceDoc, stashPlanDoc, restorePlanDoc, PRACTICE_BALL } = await import('../web/src/authoring/train-session.js');
const { emptyDoc, acceptDoc } = await import('../web/src/authoring/doc.js');
const { GOAL_LINE_FROM_BOARD, RINK_L } = await import('../web/src/constants.js');

function planDoc() {
  const d = acceptDoc(JSON.parse(JSON.stringify(emptyDoc())));
  d.meta.name = 'My power play';
  d.scheme.players.p1 = { id: 'p1', team: 'A', number: 7, x: 1000, z: 15000 };
  d.scheme.goalies = { A: { x: 200, z: 3800, angle: 0.3 } };
  return d;
}

test('practiceDoc: one frame, no players, the ball in front of goal A, its own name and id', () => {
  const d = practiceDoc();
  assert.equal(d.frames.length, 1);
  assert.deepEqual(d.scheme.players, {});
  const ball = d.scheme.balls.main;
  assert.deepEqual(ball, { x: PRACTICE_BALL.x, z: PRACTICE_BALL.z, carrier: null });
  assert.ok(ball.z > GOAL_LINE_FROM_BOARD + 3000 && ball.z < GOAL_LINE_FROM_BOARD + 12500, 'danger zone depth, goal A end');
  assert.ok(ball.z < RINK_L / 2);
  assert.equal(d.meta.name, 'Goalie training');
  assert.notEqual(practiceDoc().meta.id, d.meta.id);
  assert.ok(Object.getOwnPropertyDescriptor(d, 'scheme'), 'scheme accessor installed (acceptDoc)');
});

test('practiceDoc: every call is a fresh doc', () => {
  const a = practiceDoc();
  a.scheme.balls.main.x = 9999;
  assert.equal(practiceDoc().scheme.balls.main.x, PRACTICE_BALL.x);
});

test('stash then restore returns the Plan doc deep-equal, whatever happens to the original meanwhile', () => {
  const plan = planDoc();
  const before = JSON.stringify(plan);
  const stash = stashPlanDoc(plan);
  assert.equal(typeof stash, 'string');
  plan.scheme.goalies.A.x = -5000;          // what moving the goalie in Train must never reach
  plan.meta.name = 'changed';
  const back = restorePlanDoc(stash);
  assert.equal(JSON.stringify(back), before);
  assert.equal(back.scheme.players.p1.number, 7, 'scheme accessor reinstalled');
});

test('restorePlanDoc of nothing gives null', () => {
  assert.equal(restorePlanDoc(null), null);
  assert.equal(restorePlanDoc(''), null);
});
