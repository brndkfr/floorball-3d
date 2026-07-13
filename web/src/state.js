import * as THREE from 'three';
import { BALL_RADIUS } from './constants.js';

// Single shared mutable object for everything that gets reassigned across
// module boundaries (ballGroup, selected, targetGoal, camera look angles,
// etc.). Every module imports this same object and reads/writes its
// properties directly - mutating an imported object's properties works
// fine in ES modules (only reassigning the imported BINDING itself, e.g.
// `state = {}`, is disallowed), so this avoids needing a getter/setter pair
// for every single field while still keeping "who owns this value" obvious
// (whoever sets it) and "who can see it" trivial (everyone, via one import).
export const state = {
  // layers.js
  ballGroup: null,
  goalInstances: [], // individual goal Object3Ds, for click-to-select

  // goalie.js
  goalieGroup: null, // always points at whichever model is currently active
  goalieModels: {}, // key -> loaded wrapper Group
  goalieOutlinesByModel: {}, // key -> array of outline meshes for that model
  activeGoalieKey: null,

  // selection.js
  selected: null, // the currently selected THREE.Object3D, or null

  // trajectory.js
  targetGoal: null,

  // scene.js (camera look state) - read by selection.js's look-drag and
  // controls.js's walk-direction math, written by scene.js's setCameraLook
  camYaw: 0,
  camPitch: 0,

  // coverage.js
  currentCoveragePct: null,
};

// Ball's local origin is its floor-contact point (see generate_ball.py), so
// its world centre is a cheap fixed offset from position - computed once per
// frame in animate() and shared by updateTrajectory/updateCoverage, instead
// of each calling its own Box3.setFromObject(ballGroup) (redundant work done
// twice, and needless geometry traversal to begin with, since the offset is
// already known).
const ballWorldCenter = new THREE.Vector3();
export function getBallWorldCenter() {
  if (!state.ballGroup) return null;
  return ballWorldCenter.set(state.ballGroup.position.x, state.ballGroup.position.y + BALL_RADIUS, state.ballGroup.position.z);
}
