import * as THREE from 'three';
import { state } from './state.js';
import { camera } from './scene.js';
import { coverageGrid } from './insights.js';
import { VECTOR_COVERAGE_BLOCKED, VECTOR_COVERAGE_OPEN } from './tokens.js';

// --- goal coverage: what fraction of the goal mouth does the goalie block? ---
// Samples a grid of points across the goal opening; for each, casts a ray
// from the ball to that point and checks whether the goalie's mesh sits in
// the way. Red = open lane to the goal, green = covered. The percentage
// readout is the actual answer to "how much is covered" - the coloring is
// just there so you can see *where*.
const coverageCheckbox = document.getElementById('coverageCheckbox');
const coveragePctEl = document.getElementById('coveragePct');
const COVERAGE_COLS = 16, COVERAGE_ROWS = 12; // sample grid resolution across the goal mouth
const CELL_W = 1600 / COVERAGE_COLS, CELL_H = 1150 / COVERAGE_ROWS;

// Shared-vertex grid (one extra row/col of vertices vs. cells) rather than
// one independent flat-colored quad per cell - lets three.js interpolate
// color smoothly across each cell instead of showing hard block edges,
// using roughly the same number of raycast samples (vertices, not cells).
const COVERAGE_VCOLS = COVERAGE_COLS + 1, COVERAGE_VROWS = COVERAGE_ROWS + 1;
const COVERAGE_VERTEX_COUNT = COVERAGE_VCOLS * COVERAGE_VROWS;

const coveragePositions = new Float32Array(COVERAGE_VERTEX_COUNT * 3);
const coverageColors = new Float32Array(COVERAGE_VERTEX_COUNT * 3);
const coverageIndex = [];
{
  for (let r = 0; r < COVERAGE_VROWS; r++) {
    for (let c = 0; c < COVERAGE_VCOLS; c++) {
      const vi = r * COVERAGE_VCOLS + c;
      coveragePositions.set([-800 + c * CELL_W, r * CELL_H, 0], vi * 3);
    }
  }
  for (let r = 0; r < COVERAGE_ROWS; r++) {
    for (let c = 0; c < COVERAGE_COLS; c++) {
      const v00 = r * COVERAGE_VCOLS + c, v10 = v00 + 1, v01 = v00 + COVERAGE_VCOLS, v11 = v01 + 1;
      coverageIndex.push(v00, v10, v11, v00, v11, v01);
    }
  }
}
const coverageGeometry = new THREE.BufferGeometry();
coverageGeometry.setAttribute('position', new THREE.BufferAttribute(coveragePositions, 3));
coverageGeometry.setAttribute('color', new THREE.BufferAttribute(coverageColors, 3));
coverageGeometry.setIndex(coverageIndex);
const coverageMesh = new THREE.Mesh(
  coverageGeometry,
  new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
);
coverageMesh.position.set(0, 0, 2); // just off the goal mouth plane, avoids z-fighting with the frame
coverageMesh.visible = false;
coverageMesh.frustumCulled = false; // reparented between goals + defensive, same reasoning as trajectory.js's lines

// Raycasting 221 samples against a 10k-triangle detailed goalie mesh every
// single animation frame (60/sec) regardless of whether anything moved was
// the single largest per-frame cost in the app. Nothing here needs to be
// recomputed unless the ball, the target goal, or the goalie's identity/
// pose/visibility actually changed since the last frame - so track that
// and skip the raycasting pass entirely on unchanged frames.
const lastCoverageState = {
  ballX: NaN, ballY: NaN, ballZ: NaN, targetGoal: null,
  goalieRef: null, goalieX: NaN, goalieY: NaN, goalieZ: NaN, goalieRotY: NaN, goalieVisible: null,
};

function coverageInputsChanged(ballCenter) {
  const s = lastCoverageState;
  const goalieGroup = state.goalieGroup;
  const gx = goalieGroup ? goalieGroup.position.x : NaN;
  const gy = goalieGroup ? goalieGroup.position.y : NaN;
  const gz = goalieGroup ? goalieGroup.position.z : NaN;
  const grot = goalieGroup ? goalieGroup.rotation.y : NaN;
  const gvis = goalieGroup ? goalieGroup.visible : null;
  const bx = ballCenter ? ballCenter.x : NaN, by = ballCenter ? ballCenter.y : NaN, bz = ballCenter ? ballCenter.z : NaN;

  const changed = s.ballX !== bx || s.ballY !== by || s.ballZ !== bz || s.targetGoal !== state.targetGoal ||
    s.goalieRef !== goalieGroup || s.goalieX !== gx || s.goalieY !== gy || s.goalieZ !== gz ||
    s.goalieRotY !== grot || s.goalieVisible !== gvis;

  if (changed) {
    s.ballX = bx; s.ballY = by; s.ballZ = bz; s.targetGoal = state.targetGoal;
    s.goalieRef = goalieGroup; s.goalieX = gx; s.goalieY = gy; s.goalieZ = gz;
    s.goalieRotY = grot; s.goalieVisible = gvis;
  }
  return changed;
}

export function updateCoverage(ballCenter) {
  if (!coverageCheckbox.checked || !state.targetGoal) {
    coverageMesh.visible = false;
    coveragePctEl.textContent = '-';
    state.currentCoveragePct = null;
    return;
  }
  if (coverageMesh.parent !== state.targetGoal) state.targetGoal.add(coverageMesh);
  coverageMesh.visible = true;

  if (!coverageInputsChanged(ballCenter)) return; // nothing moved - reuse the colors/percentage from last pass

  const goalieMesh = state.goalieGroup && state.goalieGroup.visible ? state.goalieGroup : null;
  const { blockedAt, pctBlocked } = coverageGrid({ ballWorld: ballCenter, targetGoalGroup: state.targetGoal, goalieMesh });
  const blockedColor = new THREE.Color(VECTOR_COVERAGE_BLOCKED.hex);
  const openColor = new THREE.Color(VECTOR_COVERAGE_OPEN.hex);
  for (let i = 0; i < COVERAGE_VERTEX_COUNT; i++) {
    const c = blockedAt[i] ? blockedColor : openColor;
    coverageColors.set([c.r, c.g, c.b], i * 3);
  }
  coverageGeometry.attributes.color.needsUpdate = true;

  state.currentCoveragePct = Math.round(pctBlocked);
  coveragePctEl.textContent = `${state.currentCoveragePct}% blocked`;
}

// Floating label above the goalie's head showing the same percentage, so you
// don't have to glance at the side panel while nudging its position around.
const goalieLabelEl = document.getElementById('goalieLabel');
const labelProjection = new THREE.Vector3();

export function updateGoalieLabel() {
  if (!state.goalieGroup || !state.goalieGroup.visible || state.currentCoveragePct === null) {
    goalieLabelEl.style.display = 'none';
    return;
  }
  labelProjection.set(state.goalieGroup.position.x, 850, state.goalieGroup.position.z).project(camera);
  if (labelProjection.z > 1) { // behind the camera
    goalieLabelEl.style.display = 'none';
    return;
  }
  goalieLabelEl.style.left = `${(labelProjection.x * 0.5 + 0.5) * window.innerWidth}px`;
  goalieLabelEl.style.top = `${(-labelProjection.y * 0.5 + 0.5) * window.innerHeight}px`;
  goalieLabelEl.textContent = `${state.currentCoveragePct}% blocked`;
  goalieLabelEl.style.display = 'block';
}
