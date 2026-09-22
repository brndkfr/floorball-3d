// S-BACK-012 (remainder): which photo-overlay actions push an undo-history
// entry.
//
// Landmark placement, drag, and solve all funnel through the same
// saveDoc() choke point (trySolve() in photo-overlay.js) as continuous
// input - the FOV/k1 sliders re-solve on every 'input' tick while being
// dragged, and re-entering Photo View / restoring a saved overlay re-runs
// a solve too. A landmark/chip/ball drag itself already only fires its
// move handler once on release (photo-canvas.js's mouseup handlers), so
// it's a discrete commit like a click, not a per-frame stream. Pushing a
// history entry on every saveDoc() call would spam the stack while a user
// merely drags the FOV slider; only discrete, user-visible edits should
// count. This module is the single list of which do - kept
// dependency-free (no three.js/DOM imports) so it stays unit-testable,
// unlike the rest of this DOM-only panel.
const COMMIT_ACTIONS = new Set([
  'landmark-place',
  'landmark-move',
  'landmark-delete',
  'landmark-flip-lr',
  'auto-detect-goal',
  'auto-tune-fov',
  'player-add',
  'player-auto-detect',
  'player-move',
  'player-flip-teams',
  'player-team-override',
  'player-delete',
  'ball-place',
  'ball-move',
  'facing-drag',
  'facing-estimate-pose',
  'facing-reset',
  'facing-clear-one',
  'feedback-clear',
  'goalie-assign',
  'goalie-auto-detect',
  'target-goal-select',
]);

export function isHistoryCommitAction(action) {
  return typeof action === 'string' && COMMIT_ACTIONS.has(action);
}
