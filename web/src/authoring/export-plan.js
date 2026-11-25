// The video export's frame plan (A-BACK-049): for each video frame, the
// play time it shows and the lesson card drawn over it. With `holds` the
// play freezes on each caption for its reading time, the same rule as the
// app's Hold (caption-hold.js), so the last caption is read too; a lesson
// with cards opens on its title card and closes on its recap. Without holds
// or cards it is the plain i / fps sweep the export always made. Pure, so
// it is Node-testable; export.js renders it.

import { captionHolds, stepWithHolds } from './caption-hold.js';

export const INTRO_MS = 4000;   // estimate: read the title and the task
export const RECAP_MS = 6000;   // estimate: read three bullets

export function exportPlan({ frames, lang, fps, startMs = 0, endMs, holds = false, lesson = null }) {
  const plan = [];
  if (!frames?.length || !(endMs > startMs)) return plan;
  const dt = 1000 / fps;
  const repeat = (ms, playMs, card) => { for (let i = 0, n = Math.round(ms * fps / 1000); i < n; i++) plan.push({ playMs, card }); };

  if (lesson?.intro) repeat(INTRO_MS, startMs, 'intro');
  if (!holds) {
    const n = Math.max(1, Math.floor((endMs - startMs) * fps / 1000));
    for (let i = 0; i < n; i++) plan.push({ playMs: startMs + i * dt, card: null });
  } else {
    const list = captionHolds(frames, lang).filter((h) => h.at >= startMs && h.at <= endMs);
    let s = { elapsed: startMs, holdLeft: 0, heldAt: -1 };
    // A hold at the very start fires before the first picture moves.
    const first = list.find((h) => h.at === startMs);
    if (first) s = { elapsed: startMs, holdLeft: first.ms, heldAt: startMs };
    for (;;) {
      plan.push({ playMs: Math.min(s.elapsed, endMs), card: null });
      if (s.elapsed >= endMs && s.holdLeft <= 0) break;
      s = stepWithHolds(s, dt, 1, list);
      if (s.elapsed > endMs) s = { ...s, elapsed: endMs };
    }
  }
  if (lesson?.recap) repeat(RECAP_MS, endMs, 'recap');
  return plan;
}
