import * as THREE from 'three';

// Pure compute core for Mode-A/Mode-B tactical insights (docs/phase-3-plan.md).
// No `state.*` reads, no DOM, no `scene.add` - callers own all THREE scene
// wiring. Constants/logic here that mirror trajectory.js/coverage.js are
// copied verbatim (not "cleaned up") so Mode-A behaviour stays byte-identical
// after the T2 refactor.

export const GOALIE_CENTERED_THRESHOLD = 200; // mm of lateral (X) offset still counted as "centred" - an estimate, not a sourced number

const shotDirScratch = new THREE.Vector3();
const shootingLineRaycaster = new THREE.Raycaster();

// Where does the ball->goalCenter line sit in X at a given Z? (linear
// interpolation along the line) - shared by trajectory.js's colour check
// and its "align goalie to shot line" button.
export function shotLineXAtZ(ballCenter, goalCenter, z) {
  const dz = goalCenter.z - ballCenter.z;
  if (Math.abs(dz) < 1e-6) return ballCenter.x; // degenerate: ball and goal centre share a Z, no meaningful line
  const t = (z - ballCenter.z) / dz;
  return ballCenter.x + t * (goalCenter.x - ballCenter.x);
}

// Shot from a ball position toward a target goal.
//   'open'             - no goalie mesh in the ray
//   'blocked-off'      - goalie mesh in the ray, lateral (X) offset from the
//                         shot line at the goalie's own depth is > threshold
//   'blocked-centred'  - goalie mesh in the ray AND lateral offset <= threshold
// angleDeg is measured against the rink's Z (depth) axis, since goals are
// always aligned along world X regardless of which end they sit at: 0 means
// the ball is square-on with the goal centre, 90 means the ball is level
// with the goal line (an effectively impossible shot).
export function shotVerdict({ ballWorld, goalCenterWorld, goalieMesh }) {
  const dx = goalCenterWorld.x - ballWorld.x;
  const dz = goalCenterWorld.z - ballWorld.z;
  const angleDeg = Math.atan2(Math.abs(dx), Math.abs(dz)) * (180 / Math.PI);
  const distance = ballWorld.distanceTo(goalCenterWorld);

  let lineColor = 'open';
  if (goalieMesh && goalieMesh.visible !== false) {
    const toGoal = shotDirScratch.copy(goalCenterWorld).sub(ballWorld);
    const dist = toGoal.length();
    if (dist >= 1) {
      shootingLineRaycaster.set(ballWorld, toGoal.clone().normalize());
      shootingLineRaycaster.far = dist - 1;
      if (shootingLineRaycaster.intersectObject(goalieMesh, true).length > 0) {
        const lineX = shotLineXAtZ(ballWorld, goalCenterWorld, goalieMesh.position.z);
        const lateralOffset = Math.abs(goalieMesh.position.x - lineX);
        lineColor = lateralOffset <= GOALIE_CENTERED_THRESHOLD ? 'blocked-centred' : 'blocked-off';
      }
    }
  }

  // Estimate, not a sourced number: a shot within 45deg of square-on reads
  // as "on target", up to 75deg as a "near-miss" (sharp angle, still
  // plausible), beyond that "off" (essentially along the goal line).
  const onTarget = angleDeg < 45 ? 'on' : angleDeg < 75 ? 'near-miss' : 'off';

  return { angleDeg, distance, lineColor, onTarget };
}

// --- goal coverage grid (16x12 cells, 17x13 shared vertices) ---
// Copied verbatim from coverage.js's grid geometry (COVERAGE_VCOLS =
// COVERAGE_COLS + 1 etc.) - only the state.*/DOM reads are dropped.
const COVERAGE_COLS = 16, COVERAGE_ROWS = 12;
const CELL_W = 1600 / COVERAGE_COLS, CELL_H = 1150 / COVERAGE_ROWS;
const COVERAGE_VCOLS = COVERAGE_COLS + 1, COVERAGE_VROWS = COVERAGE_ROWS + 1;
const COVERAGE_VERTEX_COUNT = COVERAGE_VCOLS * COVERAGE_VROWS;

const coverageGridLocalPoints = [];
for (let r = 0; r < COVERAGE_VROWS; r++) {
  for (let c = 0; c < COVERAGE_VCOLS; c++) {
    coverageGridLocalPoints.push({ x: -800 + c * CELL_W, y: r * CELL_H, z: 0 });
  }
}

// Raw grid local-space points (goal-local mm), length COVERAGE_VCOLS *
// COVERAGE_VROWS - exposed so Mode-B can project them to image px without
// re-deriving the grid geometry (see insights-overlay.js).
export function getCoverageGridLocalPoints() {
  return coverageGridLocalPoints;
}

const coverageRaycaster = new THREE.Raycaster();
const coverageScratchPt = new THREE.Vector3();
const coverageScratchDir = new THREE.Vector3();

// Coverage grid. Callable with either a goalie THREE mesh (Mode A: detailed
// OBJ; Mode B: proxy cylinder from goalie-proxy.js) or with null (all cells
// open).
export function coverageGrid({ ballWorld, targetGoalGroup, goalieMesh }) {
  const blockedAt = new Float32Array(COVERAGE_VERTEX_COUNT);

  for (let i = 0; i < COVERAGE_VERTEX_COUNT; i++) {
    const p = coverageGridLocalPoints[i];
    coverageScratchPt.set(p.x, p.y, p.z);
    const worldPt = targetGoalGroup.localToWorld(coverageScratchPt);

    let blocked = 0;
    if (ballWorld && goalieMesh && goalieMesh.visible !== false) {
      coverageScratchDir.copy(worldPt).sub(ballWorld);
      const dist = coverageScratchDir.length();
      coverageScratchDir.normalize();
      coverageRaycaster.set(ballWorld, coverageScratchDir);
      coverageRaycaster.far = dist - 1;
      if (coverageRaycaster.intersectObject(goalieMesh, true).length > 0) blocked = 1;
    }
    blockedAt[i] = blocked;
  }

  // % blocked = mean of each cell's 4 corner samples, matching the
  // smooth-shaded coverage mesh look.
  let blockedArea = 0;
  for (let r = 0; r < COVERAGE_ROWS; r++) {
    for (let c = 0; c < COVERAGE_COLS; c++) {
      const v00 = r * COVERAGE_VCOLS + c, v10 = v00 + 1, v01 = v00 + COVERAGE_VCOLS, v11 = v01 + 1;
      blockedArea += (blockedAt[v00] + blockedAt[v10] + blockedAt[v01] + blockedAt[v11]) / 4;
    }
  }
  const pctBlocked = (blockedArea / (COVERAGE_COLS * COVERAGE_ROWS)) * 100;

  // Quadrants: split the 16x12 cells into four 8x6 blocks (tl/tr/bl/br of
  // the goal mouth), same per-cell 4-corner mean as the overall pctBlocked.
  const quadrants = { tl: 0, tr: 0, bl: 0, br: 0 };
  const halfCols = COVERAGE_COLS / 2, halfRows = COVERAGE_ROWS / 2;
  const quadArea = { tl: 0, tr: 0, bl: 0, br: 0 };
  for (let r = 0; r < COVERAGE_ROWS; r++) {
    for (let c = 0; c < COVERAGE_COLS; c++) {
      const v00 = r * COVERAGE_VCOLS + c, v10 = v00 + 1, v01 = v00 + COVERAGE_VCOLS, v11 = v01 + 1;
      const cellMean = (blockedAt[v00] + blockedAt[v10] + blockedAt[v01] + blockedAt[v11]) / 4;
      // row 0 is y=0 (bottom of the goal mouth) - "bottom" half is the
      // low-row half, "top" half is the high-row half.
      const key = (r < halfRows ? 'b' : 't') + (c < halfCols ? 'l' : 'r');
      quadrants[key] += cellMean;
      quadArea[key] += 1;
    }
  }
  for (const key of Object.keys(quadrants)) {
    quadrants[key] = quadArea[key] ? (quadrants[key] / quadArea[key]) * 100 : 0;
  }

  return { blockedAt, pctBlocked, quadrants };
}

// Pass corridors. For each teammate of the ball carrier, is the line
// ball -> teammate inside the "clear corridor" (no defender within
// corridorHalfWidthMm laterally)? Own-team players are candidate receivers,
// not defenders. Both goalies are excluded from receivers AND from the
// defender list (goalie coverage is handled by shotVerdict, not here).
export function passOptions({ ballCarrierId, players, carrierTeam, goalies, corridorHalfWidthMm = 400 }) {
  const goalieIds = new Set([goalies?.home, goalies?.away].filter((id) => id != null));
  const carrier = players.find((p) => p.id === ballCarrierId);
  if (!carrier) return [];

  const [bx, , bz] = carrier.world;
  const teammates = players.filter((p) => p.id !== ballCarrierId && p.team === carrierTeam && !goalieIds.has(p.id));
  const defenders = players.filter((p) => p.team !== carrierTeam && !goalieIds.has(p.id));

  return teammates.map((mate) => {
    const [mx, , mz] = mate.world;
    const dx = mx - bx, dz = mz - bz;
    const lenSq = dx * dx + dz * dz;
    const distanceMm = Math.sqrt(lenSq);

    const defendersInLane = [];
    if (lenSq > 1e-6) {
      for (const def of defenders) {
        const [dxp, , dzp] = def.world;
        // Project defender onto the ball->teammate segment; skip endpoints
        // (t outside [0.05, 0.95]) so the ball/receiver aren't self-flagged.
        const t = ((dxp - bx) * dx + (dzp - bz) * dz) / lenSq;
        if (t < 0.05 || t > 0.95) continue;
        const projX = bx + t * dx, projZ = bz + t * dz;
        const perpDist = Math.hypot(dxp - projX, dzp - projZ);
        if (perpDist <= corridorHalfWidthMm) defendersInLane.push(def.id);
      }
    }

    return { toPlayerId: mate.id, clear: defendersInLane.length === 0, defendersInLane, distanceMm };
  });
}
