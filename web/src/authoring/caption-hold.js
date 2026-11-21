// Pause on captions (A-BACK-049): during playback, a frame with a note
// (A-BACK-035) holds at its start for a reading time, then the move plays.
// The hold is wall-clock time, so slow motion does not stretch it and 2x
// does not cut it short. Pure so it is Node-testable; playback.js steps
// with stepWithHolds() each tick.

import { noteText } from './frame-notes.js';

// Reading time estimates, not sourced: about 15 characters a second plus a
// second to notice the caption, at least 2 s, at most 8 s (a full 280-char
// note would need ~19 s; the coach can pause for those).
export const HOLD_MIN_MS = 2000;
export const HOLD_MAX_MS = 8000;
const HOLD_BASE_MS = 1000;
const HOLD_PER_CHAR_MS = 60;

export function captionHoldMs(text) {
  const n = typeof text === 'string' ? text.trim().length : 0;
  if (!n) return 0;
  return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, HOLD_BASE_MS + n * HOLD_PER_CHAR_MS));
}

// [{ at, ms }] sorted by `at`: the start time (play ms) of each frame that
// has a note in `lang`, and how long to hold there.
export function captionHolds(frames, lang) {
  const out = [];
  if (!frames?.length) return out;
  let at = 0;
  for (let i = 0; i < frames.length; i++) {
    const ms = captionHoldMs(noteText(frames[i].note, lang));
    if (ms) out.push({ at, ms });
    if (i < frames.length - 1) at += frames[i].duration;
  }
  return out;
}

// One playback tick. `s` = { elapsed (play ms), holdLeft (wall ms),
// heldAt (play ms of the last hold, so it does not fire again) };
// `wallDt` real ms since the last tick; `speed` the playback speed.
export function stepWithHolds(s, wallDt, speed, holds) {
  let { elapsed, holdLeft, heldAt } = s;
  let wall = Math.max(0, wallDt);
  while (wall > 0) {
    if (holdLeft > 0) {
      const use = Math.min(wall, holdLeft);
      holdLeft -= use;
      wall -= use;
      continue;
    }
    const reach = elapsed + wall * speed;
    const next = holds.find((h) => h.at >= elapsed && h.at !== heldAt && h.at <= reach);
    if (!next) { elapsed = reach; wall = 0; break; }
    wall -= (next.at - elapsed) / speed;
    elapsed = next.at;
    heldAt = next.at;
    holdLeft = next.ms;
  }
  return { elapsed, holdLeft, heldAt };
}
