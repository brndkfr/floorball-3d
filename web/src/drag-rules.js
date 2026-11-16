// Which objects a left-drag on their body moves (selection.js). Pure so it
// is Node-testable.
//   Plan: chips, shapes, cones, extra balls, extra goals; 2D view only
//     (in 3D a left-drag orbits the camera; ball and goalies move with the
//     arrow keys).
//   Train (A-BACK-054): the match ball and the goalies, in 2D and 3D alike;
//     moving them is the exercise and Train has no 2D / 3D switch.
// An active tool always wins.

const PLAN_KINDS = new Set(['chip', 'shape', 'cone', 'extraBall', 'extraGoal']);
const TRAIN_KINDS = new Set(['matchBall', 'goalie']);

export function canBodyDrag(kind, { mode, topDown, tool }) {
  if (!kind || tool) return false;
  if (mode === 'train') return TRAIN_KINDS.has(kind);
  if (mode === 'plan') return topDown && PLAN_KINDS.has(kind);
  return false;
}
