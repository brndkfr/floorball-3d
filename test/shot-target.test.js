// Which goal the shot overlays (trajectory lines, shooting line, coverage,
// align goalie, view from the ball) aim at: the goal the user picked, else
// the goal nearer the ball. Before this, nothing showed until a goal was
// clicked, and in the fitted 3D overview the goalie covers the goal.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { shotGoalLetter, goalLetterForPick } = await import('../web/src/shot-target.js');
const { GOAL_Z } = await import('../web/src/authoring/ball-pose.js');

test('shotGoalLetter: an explicit pick wins, else the goal nearer the ball', () => {
  assert.equal(shotGoalLetter(null, GOAL_Z.A + 2000), 'A');
  assert.equal(shotGoalLetter(null, GOAL_Z.B - 2000), 'B');
  assert.equal(shotGoalLetter('B', GOAL_Z.A + 2000), 'B');
  assert.equal(shotGoalLetter('A', GOAL_Z.B - 100), 'A');
});

test('shotGoalLetter: no ball and no pick means goal A', () => {
  assert.equal(shotGoalLetter(null, null), 'A');
  assert.equal(shotGoalLetter('B', null), 'B');
});

test('goalLetterForPick: a goal or its goalie targets that goal, anything else nothing', () => {
  const goals = ['goalA', 'goalB'];
  const goalies = { A: 'goalieA', B: 'goalieB', blockyA: 'x' };
  assert.equal(goalLetterForPick('goalA', goals, goalies), 'A');
  assert.equal(goalLetterForPick('goalB', goals, goalies), 'B');
  assert.equal(goalLetterForPick('goalieB', goals, goalies), 'B');
  assert.equal(goalLetterForPick('goalieA', goals, goalies), 'A');
  assert.equal(goalLetterForPick('chip', goals, goalies), null);
  assert.equal(goalLetterForPick(null, goals, goalies), null);
});
