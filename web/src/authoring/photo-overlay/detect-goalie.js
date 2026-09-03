// Goalie-specific detection: run YOLOv8n a second time on the ROI around a
// specific goal end, at a lower score threshold, and keep only candidates
// whose foot back-projects into a world-space "crease box" in front of that
// goal. The general Step 3 player detect routinely misses goalies (occluded
// by the goal frame, net, oversized pads/gloves; jersey k-means then usually
// mis-teams them anyway) - see docs/plan.md §4.5 / Phase 2 follow-ups.
//
// This is Layer 1 of the plan. Layer 2 (classical CV "non-red non-white
// blob inside the mouth" fallback) is deferred - once the general YOLO pass
// gets nothing, this second pass with a tight ROI + relaxed threshold + a
// spatial gate on the foot's world position picks the goalie up in the
// common case without a second detector.
import { detectPlayers } from './detect-players.js';
import { backProjectFoot, footPixel } from './back-project.js';
import { RINK_L, GOAL_LINE_FROM_BOARD } from '../../constants.js';

// World-space "goalie zone" around each goal end (mm). Goalies stand in and
// just in front of the crease; a bit of tolerance behind the goal line covers
// stepping into the net. Wider than the goal mouth (1600mm) so a goalie
// hugging a post from the outside still counts.
const CREASE_HALF_W = 2500;
const CREASE_FRONT = 3000;
const CREASE_BACK = 1000;
const GOALIE_HEIGHT = 1900; // mm, includes helmet
const ROI_EXPAND_PX = 40;   // pad projected crease box by this many px on each side

// How close (mm) a detected goalie foot must be to an existing player chip
// to re-use that chip's id instead of appending a new one. Tolerant because
// back-projected feet from a tight bbox drift a couple hundred mm.
const REUSE_EXISTING_MAX_DIST = 1200;

function debugLog(event, data) {
  console.log(`[detect-goalie] ${event}`, data);
  const log = (window.__photoOverlayDebugLog ??= []);
  log.push({ t: Date.now(), event, data });
  if (log.length > 200) log.shift();
}

function goalLineZ(end) {
  return end === 'A' ? GOAL_LINE_FROM_BOARD : RINK_L - GOAL_LINE_FROM_BOARD;
}

// World corners of the goalie zone in front of the given goal end.
// Returns 8 [x, y, z] points (floor + head-height rectangle).
function creaseWorldCorners(end) {
  const gz = goalLineZ(end);
  const facing = end === 'A' ? 1 : -1;
  const zNear = gz - facing * CREASE_BACK;
  const zFar = gz + facing * CREASE_FRONT;
  const xs = [-CREASE_HALF_W, CREASE_HALF_W];
  const zs = [zNear, zFar];
  const ys = [0, GOALIE_HEIGHT];
  const out = [];
  for (const y of ys) for (const x of xs) for (const z of zs) out.push([x, y, z]);
  return out;
}

// Project the crease box through the solved camera and return the axis-
// aligned image-px bbox that encloses it, clipped to the photo bounds.
// Returns null if fewer than 4 corners project in front of the camera
// (the goal probably isn't in frame).
function projectCreaseRoi(camera, end, imageWH) {
  const [imgW, imgH] = imageWH;
  const corners = creaseWorldCorners(end);
  const projected = [];
  for (const [x, y, z] of corners) {
    const px = camera.projectWorld?.(x, y, z);
    if (px) projected.push(px);
  }
  if (projected.length < 4) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of projected) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  minX = Math.max(0, minX - ROI_EXPAND_PX);
  minY = Math.max(0, minY - ROI_EXPAND_PX);
  maxX = Math.min(imgW, maxX + ROI_EXPAND_PX);
  maxY = Math.min(imgH, maxY + ROI_EXPAND_PX);
  const w = maxX - minX, h = maxY - minY;
  if (w < 20 || h < 20) return null;
  return { x: minX, y: minY, w, h };
}

// True if world (x,z) sits inside the crease box for `end`.
function isFootInCrease(world, end) {
  if (!world) return false;
  const [x, , z] = world;
  const gz = goalLineZ(end);
  const facing = end === 'A' ? 1 : -1;
  const dz = (z - gz) * facing;
  return Math.abs(x) <= CREASE_HALF_W && dz >= -CREASE_BACK && dz <= CREASE_FRONT;
}

// pose = pnp.js result (used only for projectWorld). camera = the live
// THREE.PerspectiveCamera synced from that pose - needed by backProjectFoot
// which calls .unproject(camera) and requires a real THREE camera's
// projectionMatrix, which the pose object doesn't have.
// imageWH = [imgW, imgH] in original image pixels. `existingPlayers` is
// frame.photo.players so we can dedupe against a chip the general pass
// already placed on top of the goalie.
//
// Returns { end, foot, bbox, score, existingPlayerId } or null if no
// plausible goalie was found. `existingPlayerId` is set when the detected
// foot is within REUSE_EXISTING_MAX_DIST of a chip in `existingPlayers` -
// callers should reuse that chip's id instead of appending a new one.
export async function detectGoalieForEnd(image, pose, camera, imageWH, end, {
  scoreThreshold = 0.15,
  existingPlayers = [],
} = {}) {
  const t0 = performance.now();
  if (!pose?.projectWorld || !camera) return null;
  const roi = projectCreaseRoi(pose, end, imageWH);
  debugLog('projectCreaseRoi', { end, roi });
  if (!roi) return null;

  // marginFrac 0 - the ROI is already the crease zone we want; padding is
  // already baked into ROI_EXPAND_PX + the world-space CREASE_FRONT/BACK.
  const boxes = await detectPlayers(image, { scoreThreshold, roi, marginFrac: 0 });

  const candidates = [];
  for (const box of boxes) {
    const [px, py] = footPixel(box.bbox);
    const world = backProjectFoot(px, py, camera, imageWH);
    if (!isFootInCrease(world, end)) continue;
    candidates.push({ ...box, foot: world });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;

  let existingPlayerId = null;
  if (best) {
    let bestDistSq = REUSE_EXISTING_MAX_DIST * REUSE_EXISTING_MAX_DIST;
    for (const p of existingPlayers) {
      if (!p.world) continue;
      const dx = p.world[0] - best.foot[0], dz = p.world[2] - best.foot[2];
      const d = dx * dx + dz * dz;
      if (d <= bestDistSq) { bestDistSq = d; existingPlayerId = p.id; }
    }
  }

  const result = best ? {
    end,
    foot: best.foot,
    bbox: best.bbox,
    score: best.score,
    existingPlayerId,
  } : null;
  debugLog('detectGoalieForEnd', {
    end, roi, boxCount: boxes.length, candidateCount: candidates.length,
    picked: result ? { score: result.score, foot: result.foot, existingPlayerId } : null,
    elapsedMs: Math.round(performance.now() - t0),
  });
  return result;
}
