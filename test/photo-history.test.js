// S-BACK-012 (remainder): which photo-overlay actions push an undo entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHistoryCommitAction } from '../web/src/authoring/photo-overlay/photo-history.js';

const COMMIT_ACTIONS = [
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
];

test('isHistoryCommitAction: true for every named discrete commit action', () => {
  for (const action of COMMIT_ACTIONS) {
    assert.equal(isHistoryCommitAction(action), true, `expected ${action} to commit`);
  }
});

test('isHistoryCommitAction: false for continuous-input / non-edit actions', () => {
  // Slider drag re-solves on every 'input' tick - pushing here would spam
  // the undo stack. View transitions (entering Photo View, restoring a
  // previously-saved overlay) reuse the same saveDoc() path but aren't a
  // new edit either.
  for (const action of ['fov-slider', 'k1-slider', 'view-enter', 'restore-saved-overlay']) {
    assert.equal(isHistoryCommitAction(action), false, `expected ${action} not to commit`);
  }
});

test('isHistoryCommitAction: false for unknown/malformed input', () => {
  for (const action of [undefined, null, '', 'not-a-real-action', 42, {}]) {
    assert.equal(isHistoryCommitAction(action), false);
  }
});
