# A-BACK-038 - Scene recorder redesign

Status: open. Design canvas (review + three variants, 2026-10-28):
<https://claude.ai/artifact/9HDiAjU276ZLXhr5DFwLW6>. Chosen: **Variant A,
"edit bay"**: a full-width time track under the rink, the frame's
details in the right panel. Variant C (compact on-air player) is the
candidate for tablet / phone playback once the Broadcast breakpoints
land.

## Review of the current recorder (1440 x 900, measured 2026-10-28)

- `#timeline` (bottom 70 px, 118 px tall) and `#dock` (bottom 18 px)
  float stacked over the rink and cover ~170 px of the near goal end.
- `#dockStatus` sits at bottom 130 px, inside the timeline, on top of the
  frame card.
- Frame actions are five 11 px glyphs (`◁+ ⧉ +▷ ▣ ×`) with ~12 px hit
  areas; meaning only in tooltips; Delete next to Camera.
- Duration is a raw millisecond number input.
- No scrubber, playhead, current time or total length.
- Speed cycles 1x..9x per click: no slow motion, 9x is useless.
- Loop uses the same glyph as the dock's "rotate view 90°".
- "+", "Choreo" and "Learn" sit side by side; "Learn" duplicates the top
  bar's Tutorial.
- Video export is only in the dock's "..." menu.

## Steps

1. **Overlap fix.** `#dockStatus` must not overlap `#timeline`.
2. **Controls, current layout** (logic survives any restyle):
   durations shown and stepped in seconds; scrubber + playhead +
   `00:03.4 / 00:08.0` readout; speeds 0.25x / 0.5x / 1x / 2x (keys 1-4);
   distinct loop icon; one "⋯" menu per frame (Duplicate, Insert before /
   after, Camera, Delete last); an Export button on the recorder.
3. **Variant A layout**, done as part of S-BACK-021 (app shell + right
   panel first): full-width track, frame segments as wide as they are
   long, playhead, "Next move" split button (Choreo default), tools move
   from the dock into the palette.
4. **Frame details in the right panel**: name, duration, camera keyframe,
   coach note (the note is A-BACK-035).
5. Later: Variant C player under 1200 px and while playing.

Keys stay: Space play / pause, `,` / `.` step, R loop. Left / Right stay
unbound (they move chips).
