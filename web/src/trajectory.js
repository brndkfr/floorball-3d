import * as THREE from 'three';
import { GOAL_MOUTH_CORNERS_LOCAL, GOAL_CENTER_LOCAL } from './constants.js';
import { state, getBallWorldCenter } from './state.js';
import { scene } from './scene.js';
import { selectObject } from './selection.js';
import { shotVerdict, shotLineXAtZ } from './insights.js';

// --- ball-to-goal trajectory lines ---
const trajectoryCheckbox = document.getElementById('trajectoryCheckbox');

const trajectoryGeometry = new THREE.BufferGeometry();
trajectoryGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GOAL_MOUTH_CORNERS_LOCAL.length * 2 * 3), 3));
const trajectoryLines = new THREE.LineSegments(
  trajectoryGeometry,
  new THREE.LineBasicMaterial({ color: 0xffe066 })
);
trajectoryLines.visible = false;
// We mutate the position buffer directly every frame (needsUpdate = true
// only re-uploads it to the GPU, it does NOT refresh the cached bounding
// sphere three.js uses for frustum culling) - disable culling for this
// object entirely so a stale bounding sphere never makes it vanish from an
// unexpected camera angle.
trajectoryLines.frustumCulled = false;
scene.add(trajectoryLines);

// dotted "shooting line" - ball centre straight to the goal mouth centre,
// distinct from the 4 solid corner lines above so it reads as the one shot
// that matters rather than another trajectory option.
const shootingLineGeometry = new THREE.BufferGeometry();
shootingLineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
const shootingLine = new THREE.LineSegments(
  shootingLineGeometry,
  new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 120, gapSize: 80 })
);
shootingLine.visible = false;
shootingLine.frustumCulled = false; // same reasoning as trajectoryLines above
scene.add(shootingLine);

// Shooting-line colour: a coaching cue for where the goalie should stand,
// not just whether the shot is blocked.
//   red    - nothing between ball and goal centre: a fully open shot
//   yellow - the goalie's mesh IS in the way, but it isn't lined up with
//            the shot at its own depth - blocking with an edge/limb rather
//            than being squarely positioned
//   green  - at the depth the goalie has chosen, its lateral (X) position
//            matches where the ball->goal-centre line actually passes - the
//            "squared up" position a real goalie is coached to find
// Only the goalie is checked for obstruction (matches coverage.js's scope).
// "Centred" is judged purely by lateral (X) offset at the goalie's own Z,
// not full 3D distance to the line - an earlier version compared against
// the goalie's full 3D position using a fixed torso-height point, but the
// line's own height only ranges from the ball (~floor level) to the goal
// centre (575mm), well below a realistic torso height - so even a
// laterally-perfect goalie always had a large, depth-dependent leftover
// vertical gap, making "green" nearly unreachable. Lateral-only avoids that
// and matches how goalies are actually coached (slide sideways to the shot
// line at whatever depth you've chosen), so the align button below can
// reach it exactly.
const SHOT_OPEN_COLOR = new THREE.Color(0xff3b30);
const SHOT_BLOCKED_OFFCENTER_COLOR = new THREE.Color(0xffd21a);
const SHOT_BLOCKED_CENTERED_COLOR = new THREE.Color(0x2ecc55);
const SHOT_LINE_COLOR_BY_KEY = {
  open: SHOT_OPEN_COLOR,
  'blocked-off': SHOT_BLOCKED_OFFCENTER_COLOR,
  'blocked-centred': SHOT_BLOCKED_CENTERED_COLOR,
};

function computeShotLineColor(ballCenter, goalCenter) {
  const goalieMesh = state.goalieGroup && state.goalieGroup.visible ? state.goalieGroup : null;
  const { lineColor } = shotVerdict({ ballWorld: ballCenter, goalCenterWorld: goalCenter, goalieMesh });
  return SHOT_LINE_COLOR_BY_KEY[lineColor];
}

const trajectoryScratchCorner = new THREE.Vector3();
const shootingLineScratchCenter = new THREE.Vector3();
const goalieOutlineCheckbox = document.getElementById('goalieOutlineCheckbox');

function setGoalieOutlineVisible(visible, color) {
  const outlines = state.goalieOutlinesByModel[state.activeGoalieKey];
  if (!outlines) return;
  for (const outline of outlines) {
    outline.visible = visible;
    if (visible) outline.material.color.copy(color);
  }
}

export function updateTrajectory(ballCenter) {
  if (!trajectoryCheckbox.checked || !ballCenter || !state.targetGoal) {
    trajectoryLines.visible = false;
    shootingLine.visible = false;
    setGoalieOutlineVisible(false);
    return;
  }
  const positions = trajectoryGeometry.attributes.position.array;
  let idx = 0;
  for (const corner of GOAL_MOUTH_CORNERS_LOCAL) {
    const worldCorner = state.targetGoal.localToWorld(trajectoryScratchCorner.copy(corner));
    positions[idx++] = ballCenter.x; positions[idx++] = ballCenter.y; positions[idx++] = ballCenter.z;
    positions[idx++] = worldCorner.x; positions[idx++] = worldCorner.y; positions[idx++] = worldCorner.z;
  }
  trajectoryGeometry.attributes.position.needsUpdate = true;
  trajectoryLines.visible = true;

  const goalCenter = state.targetGoal.localToWorld(shootingLineScratchCenter.copy(GOAL_CENTER_LOCAL));
  const shootingPositions = shootingLineGeometry.attributes.position.array;
  shootingPositions[0] = ballCenter.x; shootingPositions[1] = ballCenter.y; shootingPositions[2] = ballCenter.z;
  shootingPositions[3] = goalCenter.x; shootingPositions[4] = goalCenter.y; shootingPositions[5] = goalCenter.z;
  shootingLineGeometry.attributes.position.needsUpdate = true;
  shootingLine.computeLineDistances(); // required for LineDashedMaterial - recomputes the dash pattern from the new endpoints
  const shotColor = computeShotLineColor(ballCenter, goalCenter);
  shootingLine.material.color.copy(shotColor);
  shootingLine.visible = true;

  const showOutline = goalieOutlineCheckbox.checked && state.goalieGroup && state.goalieGroup.visible && shotColor !== SHOT_OPEN_COLOR;
  setGoalieOutlineVisible(showOutline, shotColor);
}

// Snaps the goalie's lateral (X) position onto the shot line at whatever
// depth (Z) it's currently standing - the same target the shooting-line
// colour check uses, so this reliably turns the line green rather than
// leaving it to imprecise arrow-key nudging.
const coveragePctEl = document.getElementById('coveragePct');
document.getElementById('alignGoalieBtn').addEventListener('click', () => {
  const ballCenter = getBallWorldCenter();
  if (!ballCenter || !state.targetGoal || !state.goalieGroup || !state.goalieGroup.visible) {
    coveragePctEl.textContent = 'need a ball, a targeted goal, and a visible goalie first';
    return;
  }
  const goalCenter = state.targetGoal.localToWorld(GOAL_CENTER_LOCAL.clone());
  state.goalieGroup.position.x = shotLineXAtZ(ballCenter, goalCenter, state.goalieGroup.position.z);
  if (state.selected === state.goalieGroup) selectObject(state.goalieGroup); // keep the ring following if it's selected
});
