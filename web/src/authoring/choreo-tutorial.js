// Guided Choreo tutorial (A-BACK-019): pure step machine, DOM-free so it is Node-testable.
// State is { completed: string[], note: string|null }; events come from choreoChanged,
// ballCarrierChanged, the tickChoreo move check and playbackChanged.

export const STEPS = ['choreo', 'move', 'pass', 'release', 'commit', 'play'];
const CHOREO_STEPS = ['choreo', 'move', 'pass', 'release'];
export const STALL_MS = 8000;

const HINTS = {
  choreo: 'Press Choreo on the timeline to plan the next frame.',
  move: 'Drag #7 forward. The cyan ring shows where he started.',
  pass: 'Pass: click #7 (he has the ball), then press #9 under "Pass to".',
  release: 'Choose when #7 passes: drag the orange diamond on his run (or use the Release slider). A green arrow means a clear lane, red means an opponent is in the way.',
  commit: 'Press Commit to keep the new frame.',
  play: 'Press Space to watch your play.',
};
const TARGETS = { choreo: 'choreoButton', move: 'chip:7', pass: 'carrier', release: 'releaseMarker', commit: 'commitButton', play: 'playButton' };
const NOTES = { incompleteCommit: 'That frame was saved without a pass and a move. Press Choreo to plan another one.' };
// Clicking an already-selected chip deselects it, so don't ask for that click.
const PASS_HINT_SELECTED = '#7 is already selected: press #9 under "Pass to" in the Inspector.';
const DONE_HINT = 'Nice - that is a choreographed play.';

export function initialTutorial() {
  return { completed: [], note: null };
}

const has = (s, step) => s.completed.includes(step);
const add = (s, step) => (has(s, step) ? s : { completed: [...s.completed, step], note: null });
const drop = (s, steps, note = null) => ({ completed: s.completed.filter((c) => !steps.includes(c)), note });

export function tutorialReducer(state, event) {
  const s = state ?? initialTutorial();
  const inChoreo = has(s, 'choreo') && !has(s, 'commit');
  switch (event?.type) {
    case 'choreoStart':
      return has(s, 'commit') ? s : add(s, 'choreo');
    case 'chipMoved':
      return inChoreo ? add(s, 'move') : s;
    case 'carrierChanged':
      return inChoreo ? add(s, 'pass') : s;
    // The pass stays editable after commit, so the release point may be chosen then too.
    case 'releaseChanged':
      return has(s, 'pass') ? add(s, 'release') : s;
    case 'choreoCancel':
      return inChoreo ? drop(s, CHOREO_STEPS) : s;
    case 'choreoCommit':
      if (!inChoreo) return s;
      if (!has(s, 'move') || !has(s, 'pass')) return drop(s, CHOREO_STEPS, 'incompleteCommit');
      return add(s, 'commit');
    case 'playStart':
      return has(s, 'commit') ? add(s, 'play') : s;
    default:
      return s;
  }
}

export function tutorialView(state, { carrierSelected = false } = {}) {
  const s = state ?? initialTutorial();
  const index = STEPS.findIndex((step) => !has(s, step));
  const done = index === -1;
  const step = done ? null : STEPS[index];
  const statuses = {};
  for (const st of STEPS) statuses[st] = has(s, st) ? 'complete' : st === step ? 'active' : 'pending';
  const stepHint = step === 'pass' && carrierSelected ? PASS_HINT_SELECTED : HINTS[step];
  const hint = done ? DONE_HINT : (s.note && NOTES[s.note]) || stepHint;
  return { step, index, hint, target: done ? null : TARGETS[step], done, statuses };
}

// Choreo mode itself is not persisted across a reload, so an unfinished draft restarts at Choreo.
export function resumeTutorial(saved) {
  const list = Array.isArray(saved?.completed) ? saved.completed.filter((c) => STEPS.includes(c)) : [];
  const s = { completed: [...new Set(list)], note: null };
  return has(s, 'commit') ? s : drop(s, CHOREO_STEPS);
}

export function stallCue(msIdle, { reducedMotion = false, done = false } = {}) {
  if (done || !(msIdle >= STALL_MS)) return null;
  return reducedMotion ? 'highlight' : 'pulse';
}
