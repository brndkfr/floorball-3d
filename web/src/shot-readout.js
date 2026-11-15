// The shot readout (A-BACK-045 step 4): one answer for the Inspector's
// verdict card and the verdict chip on the rink.
//   goal         'A' | 'B'
//   key          shooting-line verdict: 'open' | 'blocked-off' | 'blocked-centred'
//   pctBlocked   % of the goal mouth the goalie covers from the ball
// Both numbers come from insights.js, which tests the goalie's proxy
// (A-BACK-042), so they agree and cost well under a millisecond.

import * as THREE from 'three';
import { GOAL_CENTER_LOCAL, RINK_L } from './constants.js';
import { shotVerdict, coverageGrid } from './insights.js';
import { state, getBallWorldCenter, goalieForGoal, shotGoal } from './state.js';
import { createTrajectoryGate } from './trajectory-gate.js';

const goalCenter = new THREE.Vector3();

export function shotReadout({ ballWorld, goal, goalie }) {
  const shown = goalie && goalie.visible !== false ? goalie : null;
  goalCenter.copy(GOAL_CENTER_LOCAL);
  goal.localToWorld(goalCenter);
  return {
    goal: goal.position.z < RINK_L / 2 ? 'A' : 'B',
    key: shotVerdict({ ballWorld, goalCenterWorld: goalCenter, goalieMesh: shown }).lineColor,
    pctBlocked: coverageGrid({ ballWorld, targetGoalGroup: goal, goalieMesh: shown }).pctBlocked,
  };
}

// App side: recomputed only when the ball, the target goal or its goalie
// moved (same gate as trajectory.js), kept in state.shotReadout, announced
// with a `shotReadoutChanged` window event. Called from main.js's loop.
const gate = createTrajectoryGate();

export function updateShotReadout() {
  const ball = getBallWorldCenter();
  const goal = shotGoal();
  if (!ball || !goal) {
    if (state.shotReadout) {
      state.shotReadout = null;
      gate.reset();
      window.dispatchEvent(new Event('shotReadoutChanged'));
    }
    return;
  }
  const goalie = goalieForGoal(goal);
  if (!gate.changed({ ball, goal, goalie, goalieKey: state.activeGoalieKey, outline: false })) return;
  goal.updateMatrixWorld(true);
  goalie?.updateMatrixWorld(true);
  state.shotReadout = shotReadout({ ballWorld: ball, goal, goalie });
  window.dispatchEvent(new Event('shotReadoutChanged'));
}
