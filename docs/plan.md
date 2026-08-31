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
- **Step 2 auto-align on load**: `detectGoal`/`detectCrease` run automatically
  when a photo drops; a "we aligned it for you" banner + Refine button skip
  the manual flow if reprojection error < 10px on >= 6 points. FOV/k1/edge
  overlay/border-mode now live behind an "Advanced" accordion.
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

### 4.2 Known problems

- **Coplanar landmark trap**: solvePnP has a depth/FOV ambiguity when all
  placed points share a Y coordinate. Auto-tune FOV then converges to
  wrong values (observed: 20° on a mid-focal shot). Mix at least two of
  {floor y=0, post-top y=1150, board-top y=500}. Warning banner is shipped.
- **Auto-detect fails on broadcast photos** where red LED ads sit behind
  the red goal. Aspect-ratio scoring helps but isn't sufficient. Manual
  clicks remain the fallback.
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
- **Rink-outline tool has no zoom/pan while dragging** - handles must be
  placed at whatever zoom level `photo-canvas.js` happens to be at, which
  makes precisely hitting small/far features (like the centre-line board
  point) hard on a full-photo view. Next step (not yet built): let the user
  zoom/pan the photo while the rink-outline quad is active, the way
  landmark clicking already supports via scroll-to-zoom.

### 4.3 Target UX (guided stepper)

Four steps, one primary action per step:

**Step 1 - Photo/Video**: drag-drop area, thumbnail. For video, pick a
frame to analyze first (per-frame in v1).

**Step 2 - Align**:
- On load, automatically run `readFocalLength35mm` + `detectGoal` + `detectCrease`.
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
| 1 | Manual PnP calibration | shipped; guided auto-align (4.3 Step 2), rink-outline quad tool, and debug logging shipped this session. Remaining: rink-outline zoom/pan (4.2), one-hint-at-a-time manual fallback (4.3 Step 2), before/after alignment slider |
| 2 | YOLO player auto-detect | not started |
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
