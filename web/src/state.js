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

  // goalie.js - one goalie per goal end (A-BACK-024). state.goalies[letter]
  // always points at whichever model instance is currently active for that end.
  goalies: { A: null, B: null },
  goalieModels: { A: {}, B: {} }, // letter -> key -> loaded wrapper Group
  goalieOutlinesByModel: { A: {}, B: {} }, // letter -> key -> array of outline meshes for that model
  activeGoalieKey: null, // model key (blocky|detailed) shared by both goalies

  // selection.js
  selected: null,      // the "primary" selected Object3D (last added to the set), or null
  selectedSet: [],     // every selected Object3D; single-select keeps this at length 0 or 1
  marqueeIncludesShapes: true, // marquee also grabs shapes/zones/arrows/text, not just chips (opt-out in the Layers panel)
  labelsVisible: true, // in-scene chip labels visible (falls back to number sprite when off; toggle in the Layers panel)

  // trajectory.js
  targetGoal: null,

  // scene.js (camera look state) - read by selection.js's look-drag and
  // controls.js's walk-direction math, written by scene.js's setCameraLook
  camYaw: 0,
  camPitch: 0,

  // coverage.js
  currentCoveragePct: null,

  // authoring/* - see docs/floorball-3d-authoring-plan.md
  doc: null,             // Doc (see authoring/doc.js). null until initDoc() runs.
  chipsRoot: null,       // THREE.Group holding every chip; child of scene
  chipGroups: [],        // per-chip THREE.Group, selectable, in the same array shape as goalInstances
  shapesRoot: null,      // THREE.Group holding every shape (arrow/zone/text); child of scene
  shapeObjects: [],      // per-shape THREE.Object3D, selectable
  conesRoot: null,       // THREE.Group holding every marker cone; child of scene
  coneObjects: [],       // per-cone THREE.Mesh, selectable
  extraBallsRoot: null,  // THREE.Group holding user-spawned extra balls (main ball is state.ballGroup)
  extraBalls: [],        // per-extra-ball THREE.Mesh, selectable
  extraGoalsRoot: null,  // THREE.Group holding user-spawned extra goals (the 2 fixed goals live in state.goalInstances)
  extraGoals: [],        // per-extra-goal THREE.Group, selectable
  activeTool: null,      // null | 'chip' | 'arrow' | 'zone' | 'text'
  currentTeam: 1,        // 1 | 2 - which team the chip stamp is currently placing
  activeCamera: null,    // scene.js sets this to the perspective camera at boot; swapped to ortho in shape tools
  drawState: null,       // draw-tool.js: { tool, points, preview } while an in-progress shape is being clicked out
  drawColor: '#ffb347',  // current color for new arrows/zones/text; set via the dock color swatch
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

// The goal letter ('A' | 'B') for a given goal Object3D (state.goalInstances[0]
// is goal A, [1] is goal B). Falls back to 'A' for anything else (incl. null).
export function goalLetterForGoal(goalGroup) {
  return goalGroup === state.goalInstances[1] ? 'B' : 'A';
}

// The goalie belonging to a given goal Object3D - A-BACK-024. Falls back to
// goal A for anything else (including null), matching the pre-two-goalie
// behaviour of "the" goalie.
export function goalieForGoal(goalGroup) {
  return state.goalies[goalLetterForGoal(goalGroup)];
}
