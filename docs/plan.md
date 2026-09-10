# Floorball Studio - Plan & Handoff

Single source of truth. Supersedes everything under [docs/archive/](archive/).
For historical inspiration only, see [docs/reference/](reference/).

---

## 0. Work item ID scheme

Every actionable item in this plan carries a stable ID so a new session can
resume by ID alone ("work on `A-BACK-007`"). Format:

```
<mode>-<kind>-<nnn>
```

- **mode**: `A` (Mode A / tactical planning), `B` (Mode B / photo-video),
  `S` (shared/infra), `M` (meta - open questions, process).
- **kind**: `GAP` (gap-to-product), `BACK` (backlog item), `BUG` (known
  problem, not yet solved), `PHASE` (roadmap phase), `Q` (open question),
  `DROP` (explicitly deferred / not doing).
- **nnn**: zero-padded ordinal. **IDs are permanent - never reused.** If an
  item is dropped, mark it `[dropped]` in place; don't delete the ID.

Status suffix on the item line (in addition to any narrative):
`[open]` (default), `[in-progress]`, `[shipped]`, `[dropped]`,
`[blocked-by: <ID>]`.

To claim an ID for new work, use the next unused ordinal in that
`<mode>-<kind>` sequence (grep the file for the prefix). Shipped items in
narrative form (e.g. §3.3 "Shipped from the design-sample exploration",
§4.1 "What ships today") do NOT get IDs - IDs are for work still to do or
phases that gate other work.

---

## 1. Product vision

A static-site tool for floorball tacticians and analysts, delivered as two
modes on a shared 3D rink and a shared compute layer (trajectory, coverage,
goal geometry, doc model).

- **Mode A - Tactical Planning**: design plays. Author in 2D, record in 2D or 3D.
- **Mode B - Photo/Video Analysis**: align a real photo (later a video frame)
  to the rink, then answer tactical questions using the same compute layer as
  Mode A ("was that shot on target?", "who could he have passed to?").

Only the INPUT source differs between the two modes; the insight overlays
render identically.

---

## 2. Product-level UX principles

The current UI is a dev console (HUD panels stacked with sliders and
checkboxes). The redesign target follows these principles:

- **Persistent left rail**: `Plan` / `Analyze` / `Library` are always visible.
- **Each mode owns the workspace** when active. No HUD-panel soup.
- **Progressive disclosure**: default screen has <=5 controls; the rest sits
  behind an "Advanced" accordion.
- **One primary CTA per step**.
- **Visual feedback beats numeric feedback**: a before/after slider is a
  better alignment signal than "reprojection error 4.2 px".
- **Named things**: "Player 7", not `chip_7`. "Attack frame", not `frame_2`.
- **Library concept** replaces the single persisted `state.doc`.
- **Desktop-first, tablet/mobile responsive later** (desktop > tablet > mobile).

### Redesign strategy: fresh app shell

Build a new `web/index.html` layout (left rail, top bar, main stage) and port
existing modules into it one by one. Old modules keep working; they get
re-mounted into new containers. First screen with the new shell already
looks like a product; incremental rework would keep the dev-tool aesthetic
around indefinitely.

**Status: shipped.** Left rail (`Plan` / `Analyze` / `Library`) + top bar in
`web/index.html`, mode-switching in [shell.js](../web/src/shell.js) via
`[data-view]` tags on existing panels - no `authoring/`/`photo-overlay/`
logic touched. `Library` is a placeholder ("coming soon"), per the open
question in section 10.

### Design system

Chosen stack: **Open Props** (spacing/radius/shadow/type tokens) +
**Shoelace** web components (buttons, tabs, sliders, drawers, alerts -
framework-agnostic, no build step) + **Radix Colors** (accessible 12-step
colour scales) for the palette, with a small semantic token layer on top
(`--surface-1/2/3`, `--accent`, `--team-home`/`--team-away`,
`--vector-pass`/`--vector-shot`/`--vector-coverage`).

All three are vendored locally under `web/lib/` (same pattern as
`web/lib/opencv.js`) rather than pulled from a CDN, so the app has no
runtime dependency on a third-party host. See
`/memories/repo/design-system-vendoring.md` for the re-vendoring steps and a
Shoelace self-hosting gotcha (base-path resolution) hit while wiring it up.

A working demo of the shell + tokens + a Mode B stepper screen lives in
`web/design-sample/` (not part of the shipped app; a visual reference to
port from). It also demonstrates the chip-anchored popover pattern from
section 3.3.

---

## 3. Mode A - Tactical Planning

### 3.1 What ships today

The A1-A7 authoring stack: chips, paths, shapes, drawings, frames, playback,
export. Data model is `state.doc` v2 with a per-frame `scheme` accessor
(see [web/src/authoring/doc.js](../web/src/authoring/doc.js)).
`topdown-camera.js` provides the 2D view; `export.js` is camera-agnostic
(2D or 3D recording already free).

### 3.2 Gaps to product

- **[A-GAP-001]** [open] **2D-first authoring surface**. The current 2D view
  is a preview of 3D interactions, not a native 2D UX like tactical-board.com.
- **[A-GAP-002]** [open] **Frame thumbnails** on the timeline (per-frame
  top-down snapshot of chips + shapes; needs invalidation + caching so it
  isn't re-rendered every tick).
- **[A-GAP-003]** [open] **Named projects in a Library** (currently one
  persisted doc).

### 3.3 Backlog

See [docs/reference/tactical-board-followups.md](reference/tactical-board-followups.md)
and the 2D reference plan [docs/reference/floorball-board-clone-plan.md](reference/floorball-board-clone-plan.md).
Those describe a different product (2D clone) but their feature list is a
useful checklist when building Mode A's UX.

Shipped from the design-sample exploration:

- **Left tool palette + right Inspector** (2D-native authoring surface, first
  cut): 5-button vertical palette (Select / Chip / Arrow / Zone / Text) driving
  `state.activeTool`, and a selection-driven Inspector for shape colour /
  text / read-only labels. Chip stamp/arrow/zone/text buttons hidden from the
  bottom dock (kept in the DOM so keyboard/Esc/status wiring keeps working).
- **Chip-anchored popover** ([chip-popover.js](../web/src/authoring/chip-popover.js)):
  when a chip is selected, a floating card with `Player #N` + T1/T2 + Delete
  glues itself to the chip's screen-space position (self-driven rAF loop,
  clamps to viewport edges, hides when behind camera). Replaces the
  Inspector's chip UI - the Inspector now just shows a short hint for chip
  selections. Collapsed by default (label pill + chevron); expanding reveals
  an editable label input (persisted as `player.label`), the T1/T2 buttons,
  and Delete.
- **RTS-style input model** (Plan mode). One dedicated verb per mouse
  button, no more click-vs-drag threshold heuristic. See
  [selection.js](../web/src/selection.js) and [controls.js](../web/src/controls.js):
  - Left-click: select an object (chip / shape / ball / goalie / goal);
    empty-floor click deselects, or places with the active tool.
  - Left-drag on a chip: move that chip under the cursor (grab-and-drag;
    the chip becomes selected as the drag starts).
  - Right-click on empty floor: move-command - the selected chip / ball /
    goalie walks to the click point (top-down only; ambiguous in 3D).
  - Right-click while a tool is active: cancel the tool.
  - Right-drag / middle-drag: pan the top-down camera (topdown-camera.js).
  - Wheel: zoom.
  - Arrows / WASD: pan the camera. Never move the selected item - that's
    mouse-only now. In 3D perspective they still walk relative to look yaw.
  - Q / E while goalie selected: rotate goalie (Shift = fine).
  - Del / Backspace: delete selected chip or shape. Ctrl+Z / Ctrl+Y:
    undo / redo (already in dock.js). Tab / Shift+Tab: cycle selection.
  - Left-drag in 3D still turns the perspective camera; not touched.
  - Tool number-hotkeys (1-5) deliberately NOT added yet - `1..9` are already
    playback-speed hotkeys in timeline.js. Follow-up if we ever settle on a
    letter-based tool hotkey scheme.
- **Semantic colour tokens for insight overlays**
  ([tokens.js](../web/src/tokens.js), [tokens.css](../web/src/tokens.css)):
  named tokens for team colours, shot-line states (open / blocked-off /
  blocked-centred), coverage-grid states (open / blocked), and vector
  overlays (trajectory / pass / shot). [coverage.js](../web/src/coverage.js)
  and [trajectory.js](../web/src/trajectory.js) switched off ad-hoc hex
  literals onto the tokens; Mode B chips + preview-3d.js already pull team
  colours from the same source, so both modes now render the same colours
  for the same concepts.

Still on the backlog from that exploration:

- **[A-BACK-001]** [open] **Layers panel enhancements** (shipped: right-rail
  panel with per-row eye toggles for chips + shapes, click-to-select, section
  + panel collapse persisted). Follow-ups: inline rename of chip labels +
  shape names directly from the panel row (currently rename lives only in
  the chip popover / shape inspector); drag-to-reorder within a section to
  influence the shape `layer` group; right-click row -> Delete.
- **Zone label typography follow-ups** (shipped: Inspector Label input,
  floor-plane text sprite laid flat inside the zone, fit-both aspect-
  preserved autosize so long labels never overflow the zone bbox).
  Follow-ups:
  1. **[A-BACK-002]** [shipped] *Multi-line wrap.* Long labels in narrow zones
     currently shrink to a single tiny line; wrap on word boundaries first,
     then autosize, so "grindcore zone" becomes two readable lines in a
     tall zone.
  2. **[A-BACK-003]** [shipped] *Auto-rotate for tall zones.* When
     `bboxH > bboxW * 1.5`, render the label rotated 90 deg so vertical
     zones read comfortably.
  3. **[A-BACK-004]** [shipped] *User overrides in the Inspector.* Explicit
     Size slider (mm), rotation buttons (0/90/-90), and weight toggle
     (Regular/Bold) that override the autofit when the user wants a specific
     look.
- **[A-BACK-005]** [open] **Wireframe/contour overlay mode**: a high-contrast
  outline-only render mode for the rink/goal overlay in Mode B, for photos
  where a solid overlay is hard to see against similar-coloured backgrounds.
- **[A-BACK-006]** [blocked-by: A-BACK-007] **Choreograph mode** (frame-
  recording UX). Right-click today is a "move-command in the current frame" -
  semantically identical to drag-move, just a different gesture. Users
  wanting a game-like "record my play" workflow will hit a mental-model
  conflict because the doc's frames + bezier paths already ARE the recording.
  Four interpretations exist, all with tradeoffs:
  1. *Move-command in current frame* (shipped). Cheap, safe, redundant with
     drag.
  2. *Right-click auto-creates the next frame.* Feels game-like, but 5-player
     floorball formations move simultaneously; per-chip right-clicks would
     explode frame count and can't express "all five run at once."
  3. *Right-click drops a bezier waypoint on the current segment.* Turns
     straight runs into curves without new frames. Forces the path model to
     become a variable-length list of sub-segments (playback interpolation,
     path-handles, serialization all shift).
  4. *Real-time record mode with a REC button.* Playback runs at 1x while
     the user right-clicks each chip's next position; positions are stamped
     at the current playback time. New authoring paradigm layered on top of
     the frame model.
  Preferred future direction (not planned yet): modal "Choreograph frame N+1"
  toggle where all chips are pinned to frame N; left-click to arm a chip,
  right-click to set its endpoint; click **Commit** to bake exactly one new
  frame containing all armed chips' new positions. Un-armed chips carry
  over. This gives the "record" feel without the per-click frame explosion.
  Depends on multi-select being solved first (currently only single chip
  selection) - otherwise the modal cycle is still per-chip.
- **[A-BACK-007]** [open] **Marquee (box) multi-select**. The real gap for
  formation authoring: drag on empty floor selects every chip inside the
  rectangle. Every mutation (delete, updateTeam, move, right-click move-
  command) then has to accept a set, not a single object. Prereq for
  Choreograph mode above.
- **Move-command polish**. The RTS-style right-click currently teleports
  the chip / ball / goalie to the click point. Two cheap wins on top:
  1. **[A-BACK-008]** [shipped] *"Go here" flash marker* at the click point (a
     brief expanding ring, same idiom as the chip-drop animation in
     `chips.js`) so the gesture has a visible receipt.
  2. **[A-BACK-009]** [open] *Walk animation* - tween the chip's position
     over ~200-400 ms instead of teleporting, so a move-command feels like
     a unit moving, not teleporting. Needs the tween to be interruptible
     (a second right-click mid-walk redirects to the new target) and to
     not fight playback interpolation (skip the tween when playback is
     running - playback owns positions then).
- **[A-BACK-010]** [open] **Persistent in-scene chip labels**. Today the
  chip's `player.label` ("Wing", "Michael") only shows in the popover when
  the chip is selected. Rendering the label as a small floating text sprite
  above the chip (like the number sprite in `chips.js`, but text and only
  when label is set) would let a coach scan a formation without clicking
  each chip. Needs a visibility toggle (labels get noisy on 10 chips +
  shapes + zones), and the sprite's screen-space size should stay legible
  across zoom levels in top-down - the number sprite already handles this
  pattern, so it's mostly a re-use.
- **[A-BACK-011]** [in-progress] **Arrow shape refinement**. Current arrows
  ([shapes.js](../web/src/authoring/shapes.js)) are a straight shaft +
  fixed-size triangle head, with `shape.width` stored but ignored. Scope:
  1. **[A-BACK-011a]** [shipped] *Respect `shape.width`* in
     `buildArrowGeometry` (scale `ARROW_BODY_HALF_W` + head proportionally
     from the stored width instead of using constants). Inspector already
     has a width control; wire it end-to-end.
  2. **[A-BACK-011b]** [shipped] *Curved / multi-segment arrows.* Draw tool
     accepts N clicks; Enter / double-click / right-click commits (right-
     click also cancels when < 2 points). N >= 3 points is smoothed via
     Catmull-Rom (`smooth` toggle in Inspector); N = 2 stays a straight
     segment. Ribbon is built with clamped miter joins on the sampled
     polyline; head sits at the last-segment tangent so a curve terminates
     correctly.
  3. **[A-BACK-011c]** [shipped] *Head style variants* (`filled` triangle,
     `open` chevron drawn as two thin ribbon-strokes, `none`) + shaft styles
     (`solid`, `dashed`, `dotted`). Stored as `shape.headStyle` +
     `shape.shaftStyle`; Inspector dropdown pickers.
  4. **[A-BACK-011d]** [shipped] *Draggable endpoints + head-size handle* on
     the selected arrow. Reuses the `path-handles.js` pattern from chip
     paths (screen-space-sized handles, drag updates `shape.points`).
  5. **[A-BACK-011e]** [shipped] *Semantic arrow types* (pass / shot / run)
     auto-coloured from `tokens.js` (`--vector-pass`/`--vector-shot`/
     `--vector-run`?). Stored as `shape.role`; colour derived, user can
     still override.
  6. **[A-BACK-011f]** [shipped] *Arrow labels.* Optional short text stored
     as `shape.label`, rendered as a floor-plane text sprite anchored to
     the arrow's midpoint (or the head end?), oriented along the arrow.
     Reuses the zone-label sprite pipeline. Inspector Label input.

---

## 4. Mode B - Photo/Video Analysis

Video is in scope from the start. Phase order is photo first, then per-frame
video (photo mode already handles single frames; video wraps that with
playback + tracking + interpolation).

### 4.1 What ships today (Phase 1 - manual PnP calibration)

- [landmarks.js](../web/src/authoring/photo-overlay/landmarks.js) - world-space
  landmarks with paired floor + board-top entries.
- [pnp.js](../web/src/authoring/photo-overlay/pnp.js) - `solveCameraPose` with
  `k1` distortion and LM refinement; returns per-point error + `projectWorld`.
- [photo-canvas.js](../web/src/authoring/photo-overlay/photo-canvas.js) - 2D
  canvas with zoom/pan, edge overlay, ROI drawing, pending marker.
- [border-mode.js](../web/src/authoring/photo-overlay/border-mode.js) -
  mini-map + snap-to-perimeter for arbitrary board-top points at y=500,
  with orientation labels.
- [detect.js](../web/src/authoring/photo-overlay/detect.js) - classical CV
  goal + crease detection, Canny edge overlay.
- [exif.js](../web/src/authoring/photo-overlay/exif.js) - reads
  `FocalLengthIn35mmFilm` to seed FOV.
- Auto-tune FOV sweep with coarse+fine passes.
- **Step 2 auto-align moved from file-load to zoom-into-goal** (revised
  this session): `detectGoal`/`detectCrease` no longer run automatically
  on file drop - whole-image detection proved unreliable in practice (see
  4.2), routinely picking a sponsor banner or spectator chairs over the
  actual goal, since nothing yet narrows the search. Auto-align now runs
  right after the user zooms into the goal via "Draw + zoom to goal
  region" (`setRoiChangeHandler`), the one point the search window can
  actually be trusted; a "we aligned it for you" banner + Refine button
  still skip the manual flow if reprojection error < 10px on >= 6 points.
  FOV/k1/edge overlay/border-mode live behind an "Advanced" accordion.
- **Scroll-zoom scopes Auto-detect**: `photoCanvas.getViewRoi()` derives an
  implicit ROI from the current scroll-zoomed/panned view (in original image
  px) when no explicit ROI-drag rect is set. "Auto-detect goal + crease"
  now uses whichever is set, explicit ROI first - so scroll-zooming onto
  the goal before clicking Auto-detect narrows the search the same way the
  dedicated ROI-drag tool does, without a separate gesture.
- **Border-mode minimap zoom**: `setFocusEnd()` zooms the minimap to whichever
  goal end the "detect as" dropdown names, instead of always showing the
  full 40m rink at a tiny scale.
- **"Fit rink outline" tool** ([photo-canvas.js](../web/src/authoring/photo-overlay/photo-canvas.js)):
  a free quadrilateral (4 independently-draggable corners + 2 edge-constrained
  midpoints, no rigid rotate/resize) the user drags onto the boards as an
  alternative to clicking named landmarks one at a time. Maps to the 6
  board-tangent/board-centre landmarks; a handle dragged past the photo's
  edge (rink corner not actually in frame) is excluded from the solve rather
  than fed in as a fake point. Board-top vs floor-level toggle, mirror
  left/right toggle, and its goal-end labelling follows the same "detect as"
  dropdown as auto-detect/border-mode (whichever goal you tag there is Goal A
  everywhere in the panel). An earlier 3D fly-camera "manual fit" experiment
  was replaced by this flat-quad approach per user preference.
- **Reference-strip preview is now landmark-aware**: the projected
  goal-frame/crease/board-outline overlay only draws strips actually backed
  by a placed landmark (`goalA`/`goalB`/`board` groups) - previously it always
  drew both goals + the full 40m outline regardless of what was placed,
  which looked like "broken" lines when only one goal's points existed.
- **Persistent debug log**: `window.__photoOverlayDebugLog` (capped at 200
  entries) records every solve attempt - point count, per-point error,
  coplanar flag, camera pose - and rink-outline confirms. Inspectable via
  browser tools (`page.evaluate(() => window.__photoOverlayDebugLog)`)
  without needing console access or screenshots.
- **Guided one-hint-at-a-time manual fallback**: when auto-align doesn't
  reach < 10px error, a curated 8-point sequence per goal end (crease
  near-L/R, post base L/R, post-top L/R, board tangent L/R - mixes y=0 and
  y=1150 so the coplanar trap can't happen even via hints alone) is
  presented one at a time with an inline top-down SVG diagram highlighting
  where that point is, auto-advancing on each click. A "can't see this
  point - skip" button moves to the next hint without placing anything.
  The full 30+ row checklist is still reachable behind an "All landmarks"
  `<details>` disclosure, which also ends guided mode if opened (manual
  override).
- **Before/after alignment slider**: a 0-100 slider fades the solved
  preview strips over the photo (0 = photo alone, 100 = full overlay),
  giving a continuous visual alignment signal instead of only a number.
  The raw reprojection error text is now a small badge, not the primary UI.

### 4.2 Known problems

- **Auto-detect on a zoomed ROI used to nuke the goal frame** - fixed.
  `detectGoal` was always downscaling the WHOLE photo to maxSide=1024
  before filtering by ROI, so a small ROI on a large phone photo (e.g.
  3072x4080) squeezed the goal down to a handful of pixels; the fixed 5x5
  morphology kernel then erased the (now wafer-thin) frame entirely,
  leaving only a small red artifact to win the aspect-ratio scoring
  (observed: an 11x7px "goal" from a real 12MP photo). Now crops to the
  ROI (plus 25% margin) at full resolution *before* downscaling - verified
  a subsequent detect on a cropped goal recovers a bounding box matching
  the goal's actual on-screen size almost exactly.
- **ROI-drag was silently placing the armed landmark at the drag-release
  point** - fixed. The `click` event fires after `mouseup` already cleared
  `roiMode`/`roiDrag`, so the click handler's guard never actually
  suppressed it. Added a `roiJustHit` flag (mirrors the existing
  `quadJustHit` pattern for the rink-outline tool).
- **detectCrease's white sponsor-banner text false positive** - fixed with
  the same crop-before-detect approach: a large white banner blob (e.g.
  "die Mobiliar" sponsor text merged by the closing morphology) could have
  its centroid land inside the crease search window while its corners
  sprawled across nearly the whole photo. Cropping to the window before
  running the white mask makes that impossible. Goalie-gear occlusion of
  the actual crease paint remains a real, unsolved hard case (classical CV
  can't tell white pads from white paint) - manual nudge/skip is still the
  fallback there.
- **Auto-detect is now goal-only** - crease auto-detection has been
  removed entirely (not just gated behind a crop fix). Every real-photo
  test this session hit a different crease failure mode (banner text,
  goalie occlusion) while the goal frame, once properly ROI-scoped, was
  reliable. `detectAndPlace()` only ever places the 4 post corners now;
  crease/board/face-off landmarks are manual-only.
- **Goal-only L/R disambiguation is fundamentally unreliable near head-on
  angles** - confirmed via direct test (not theorized): the two L/R-swap
  trial solves on the repo's ground-truth photo differed in reprojection
  error at the 6th decimal place (0.909927... vs 0.909930...), and the
  "pick lower error" heuristic chose the WRONG (mirrored) one, verified
  against ground-truth labels baked into the test image. A goal viewed
  near head-on is close to bilaterally symmetric, so no amount of
  error-based tie-breaking reliably resolves it - this needs either a
  second, asymmetric real-world cue (which crease auto-detect could have
  provided, but that's now removed - see above) or a manual override.
  Added a **"Flip left/right" button**: swaps the 4 placed goal points'
  world-space keys (pixel positions unchanged) in one click, instead of
  re-placing everything by hand when the overlay looks mirrored.
- **Detected goal corners were biased ~4-7% off the true corner** - fixed.
  `cv.minAreaRect` fits the smallest rectangle enclosing the whole red
  blob, including each corner's rounded ball/fillet joint - that
  bounding-rect corner sits at the ball's outer tangent, not its centre.
  Verified with a pixel-level crop test (10x zoom, no smoothing) and
  fixed by shrinking each corner toward the quad's centroid by a tuned
  7% (`CORNER_INSET_FRAC`), re-verified the same way until the crosshair
  landed on the joint's visual centre.
- **Auto-detect fails on broadcast photos** where a red sponsor banner
  sits directly behind/above the goal - **partially addressed**. The
  detector was choosing the banner over the actual goal frame (banner is
  larger/more solid than the thinner, net-occluded frame, so it won on
  area). Added a hole/hierarchy-based text filter: `cv.RETR_CCOMP` +
  reading each candidate's child contours lets us reject blobs with many
  small holes (banner text letters carved out of the solid colour) while
  still accepting a real goal frame's one big hole (the net/mouth
  interior). No new dependency - reuses the already-vendored opencv.js;
  MSER was considered but isn't actually present in this build (checked).
  Verified no regression on the repo's ground-truth test photo. Not yet
  re-verified against a real banner-contaminated photo (needs a real
  phone photo upload, not reproducible with files in the repo) - aspect-
  ratio scoring alone still isn't sufficient on its own, per the original
  note; manual clicks remain the fallback if the hole filter doesn't
  catch a specific banner's font/layout.
- **Placed landmark markers are now draggable directly on the photo**:
  click-drag any existing cyan crosshair to nudge its position (position
  updates live; re-solve fires once on drag release, not per-frame). A
  drag only counts once the mouse moves past a small threshold - a plain
  click near an existing marker (common with tightly-clustered points)
  falls through to normal landmark placement instead of silently grabbing/
  relocating whatever marker happened to be nearby (a real regression
  caught and fixed in the same session it was introduced). Markers also
  show a friendly label (`#3 Goal A - left post (base)`) with an
  outlined/legible style, not just a bare number.
- **Auto-detect no longer force-resets zoom on every call** - it only
  resets if some newly-placed point would actually be off-screen given
  the current view (`photoCanvas.arePointsVisible()`), instead of always
  snapping back to the full photo - repeatedly re-running auto-detect
  while already zoomed into a good view no longer yanks the zoom back
  each time.
- **[B-BUG-001]** [open] **Coplanar landmark trap**: solvePnP has a depth/FOV
  ambiguity when all placed points share a Y coordinate. Auto-tune FOV then
  converges to wrong values (observed: 20° on a mid-focal shot). Mix at
  least two of {floor y=0, post-top y=1150, board-top y=500}. Warning banner
  is shipped; the underlying trap remains a fundamental PnP constraint.
- **[B-BUG-002]** [in-progress] **Manual calibration UX is a dev console** -
  20+ controls at once, no guidance. The stepper redesign in 4.3 addresses
  this; Steps 1-2 shipped, Steps 3-4 depend on Phases 2/3.
- **[B-BUG-003]** [open] **Long-baseline point sensitivity**: board/centre-line points ~16-20m from
  the goal cluster amplify small pixel-placement errors into large pose
  error far more than near-goal points do (observed this session: adding 3
  imprecisely-dragged rink-outline points took a clean 5.8px/6-point solve
  to 165px, with the camera position jumping to a nonsensical location).
  Neither the coplanar warning nor the per-point error catches this before
  the fact - always re-check the overall reprojection error line after
  adding far points, don't assume more points = better.
- **Rink-outline tool zoom/pan**: verified working - wheel-zoom and
  right-click-drag pan are wired at the top level in
  [photo-canvas.js](../web/src/authoring/photo-overlay/photo-canvas.js),
  independent of rink-fit mode, and handle hit-test tolerance is
  scale-invariant (constant ~12 screen px regardless of zoom). No longer a
  known problem as of this session.

### 4.3 Target UX (guided stepper)

Four steps, one primary action per step. **Step 1 and Step 2 are fully
shipped**; Steps 3-4 depend on Phase 2/3.

**Step 1 - Photo/Video**: drag-drop area, thumbnail. For video, pick a
frame to analyze first (per-frame in v1).

**Step 2 - Align** (shipped):
- On load, seed the FOV slider from `readFocalLength35mm` (EXIF) if
  present, then go straight to guided hints - `detectGoal`/`detectCrease`
  do NOT run on the whole image (revised this session; unreliable, see
  4.2). Auto-detect instead runs automatically once the user zooms into
  the goal via "Draw + zoom to goal region" - that ROI is what makes the
  search trustworthy.
- If reprojection error < 10 px on >= 6 points, skip to Step 3 with a
  "we aligned it for you" banner + "Refine" button.
- Manual fallback presents **one guided hint at a time** ("Click the
  front-left crease corner") with an inline diagram highlighting that
  landmark on a top-down rink sketch. Auto-advance to the next hint on click.
- FOV slider, `k1` slider, border mode, edge overlay all live behind an
  **"Advanced" accordion**. Most users never open it.
- The primary alignment judgement is a **before/after slider** (photo alone
  vs photo + coloured overlay). Reprojection error becomes a small badge.

**Step 3 - Players + Ball**:
- Auto-detected player chips overlaid on the photo (Phase 2 - YOLO).
- Drag any chip to correct its position.
- One click on the photo marks the **ball** (world floor point via camera ray).
- Nearest player automatically becomes the **ball carrier** (visually
  highlighted; user can override by clicking a different chip).
- **Facing direction v1**: default toward the closer goal, plus a
  drag-to-rotate arrow handle on the ball-carrier chip. No ML dependency.

**Step 4 - Insights**:
- **Shot trajectory** from ball toward the goal, coloured by whether it
  crosses goalie coverage (reuses `trajectory.js` + `coverage.js`).
- **On target / near miss / off target** verdict.
- **Coverage gap**: which quadrant of the goal mouth is uncovered given
  goalie position + orientation.
- **Passing alternatives**: for each teammate, a line from ball to teammate,
  flagged if any defender sits within the corridor.
- **Angle to goal** in degrees.
- **3D preview**: same moment shown from any angle (free once positions
  are known - reuses the existing 3D scene).

### 4.4 Data model (frame.photo)

The persistent doc keeps everything the analysis needs to be re-opened /
shared:

```
frame.photo = {
  // Calibration (already persisted today)
  landmarks: [{key, px: [x, y]}],
  intrinsics: {fx, fy, cx, cy, k1},
  camera: {position, quaternion, fov},
  reprojErrorPx,

  // Added in Phase 2/3
  ball: [x, 0, z],              // world mm from click ray
  ballCarrier: chipId,          // auto-assigned, user can override
  facingDeg: number,            // default = toward targetGoal
  players: [                    // detected + user-adjusted chips
    { id, world: [x, 0, z], team, jersey?, role? }   // role: 'goalie' when set by detect-goalie.js
  ],
  goalies: {                    // per-team chip id + auto-detect provenance
    home: chipId | null,        // user-editable via the dropdown
    away: chipId | null,
    autoDetected: {
      home: { chipId, source: 'yolo' | 'nearest', confidence: number | null } | null,
      away: { ... } | null,
    },
  },
};
```

### 4.5 Phases

| ID | Phase | Content | Status |
|----|-------|---------|--------|
| **[B-PHASE-001]** | 1 | Manual PnP calibration | **shipped, all items closed.** Guided auto-align (4.3 Step 2), rink-outline quad tool + zoom/pan (verified already working via wheel/right-drag, independent of quad mode), debug logging, one-hint-at-a-time manual fallback stepper (curated 8-point sequence per goal end, inline top-down SVG diagram, skip button), and a continuous before/after alignment slider (fades preview strips 0-100%, reprojection error demoted to a small badge) |
| **[B-PHASE-002]** | 2 | YOLO player auto-detect | **shipped.** detect-players.js (yolov8n via onnxruntime-web, ROI-scoped to the placed goal landmarks so distant players survive the 640px letterbox), back-project.js (foot pixel -> rink floor world point), team-cluster.js (jersey colour k-means). Chips get a world-space footprint ring, are clickable, and can compute an on-demand body-silhouette outline (segment-player.js, GrabCut) for the selected player. photo-cache.js (IndexedDB) auto-restores the last calibrated photo + a "Load saved overlay" button replays landmarks/pose, so re-testing doesn't require re-calibrating every reload. **Goalie auto-detect (Layer 1)** shipped as `detect-goalie.js` + a rewired "Auto-detect goalies" button: projects a world-space crease box (±2.5m wide, 3m in front + 1m behind the goal line) through the solved camera to get an image ROI per goal end, runs `detectPlayers` with a lower confidence threshold (0.15) on that ROI, keeps only candidates whose back-projected foot sits inside the same crease box, then either reuses the nearest existing chip within 1.2m (dedupes the case where Step 3 already caught the goalie) or appends a new chip flagged `role: 'goalie'`. Per-team convention: home = goal A, away = goal B (user can flip via "Flip teams" or the dropdowns). Falls back to the previous "nearest own-team chip to that goal" heuristic if Layer 1 finds nothing, and records source + confidence in `photo.goalies.autoDetected`. Follow-ups not yet done: no manual add-a-chip for missed players, no per-chip team toggle (only global "Flip teams"), no filtering beyond the rink-extent check for in-rink referees, **Layer 2 classical-CV goalie fallback** (non-red non-white blob inside the projected goal mouth, for the case where YOLO on the crease ROI still returns nothing - e.g. very heavy pad occlusion / extreme camera angle), no visual distinction for goalie chips beyond the team colour. |
| **[B-PHASE-003]** | 3 | Insights compute + UI | **shipped.** `insights.js` (pure compute: shot verdict, coverage grid, pass corridors - shared with Mode A), `goalie-proxy.js` (upright cylinder+box, the raycast target for coverage), `insights-overlay.js` (Step 4 recompute + projection to image px), photo-canvas overlay setters (`setShotLines`/`setCoverageOverlay`/`setPassLines`/`setAngleBadge`) with the layered draw order from the phase-3 plan, target-goal picker + per-team goalie dropdowns + insights readout (angle / dist / coverage % / clear passes), and `preview-3d.js` "View in 3D" toggle that drops lightweight preview chips + goalie proxies into the top-down camera without mutating `state.doc`. Deferred: shot/coverage colour tokens are still ad-hoc hex (semantic tokens listed in §3.3), no "convert this photo to a Mode-A play" bridge, no persisted derived insight numbers (recomputed on demand). |
| **[B-PHASE-004]** | 3.5 | Manual facing "nose" (Phase-4 stop-gap) | **shipped.** Draggable yellow arrow on the ball carrier + each designated goalie chip; drag back-projects to a floor point and stores an angle as `player.facingDeg`, which overrides the auto default (carrier: face nearest goal from ball; goalie: face ball if placed, else face out from own goal). `preview-3d.js`'s goalie proxy and `insights-overlay.js`'s raycast target both honour the effective facing (override or auto default) via the shared `effectiveFacingDeg()` helper exported from `photo-overlay.js` - the goalie proxy box is anisotropic (WIDTH=760, DEPTH=300), so rotating it actually changes which coverage/shot rays get blocked. A "Reset facing" button clears the override on the carrier + designated goalies in one click (disabled when nothing to reset). |
| **[B-PHASE-005]** | 4 | Auto-pose facing (MoveNet / YOLO-Pose) | **shipped.** Vendored `web/lib/models/yolov8n-pose.onnx` (13.5 MB fp32, exported via a throwaway ultralytics venv per memory item #34). New `detect-pose.js` (mirrors `detect-players.js`; decodes the [1,56,8400] output into 17 COCO keypoints per box), `matchPoseToPlayers()` (IoU>=0.3 to existing Step-3 chips, so team assignments + goalie roles survive), and `facing-from-pose.js` (back-projects both shoulders onto a horizontal plane at 1400mm and the nose at 1650mm, computes the shoulder-line perpendicular in world XZ, then picks the sign that puts the nose on the "front" side). New "Estimate facings (pose)" button in Step 3 runs one pose pass ROI-scoped to `goalAreaRoi()` and seeds `player.facingDeg` for every chip whose facing isn't already manually overridden - `facingSource: 'pose'` is stored alongside so future UI can distinguish auto-seeded from manual. Verified with synthetic keypoints against a fixture camera: facings of 0°, 180°, and 90° round-tripped exactly through the projection + back-projection + shoulder-perpendicular math. Manual override from Phase 3.5 still wins on every recompute path (`effectiveFacingDeg` returns `player.facingDeg` first, regardless of source). |
| **[B-PHASE-006]** | 5 | Video wrapper (frame picker, tracking, interpolation) | [open] not started |

---

## 5. Shared compute layer

[trajectory.js](../web/src/trajectory.js), [coverage.js](../web/src/coverage.js),
[goalie.js](../web/src/goalie.js) - fed by either mode's scheme. Insight
overlays render identically in both modes; that's the payoff of the
two-mode architecture.

---

## 6. Shared infrastructure

- `state.doc` v2 - see [doc.js](../web/src/authoring/doc.js) accessor.
- Rink constants duplication rule - see [CLAUDE.md](../CLAUDE.md).
- Camera rigs: `photoCamera`, `topDownCamera`, first-person - all in
  [scene.js](../web/src/scene.js).

---

## 7. Reference architecture

Directory-level pointers (see CLAUDE.md for the sharper gotchas):

| Path | Role |
|------|------|
| [web/src/](../web/src/) | Core viewer: scene, controls, HUD, state, selection |
| [web/src/authoring/](../web/src/authoring/) | Mode A: chips, frames, playback, export |
| [web/src/authoring/photo-overlay/](../web/src/authoring/photo-overlay/) | Mode B: calibration, landmarks, detection |
| [generators/](../generators/) | Python asset generators (units in mm) |

---

## 8. Handoff checklist for a new LLM session

1. Read this file, [CLAUDE.md](../CLAUDE.md), and
   `/memories/repo/floorball-3d-photo-overlay.md`.
2. If the user gives a work item ID (e.g. `B-BACK-004`), grep this file for
   that ID - the item's paragraph is the full spec. See §0 for the scheme.
3. Know **which mode** a change targets before writing code.
4. **Hard-refresh** Chromium after any `web/` edit (`Ctrl+Shift+R`) - stale
   ES modules have caused fake bugs multiple times.
5. Syntax-check via the `.mjs` trick (see CLAUDE.md verification section).
6. Never hand-edit generated `.obj` / `.mtl` files - edit the generator.
7. Update this file when the plan shifts; don't create parallel `handoff-*.md`.
   When adding a new backlog / bug / question item, claim the next unused ID
   in its `<mode>-<kind>` sequence and never reuse a dropped ID.
8. For Mode B calibration issues, check `window.__photoOverlayDebugLog` in
   the browser (via devtools or automation) before guessing from a
   screenshot - it has every solve's point count, per-point error, coplanar
   flag, and camera pose.

---

## 9. Deferred / not doing

- **[S-DROP-001]** [dropped] **2D tactical-board.com feature-parity clone**:
  kept as reference in
  [docs/reference/floorball-board-clone-plan.md](reference/floorball-board-clone-plan.md).
  Inspiration only - different product.
- **[S-DROP-002]** [dropped] **Backend, accounts, cloud sync**: static site
  only.
- **[B-DROP-001]** [dropped] **Auto-pose (Phase 4)** until Phase 2 is done;
  drag-to-adjust facing was the v1 approach - shipped as Phase 3.5 (manual
  "nose" on carrier + goalie chips, `player.facingDeg` override; see §4.5).
  Superseded by `B-PHASE-005`.
- **Phase 3.5 follow-ups (recorded so we don't forget)**:
  - **[B-BACK-001]** [open] Feed `player.facingDeg` into `goalie-proxy.js`
    orientation + the coverage raycast so the goalie fan tilts with stance
    (currently symmetric - the nose is purely visual today).
  - **[B-BACK-002]** [open] "Reset facing" affordance on a selected chip
    that has a manual override (clears `player.facingDeg`, reverts to auto).
  - **[B-BACK-003]** [open] Consider a facing arrow / stance indicator on
    non-carrier/non-goalie chips once Phase 4 has a confidence score to
    attach.
- **Auto-detect / calibration follow-ups still open**:
  - **[B-BACK-004]** [open] Whole-image auto-detect false positives on red
    spectator chairs and sponsor banners winning over the actual goal.
  - **[B-BACK-005]** [open] Occluded-goalie detection (kneeling white gear
    against white ice) - likely not fixable classically, needs Phase 4
    pose cues.
  - **[B-BACK-006]** [open] Auto-disambiguate L/R symmetric goal solves
    (currently manual "Flip left/right" button).
  - **[B-BACK-007]** [open] Cosmetic: chip labels sometimes overlap
    landmark labels in cluttered photos.

---

## 10. Open questions

To be resolved as the plan evolves. Not blockers for starting.

1. **[M-Q-001]** [open] **Concrete insight priorities**: which of {shot
   trajectory, on-target verdict, coverage gap, passing alternatives, angle
   to goal, others?} matter most for the first demo? User wants to explore
   this separately.
2. **[M-Q-002]** [open] **Video roadmap**: single-frame analysis first (photo
   mode over each frame the user picks), or wire up tracking + interpolation
   from the start? Impacts `B-PHASE-006` scope.
3. **[M-Q-003]** [open] **Library / project model**: local-only (IndexedDB)
   or shareable URL only? `share.js` already URL-encodes scenes; needs a
   proper landing surface.
4. **[M-Q-004]** [open] **Team assignment in Mode B**: how does the user
   tell teams apart when YOLO returns generic person boxes? Colour-cluster
   on jersey? Manual paint?
