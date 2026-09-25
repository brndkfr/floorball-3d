// Pure state -> step derivation for the guided Photo Overlay UX
// (B-BUG-002 - see docs/plan.md §4.3). Kept dependency-free so it can
// unit-test in Node and be called from any photo-overlay module without
// coupling to DOM handles.
//
// Steps mirror §4.3:
//   1 - Photo: no image loaded yet.
//   2 - Align: image loaded, camera pose not yet solved with acceptable
//       reprojection error on enough landmarks.
//   3 - Players & ball: pose is solved and usable, but no players placed
//       yet OR the ball hasn't been set.
//   4 - Insights: enough scene data (players + ball) to render the
//       tactical read-out.
//
// The thresholds MUST match the runtime enable/disable logic in
// photo-overlay.js (STEP3_MAX_REPROJ_ERROR_PX, MIN_LANDMARKS) so the
// stepper and the actual button-enable state stay in sync. If either
// changes, mirror it here + in test/photo-step-tracker.test.js.

export const STEP_PHOTO = 1;
export const STEP_ALIGN = 2;
export const STEP_PLAYERS = 3;
export const STEP_INSIGHTS = 4;

// Pose is "usable" for downstream steps when a real solve happened,
// enough landmarks were used, and the reprojection error is in range.
export function isPoseUsable({ landmarkCount = 0, reprojErrorPx = null, minLandmarks = 6, maxReprojErrorPx = 20 } = {}) {
  if (landmarkCount < minLandmarks) return false;
  if (reprojErrorPx == null || !Number.isFinite(reprojErrorPx)) return false;
  return reprojErrorPx <= maxReprojErrorPx;
}

// Derives which step the user should be on given the current photo/frame
// state. Never returns >4.
export function currentStep({
  hasPhoto = false,
  landmarkCount = 0,
  reprojErrorPx = null,
  playerCount = 0,
  hasBall = false,
  minLandmarks = 6,
  maxReprojErrorPx = 20,
} = {}) {
  if (!hasPhoto) return STEP_PHOTO;
  const poseUsable = isPoseUsable({ landmarkCount, reprojErrorPx, minLandmarks, maxReprojErrorPx });
  if (!poseUsable) return STEP_ALIGN;
  if (playerCount === 0 || !hasBall) return STEP_PLAYERS;
  return STEP_INSIGHTS;
}

// Per-step status for the stepper indicator:
//   'complete' - preconditions for the step are satisfied
//   'active'   - this is the step the user should work on next
//   'pending'  - preconditions from earlier steps not yet met
// Note that Step 4 never reports 'complete' - insights are a live view,
// not a milestone.
export function stepStatuses(state) {
  const now = currentStep(state);
  const out = {};
  for (const step of [STEP_PHOTO, STEP_ALIGN, STEP_PLAYERS, STEP_INSIGHTS]) {
    if (step < now) out[step] = 'complete';
    else if (step === now) out[step] = 'active';
    else out[step] = 'pending';
  }
  return out;
}

// One-liner guided hint for the current step. Kept short - the plan wants
// "one primary action per step", so this echoes what the primary CTA will
// do rather than restating all the options.
export function guidedHint(state) {
  const step = currentStep(state);
  switch (step) {
    case STEP_PHOTO:
      return 'Upload a match photo to analyse.';
    case STEP_ALIGN: {
      const need = Math.max(0, (state.minLandmarks || 6) - (state.landmarkCount || 0));
      if (need > 0) return `Place ${need} more landmark${need === 1 ? '' : 's'} to align the rink.`;
      const err = state.reprojErrorPx;
      if (err == null || !Number.isFinite(err)) return 'Solve the camera pose to continue.';
      return `Alignment error ${err.toFixed(1)} px - refine landmarks until under ${state.maxReprojErrorPx || 20} px.`;
    }
    case STEP_PLAYERS: {
      if ((state.playerCount || 0) === 0) return 'Auto-detect players, or add them manually.';
      if (!state.hasBall) return 'Click the photo to place the ball.';
      return 'Confirm player positions and ball placement.';
    }
    case STEP_INSIGHTS:
      return 'Pick the target goal to see shot / coverage / passing insights.';
    default:
      return '';
  }
}

// Step 3 checklist (S-BACK-021 gaps canvas): find players, check teams, mark
// the ball, facing (optional). "Teams" counts as checked once both teams
// have at least one player - the closest thing to "the colours were looked
// at" the data can tell us.
export function playersChecklist({ players = [], hasBall = false } = {}) {
  const n = players.length;
  const teams = new Set(players.map((p) => p.team));
  return [
    { key: 'find', done: n > 0, detail: n ? `${n} found. Missed someone? Add them below.` : 'None yet.' },
    { key: 'teams', done: teams.has('home') && teams.has('away'), detail: 'Colours backwards?' },
    { key: 'ball', done: !!hasBall, detail: 'Click it on the photo.' },
    { key: 'facing', done: players.some((p) => p.facingDeg != null), optional: true, detail: 'Optional. Reads shoulders and head.' },
  ];
}
