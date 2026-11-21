// The live KATA readout (A-BACK-046): state.kataReadout for the goalie of
// the defending goal (the one the zones are drawn for), against the ball's
// zone and the expected action. Fires `kataReadoutChanged` when what the
// Train panel shows changes. Called from main.js's loop; only works in
// Train mode, where the KATA section lives.
//
// state.kataReadout = { goal, zone, action, actionAuto, kata, judged, pct, inputs, targets }
// state.kataAction  = null (Auto: from the play) | 'shot' | 'pass' | 'dribble'

import { state, getBallWorldCenter } from './state.js';
import { GOAL_CENTER_LOCAL } from './constants.js';
import { kataOf, kataTargets, judgeKata, expectedAction, shotAngleDeg } from './kata.js';

let lastKey = null;

function publish(value, key) {
  if (key === lastKey) return;
  lastKey = key;
  state.kataReadout = value;
  window.dispatchEvent(new Event('kataReadoutChanged'));
}

export function updateKataReadout() {
  const zone = state.goalieZone;
  const ball = getBallWorldCenter();
  const goalGroup = zone ? state.goalInstances[zone.goal === 'B' ? 1 : 0] : null;
  const goalie = zone ? state.goalies[zone.goal] : null;
  if (document.body.dataset.mode !== 'train' || !zone || !ball || !goalGroup || !goalie) return publish(null, null);

  const gc = goalGroup.localToWorld(GOAL_CENTER_LOCAL.clone());
  const actionAuto = expectedAction(state.doc?.frames, state.playback?.elapsed ?? 0);
  const action = state.kataAction ?? actionAuto;
  const inputs = {
    ball: { x: ball.x, z: ball.z },
    goal: zone.goal,
    goalCenter: { x: gc.x, z: gc.z },
    goalie: { x: goalie.position.x, z: goalie.position.z, yaw: goalie.rotation.y },
  };
  const kata = kataOf(inputs);
  const targets = kataTargets(zone.zone, action, shotAngleDeg(inputs.ball, zone.goal, inputs.goalCenter));
  const judged = judgeKata(kata, targets);
  const pct = state.shotReadout?.goal === zone.goal ? state.shotReadout.pctBlocked : null;
  const key = JSON.stringify([zone, action, actionAuto, Math.round(kata.placementLeftMm / 10), Math.round(kata.depthMm / 10),
    Math.round(kata.axisDeg), Math.round(kata.axisToLineDeg), judged, pct == null ? null : Math.round(pct), state.lang]);
  publish({ goal: zone.goal, zone: zone.zone, action, actionAuto, kata, judged, pct, inputs, targets }, key);   // inputs + targets: KATA marks
}

export function setKataAction(action) {
  state.kataAction = action;
  updateKataReadout();
}
