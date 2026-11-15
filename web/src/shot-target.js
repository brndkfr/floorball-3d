// Which goal the shot overlays aim at (trajectory lines, shooting line,
// coverage, align goalie, view from the ball). three-free.
//
// The user's pick (a goal or its goalie, clicked on the canvas or in the
// Layers panel) wins; otherwise the goal nearer the ball. Before this the
// overlays showed nothing until a goal was clicked, and in the fitted 3D
// overview the goalie stands in front of a goal a few pixels wide.

import { nearestGoal } from './authoring/ball-pose.js';

export function shotGoalLetter(pickedLetter, ballZ) {
  if (pickedLetter === 'A' || pickedLetter === 'B') return pickedLetter;
  return Number.isFinite(ballZ) ? nearestGoal(ballZ) : 'A';
}

// 'A' / 'B' when `obj` is goal A / B (`goals` = [A, B]) or the goalie at
// that end (`goalies.A` / `goalies.B`), else null.
export function goalLetterForPick(obj, goals, goalies) {
  if (obj == null) return null;
  const i = goals.indexOf(obj);
  if (i === 0) return 'A';
  if (i === 1) return 'B';
  if (obj === goalies?.A) return 'A';
  if (obj === goalies?.B) return 'B';
  return null;
}
