import * as THREE from 'three';
import { state } from '../../state.js';
import { GOAL_CENTER_LOCAL, GOAL_MOUTH_CORNERS_LOCAL } from '../../constants.js';
import * as insights from '../../insights.js';
import * as photoCanvas from './photo-canvas.js';
import { getLastPose, effectiveFacingDeg } from './photo-overlay.js';
import { createGoalieProxy } from './goalie-proxy.js';

// Mode-B Step 4 wiring: reads frame.photo, calls insights.js, projects the
// results to image px via the cached pose.projectWorld (same accessor
// Phase-2 chips use), and hands them to photo-canvas.js's setters. See
// docs/phase-3-plan.md T4.

function targetGoalGroupFor(letter) {
  // goalInstances[0] is Goal A (z=GOAL_LINE_FROM_BOARD), [1] is Goal B
  // (z=RINK_L-GOAL_LINE_FROM_BOARD) - see layers.js.
  return letter === 'B' ? state.goalInstances[1] : state.goalInstances[0];
}

const worldScratch = new THREE.Vector3();
function projectWorldPoint(pose, x, y, z) {
  return pose.projectWorld(x, y, z);
}

function projectShotLines(shot, ballWorld, targetGoalGroup, pose) {
  const corners = GOAL_MOUTH_CORNERS_LOCAL.map((c) => {
    const w = targetGoalGroup.localToWorld(worldScratch.copy(c));
    const px1 = projectWorldPoint(pose, ballWorld.x, ballWorld.y, ballWorld.z);
    const px2 = projectWorldPoint(pose, w.x, w.y, w.z);
    return px1 && px2 ? { px1, px2 } : null;
  }).filter(Boolean);
  const goalCenterWorld = targetGoalGroup.localToWorld(worldScratch.copy(GOAL_CENTER_LOCAL));
  const centrePx1 = projectWorldPoint(pose, ballWorld.x, ballWorld.y, ballWorld.z);
  const centrePx2 = projectWorldPoint(pose, goalCenterWorld.x, goalCenterWorld.y, goalCenterWorld.z);
  if (corners.length === 0 || !centrePx1 || !centrePx2) return null;
  return { corners, centre: { px1: centrePx1, px2: centrePx2 }, colorKey: shot.lineColor };
}

function projectCoverage(targetGoalGroup, pose) {
  const gridLocal = insights.getCoverageGridLocalPoints();
  const corners = [];
  for (const p of gridLocal) {
    const w = targetGoalGroup.localToWorld(worldScratch.set(p.x, p.y, p.z));
    const px = projectWorldPoint(pose, w.x, w.y, w.z);
    if (!px) return null; // a grid vertex fell behind the camera - skip the whole overlay rather than draw a broken warp
    corners.push(px);
  }
  return { corners, cols: 16, rows: 12 };
}

function projectPasses(passResult, ballWorld, players, pose) {
  const ballPx = projectWorldPoint(pose, ballWorld.x, ballWorld.y, ballWorld.z);
  if (!ballPx) return null;
  const lines = [];
  for (const p of passResult) {
    const mate = players.find((pl) => pl.id === p.toPlayerId);
    if (!mate) continue;
    const [mx, my, mz] = mate.world;
    const toPx = projectWorldPoint(pose, mx, my, mz);
    if (!toPx) continue;
    lines.push({ fromPx: ballPx, toPx, clear: p.clear });
  }
  return lines;
}

export function recomputeInsights() {
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  const pose = getLastPose();
  if (!photo || !pose || !photo.ball || !photo.targetGoal) {
    photoCanvas.setShotLines(null);
    photoCanvas.setCoverageOverlay(null);
    photoCanvas.setPassLines(null);
    photoCanvas.setAngleBadge(null);
    return null;
  }

  const targetGoalGroup = targetGoalGroupFor(photo.targetGoal);
  const goalCenterWorld = targetGoalGroup.localToWorld(new THREE.Vector3().copy(GOAL_CENTER_LOCAL));
  const ballWorld = new THREE.Vector3().fromArray(photo.ball);

  // Goalie proxy - the defender of the attacked goal is on the OPPOSITE
  // team from the ball carrier.
  const carrier = (photo.players || []).find((p) => p.id === photo.ballCarrier);
  const defendingTeam = carrier?.team === 'home' ? 'away' : 'home';
  const goalieId = photo.goalies?.[defendingTeam];
  const goalieChip = goalieId != null ? (photo.players || []).find((p) => p.id === goalieId) : null;
  const goalieMesh = goalieChip ? createGoalieProxy(new THREE.Vector3().fromArray(goalieChip.world), effectiveFacingDeg(goalieChip, photo) ?? 0) : null;
  // Transient proxy is never added to the scene graph, so THREE never
  // auto-computes its matrixWorld - raycasting against it before this call
  // would silently use the identity transform (same trap as photoCamera,
  // see /memories/repo/floorball-3d-photo-overlay.md #39).
  goalieMesh?.updateMatrixWorld(true);

  const shot = insights.shotVerdict({ ballWorld, goalCenterWorld, goalieMesh });
  const cov = goalieMesh ? insights.coverageGrid({ ballWorld, targetGoalGroup, goalieMesh }) : null;
  const pass = insights.passOptions({
    ballCarrierId: photo.ballCarrier,
    players: photo.players || [],
    carrierTeam: carrier?.team,
    goalies: photo.goalies || {},
    corridorHalfWidthMm: 400,
  });

  photoCanvas.setShotLines(projectShotLines(shot, ballWorld, targetGoalGroup, pose));
  const covProjection = cov ? projectCoverage(targetGoalGroup, pose) : null;
  photoCanvas.setCoverageOverlay(covProjection ? { ...covProjection, grid: cov.blockedAt } : null);
  photoCanvas.setPassLines(projectPasses(pass, ballWorld, photo.players || [], pose));
  photoCanvas.setAngleBadge(shot.angleDeg);

  const result = { shot, coveragePct: cov ? cov.pctBlocked : null, quadrants: cov ? cov.quadrants : null, passes: pass };
  const log = (window.__photoOverlayDebugLog ??= []);
  log.push({
    t: Date.now(),
    event: 'insights:recompute',
    data: {
      ballWorld: photo.ball,
      targetGoal: photo.targetGoal,
      goaliePresent: !!goalieMesh,
      shot,
      pctBlocked: result.coveragePct,
      passCount: pass.length,
      clearPassCount: pass.filter((p) => p.clear).length,
    },
  });
  if (log.length > 200) log.shift();

  return result;
}
