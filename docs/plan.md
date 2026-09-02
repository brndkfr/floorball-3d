# Floorball Studio - Plan & Handoff

Single source of truth. Supersedes everything under [docs/archive/](archive/).
For historical inspiration only, see [docs/reference/](reference/).

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

- **2D-first authoring surface**. The current 2D view is a preview of 3D
  interactions, not a native 2D UX like tactical-board.com.
- **Tool palette + inline property panel** instead of the current flat dock.
- **Frame thumbnails** on the timeline.
- **Named projects in a Library** (currently one persisted doc).

### 3.3 Backlog

See [docs/reference/tactical-board-followups.md](reference/tactical-board-followups.md)
and the 2D reference plan [docs/reference/floorball-board-clone-plan.md](reference/floorball-board-clone-plan.md).
Those describe a different product (2D clone) but their feature list is a
useful checklist when building Mode A's UX.

From the design-system exploration (`web/design-sample/`), worth building
into the real app:

- **Chip-anchored popovers**: a screen-space popover attached to a chip's
  ground position (player name, ball-carrier badge, quick insight line)
  instead of a separate side panel - replaces the flat dock's per-chip
  property editing.
- **Semantic colour tokens for insight overlays**: named tokens
  (`--vector-pass`, `--vector-shot`, `--vector-coverage`, `--team-home`,
  `--team-away`) instead of ad-hoc hex in `trajectory.js`/`coverage.js`, so
  Mode A and Mode B render insights with the same palette.
- **Wireframe/contour overlay mode**: a high-contrast outline-only render
  mode for the rink/goal overlay in Mode B, for photos where a solid
  overlay is hard to see against similar-coloured backgrounds.

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
- **Coplanar landmark trap**: solvePnP has a depth/FOV ambiguity when all
  placed points share a Y coordinate. Auto-tune FOV then converges to
  wrong values (observed: 20° on a mid-focal shot). Mix at least two of
  {floor y=0, post-top y=1150, board-top y=500}. Warning banner is shipped.
- **Manual calibration UX is a dev console** - 20+ controls at once, no
  guidance. The stepper redesign in 4.3 addresses this.
- **Long-baseline point sensitivity**: board/centre-line points ~16-20m from
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
    { id, world: [x, 0, z], team, jersey? }
  ],
};
```

### 4.5 Phases

| Phase | Content | Status |
|-------|---------|--------|
| 1 | Manual PnP calibration | **shipped, all items closed.** Guided auto-align (4.3 Step 2), rink-outline quad tool + zoom/pan (verified already working via wheel/right-drag, independent of quad mode), debug logging, one-hint-at-a-time manual fallback stepper (curated 8-point sequence per goal end, inline top-down SVG diagram, skip button), and a continuous before/after alignment slider (fades preview strips 0-100%, reprojection error demoted to a small badge) |
| 2 | YOLO player auto-detect | **shipped.** detect-players.js (yolov8n via onnxruntime-web, ROI-scoped to the placed goal landmarks so distant players survive the 640px letterbox), back-project.js (foot pixel -> rink floor world point), team-cluster.js (jersey colour k-means). Chips get a world-space footprint ring, are clickable, and can compute an on-demand body-silhouette outline (segment-player.js, GrabCut) for the selected player. photo-cache.js (IndexedDB) auto-restores the last calibrated photo + a "Load saved overlay" button replays landmarks/pose, so re-testing doesn't require re-calibrating every reload. Follow-ups not yet done: no manual add-a-chip for missed players, no per-chip team toggle (only global "Flip teams"), no filtering beyond the rink-extent check for in-rink referees. |
| 3 | Insights compute + UI | not started; reuses Mode A modules |
| 4 | Auto-pose facing (MoveNet / YOLO-Pose) | deferred, Option 2 in 4.3 |
| 5 | Video wrapper (frame picker, tracking, interpolation) | not started |

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
2. Know **which mode** a change targets before writing code.
3. **Hard-refresh** Chromium after any `web/` edit (`Ctrl+Shift+R`) - stale
   ES modules have caused fake bugs multiple times.
4. Syntax-check via the `.mjs` trick (see CLAUDE.md verification section).
5. Never hand-edit generated `.obj` / `.mtl` files - edit the generator.
6. Update this file when the plan shifts; don't create parallel `handoff-*.md`.
7. For Mode B calibration issues, check `window.__photoOverlayDebugLog` in
   the browser (via devtools or automation) before guessing from a
   screenshot - it has every solve's point count, per-point error, coplanar
   flag, and camera pose.

---

## 9. Deferred / not doing

- **2D tactical-board.com feature-parity clone**: kept as reference in
  [docs/reference/floorball-board-clone-plan.md](reference/floorball-board-clone-plan.md).
  Inspiration only - different product.
- **Backend, accounts, cloud sync**: static site only.
- **Auto-pose (Phase 4)** until Phase 2 is done; drag-to-adjust facing is
  the v1 approach.

---

## 10. Open questions

To be resolved as the plan evolves. Not blockers for starting.

1. **Concrete insight priorities**: which of {shot trajectory, on-target
   verdict, coverage gap, passing alternatives, angle to goal, others?}
   matter most for the first demo? User wants to explore this separately.
2. **Video roadmap**: single-frame analysis first (photo mode over each
   frame the user picks), or wire up tracking + interpolation from the
   start? Impacts Phase 5 scope.
3. **Library / project model**: local-only (IndexedDB) or shareable URL only?
   `share.js` already URL-encodes scenes; needs a proper landing surface.
4. **Team assignment in Mode B**: how does the user tell teams apart when
   YOLO returns generic person boxes? Colour-cluster on jersey? Manual paint?
