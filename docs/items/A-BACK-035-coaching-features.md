# A-BACK-035 and up - Coaching features for Mode A

Ideas collected 2026-10-16 for turning Mode A from a planner into
something players see. All post-v1 and parked (plan.md section 3,
"Later") except where an item is moved up. Longer write-up with an
impact-vs-effort chart and a build order: the claude.ai doc "Mode A -
Feature Ideas" (not in the repo). Older related notes:
[reference/tactical-board-followups.md](../reference/tactical-board-followups.md)
(roster import, voice-over track).

## First three (have IDs)

- **[A-BACK-035] Frame notes.** A caption per frame ("Weak-side D
  slides to the slot"), stored on the frame (`frames[i].note`), shown
  during playback and burned into the video export. Later: voice-over.
- **[A-BACK-036] Printable drill sheet.** One-page PDF / print view:
  frames as small numbered top-down diagrams with their notes. Needs
  A-BACK-035. Diagrams should stay readable in black and white (see
  X/O symbols below).
- **[A-BACK-037] Formation and set-piece templates.** One-click start
  points: 2-2-1, box defence, 5v4, 4v5, face-offs, breakouts. Insert as
  a new frame or replace the current one.

## Rest (no ID yet; claim one when moved up)

- **Half-rink and drill layouts.** Crop or zoom the rink to a third or
  half for small-sided games and zone drills (view + print + export).
- **Player view and quiz mode.** Read-only playback from a share link;
  quiz pauses at a frame and asks "where do you move next?". Depends on
  M-Q-003.
- **Realism checks.** Warn on impossible running speeds between frames
  (gait speeds from A-BACK-032 as a reference) and on unmarked
  attackers. Pass and shot speeds are already capped.
- **Branching.** "If D steps up, pass B; otherwise C." Today the
  timeline is strictly linear; needs a doc-model change.
- **Roster and lines.** Pick chips from a saved squad, swap a whole
  line into a play.
- **Library export / import.** Whole library as one file to share
  between coaches. Allowed by S-DROP-002 (no backend); live sync or a
  shared folder is not. Depends on S-BACK-025 and M-Q-003.
- **Tablet authoring.** Touch-first editing at the bench. Conflicts
  with the "desktop first" UX principle; see A-Q-004.
- **More gaps** (from the ideas doc): slow motion, stick handedness in
  the 2D view, German UI, rule checks, Mode B photo to Mode A play
  (deferred in the old plan).

## Shapes: standard drill notation

Already there: straight / curved arrows (solid, dashed, dotted; filled,
open or no head), zones (freehand, rectangle, circle, triangle), text,
three cone types, balls, goals, chips. Missing, by value:

1. **Wavy line** for a ball carry (player runs while stickhandling).
   Today a carry and a run without the ball are both solid arrows.
2. **Double-line arrow** for a shot.
3. **X / O player symbols**, readable in black-and-white print.
4. Bar head ("T") for stop / block, double-headed arrow, numbered
   sequence badges on arrows.
5. Shooting sector wedge from any point, ellipse and rotatable shapes,
   vision cone.
6. Coach marker ("C"), training kit (mini goals, rebounders, ladders,
   hurdles, portable boards).
7. Callout with pointer line, highlight ring, freehand pen.
