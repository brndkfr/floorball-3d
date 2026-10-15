// S-BACK-029 H4: with the trajectory checkbox on, updateTrajectory() raycast
// the ~10k-triangle goalie every frame even when nothing had moved.
// createTrajectoryGate() decides whether any input of that computation
// changed; plain objects stand in for the THREE goal / goalie groups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrajectoryGate } from '../web/src/trajectory-gate.js';

function inputs() {
  return {
    ball: { x: 1, y: 2, z: 3 },
    goal: { position: { x: 0, z: -18000 }, rotation: { y: 0 } },
    goalie: { position: { x: 10, z: -17000 }, rotation: { y: 0.1 }, visible: true },
    goalieKey: 'detailed',
    outline: true,
  };
}

test('first call reports changed, an identical second call does not', () => {
  const gate = createTrajectoryGate();
  const inp = inputs();
  assert.equal(gate.changed(inp), true);
  assert.equal(gate.changed(inp), false);
});

const mutations = {
  'ball x': (i) => { i.ball.x += 1; },
  'ball y': (i) => { i.ball.y += 1; },
  'ball z': (i) => { i.ball.z += 1; },
  'target goal object': (i) => { i.goal = { ...i.goal }; },
  'goal position': (i) => { i.goal.position.z += 1; },
  'goal rotation': (i) => { i.goal.rotation.y += 1; },
  'goalie object': (i) => { i.goalie = { ...i.goalie }; },
  'goalie x': (i) => { i.goalie.position.x += 1; },
  'goalie z': (i) => { i.goalie.position.z += 1; },
  'goalie rotation': (i) => { i.goalie.rotation.y += 1; },
  'goalie visibility': (i) => { i.goalie.visible = false; },
  'goalie removed': (i) => { i.goalie = null; },
  'goalie model': (i) => { i.goalieKey = 'blocky'; },
  'outline toggle': (i) => { i.outline = false; },
};

for (const [name, mutate] of Object.entries(mutations)) {
  test(`a change of ${name} reports changed`, () => {
    const gate = createTrajectoryGate();
    const inp = inputs();
    gate.changed(inp);
    mutate(inp);
    assert.equal(gate.changed(inp), true);
  });
}

test('reset() forces the next call to report changed (lines were hidden meanwhile)', () => {
  const gate = createTrajectoryGate();
  const inp = inputs();
  gate.changed(inp);
  gate.reset();
  assert.equal(gate.changed(inp), true);
});
