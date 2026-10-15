// Dirty-check for trajectory.js (S-BACK-029 H4): the shot-line verdict
// raycasts the goalie mesh, so it should only run when one of its inputs
// moved - the same pattern as coverage.js's coverageInputsChanged().
// Dependency-free so it is unit-testable with plain objects.
import { snapshotChanged, copySnapshot } from './dirty-check.js';

const KEYS = [
  'bx', 'by', 'bz',
  'goal', 'goalX', 'goalZ', 'goalRot',
  'goalie', 'gx', 'gz', 'gRot', 'gVis', 'goalieKey',
  'outline',
];

export function createTrajectoryGate() {
  const last = {};
  const next = {};
  const reset = () => { for (const k of KEYS) last[k] = NaN; };
  reset();

  // { ball, goal, goalie, goalieKey, outline } -> true if anything changed
  // since the last call that returned true.
  function changed({ ball, goal, goalie, goalieKey, outline }) {
    next.bx = ball.x; next.by = ball.y; next.bz = ball.z;
    next.goal = goal;
    next.goalX = goal.position.x; next.goalZ = goal.position.z; next.goalRot = goal.rotation.y;
    next.goalie = goalie;
    next.gx = goalie ? goalie.position.x : NaN;
    next.gz = goalie ? goalie.position.z : NaN;
    next.gRot = goalie ? goalie.rotation.y : NaN;
    next.gVis = goalie ? goalie.visible : null;
    next.goalieKey = goalieKey;
    next.outline = outline;
    if (!snapshotChanged(last, next, KEYS)) return false;
    copySnapshot(last, next, KEYS);
    return true;
  }

  return { changed, reset };
}
