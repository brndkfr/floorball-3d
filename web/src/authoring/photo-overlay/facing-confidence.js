// Pure predicate for B-BACK-003: whether a pose-seeded player.facingDeg
// should be flagged as low-confidence in the UI (photo-canvas.js draws the
// facing arrow dashed/dim instead of as certain as a manual drag). Kept
// dependency-free so it's unit-testable without photo-overlay.js's DOM/
// scene entanglement.

// Pose-seeded facings below this keypoint-confidence score (see
// facing-from-pose.js's `quality` = the primary torso line's keypoint
// confidence, floored at MIN_TORSO_CONF = 0.5 by construction) are treated
// as uncertain.
export const POSE_LOW_CONFIDENCE = 0.65;

export function isLowConfidenceFacing(player) {
  if (player.facingSource !== 'pose') return false;
  // Nose-only is the last-resort tiebreaker when both torso lines were too
  // edge-on to trust (see facing-from-pose.js) - always uncertain,
  // regardless of the reported quality score.
  if (player.facingCue === 'nose') return true;
  return player.facingQuality != null && player.facingQuality < POSE_LOW_CONFIDENCE;
}
