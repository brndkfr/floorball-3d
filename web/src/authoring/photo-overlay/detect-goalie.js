// Goalie-specific detection: run YOLOv8n a second time on the ROI around a
// specific goal end, at a lower score threshold, and keep only candidates
// whose foot back-projects into a world-space "crease box" in front of that
// goal. The general Step 3 player detect routinely misses goalies (occluded
// by the goal frame, net, oversized pads/gloves; jersey k-means then usually
// mis-teams them anyway) - see docs/plan.md §4.5 / Phase 2 follow-ups.
//
// This is Layer 1 of the plan. B-BACK-005: a heavily-occluded kneeling
// goalie (white gear against white ice, the classic butterfly save stance)
// can fail Layer 1's box *classification* entirely even where partial
// keypoints (head, shoulders) are still visible - the plan called this
// "likely not fixable classically, needs Phase 4 pose cues", and Phase 4
// (detect-pose.js, B-PHASE-005) has since shipped. So when Layer 1 finds
// nothing in the crease, this module now falls back to running the pose
// model on the same ROI at a relaxed threshold (Layer 1b) - a kneeling
// goalie's head/torso keypoints often still register even when the plain
// object detector's box confidence doesn't clear its own threshold. A true
// classical-CV fallback (non-red non-white blob in the mouth) remains
// deferred as Layer 2 if pose still comes up empty.
import { detectPlayers } from './detect-players.js';
import { detectPose } from './detect-pose.js';
import { backProjectFoot, footPixel } from './back-project.js';
import { RINK_L, GOAL_LINE_FROM_BOARD } from '../../constants.js';

// COCO keypoint indices (see detect-pose.js's KP_* exports for the ones it
// already needs for facing).
const KP_LEFT_ANKLE = 15;
const KP_RIGHT_ANKLE = 16;

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
export function projectCreaseRoi(camera, end, imageWH) {
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
export function isFootInCrease(world, end) {
  if (!world) return false;
  const [x, , z] = world;
  const gz = goalLineZ(end);
  const facing = end === 'A' ? 1 : -1;
  const dz = (z - gz) * facing;
  return Math.abs(x) <= CREASE_HALF_W && dz >= -CREASE_BACK && dz <= CREASE_FRONT;
}

// Minimum confidence (0-1) for an ankle keypoint to be trusted as the
// "foot" pixel. A kneeling/butterfly goalie often has one or both ankles
// tucked under the body and occluded by pads - only use a keypoint that's
// actually likely to be right, and let the caller fall back to the bbox
// bottom-center (footPixel) otherwise.
const ANKLE_MIN_CONF = 0.3;

// Estimates the foot pixel from pose keypoints instead of the bbox bottom
// edge - a standing player's bbox bottom is a good foot proxy, but a
// kneeling goalie's bbox bottom is knee/shin height, not foot height.
// Returns [x, y] in image px, or null if neither ankle is confident enough
// (caller should fall back to footPixel(bbox) in that case).
export function footPixelFromKeypoints(keypoints, minConf = ANKLE_MIN_CONF) {
  if (!Array.isArray(keypoints) || keypoints.length < 17) return null;
  const l = keypoints[KP_LEFT_ANKLE];
  const r = keypoints[KP_RIGHT_ANKLE];
  const lOk = !!l && l.conf >= minConf;
  const rOk = !!r && r.conf >= minConf;
  if (lOk && rOk) return [(l.x + r.x) / 2, (l.y + r.y) / 2];
  if (lOk) return [l.x, l.y];
  if (rOk) return [r.x, r.y];
  return null;
}

// Picks the best goalie candidate across the two detection layers. The
// object-detector (Layer 1) candidates are preferred whenever any exist -
// they're already spatially gated to the crease and generally more
// reliable than a pose-only detection; the pose fallback (Layer 1b) only
// matters when Layer 1 found nothing at all.
export function pickGoalieCandidate(objectCandidates, poseCandidates) {
  const pool = objectCandidates.length ? objectCandidates : poseCandidates;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => b.score - a.score)[0];
}

// pose = pnp.js result (used only for projectWorld). camera = the live
// THREE.PerspectiveCamera synced from that pose - needed by backProjectFoot
// which calls .unproject(camera) and requires a real THREE camera's
// projectionMatrix, which the pose object doesn't have.
// imageWH = [imgW, imgH] in original image pixels. `existingPlayers` is
// frame.photo.players so we can dedupe against a chip the general pass
// already placed on top of the goalie.
//
// Returns { end, foot, bbox, score, source, existingPlayerId } or null if
// no plausible goalie was found. `source` is 'yolo' (Layer 1, the general
// object detector) or 'pose' (Layer 1b fallback, see the module comment).
// `existingPlayerId` is set when the detected foot is within
// REUSE_EXISTING_MAX_DIST of a chip in `existingPlayers` - callers should
// reuse that chip's id instead of appending a new one.
export async function detectGoalieForEnd(image, pose, camera, imageWH, end, {
  scoreThreshold = 0.15,
  poseScoreThreshold = 0.15,
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

  const objectCandidates = [];
  for (const box of boxes) {
    const [px, py] = footPixel(box.bbox);
    const world = backProjectFoot(px, py, camera, imageWH);
    if (!isFootInCrease(world, end)) continue;
    objectCandidates.push({ ...box, foot: world, source: 'yolo' });
  }

  // B-BACK-005: Layer 1 found nothing in the crease - try the pose model
  // on the same ROI before giving up. A kneeling/occluded goalie's
  // keypoints (head, shoulders) can still register even when the plain
  // object detector's box confidence doesn't clear scoreThreshold.
  let poseCandidates = [];
  let poseDetectionCount = 0;
  if (objectCandidates.length === 0) {
    const poseDets = await detectPose(image, { scoreThreshold: poseScoreThreshold, roi, marginFrac: 0 });
    poseDetectionCount = poseDets.length;
    for (const det of poseDets) {
      const footPx = footPixelFromKeypoints(det.keypoints) ?? footPixel(det.bbox);
      const world = backProjectFoot(footPx[0], footPx[1], camera, imageWH);
      if (!isFootInCrease(world, end)) continue;
      poseCandidates.push({ bbox: det.bbox, score: det.score, foot: world, source: 'pose' });
    }
  }

  const best = pickGoalieCandidate(objectCandidates, poseCandidates);

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
    source: best.source,
    existingPlayerId,
  } : null;
  debugLog('detectGoalieForEnd', {
    end, roi, boxCount: boxes.length, objectCandidateCount: objectCandidates.length,
    poseDetectionCount, poseCandidateCount: poseCandidates.length,
    picked: result ? { score: result.score, source: result.source, foot: result.foot, existingPlayerId } : null,
    elapsedMs: Math.round(performance.now() - t0),
  });
  return result;
}
