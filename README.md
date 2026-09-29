# Floorball 3D

An interactive three.js viewer and tactical scheme editor for floorball -
an IFF-spec rink, goal and ball, a placeable goalie, tactical overlays
for reasoning about positioning, a full authoring surface for planning
and animating team schemes (**Mode A**), and a photo/video analysis
workflow that aligns a real match photo to the rink and reuses the same
tactical compute layer on it (**Mode B**).

**Live demo: https://brndkfr.github.io/floorball-3d/**

## What's in it

### Analytical viewer
- Full 40x20 m rink with board, markings and two goals, positioned per
  IFF SPCR 011 / SP-METHOD 1506 and the Rules of the Game 2026
- A 72 mm, 26-hole floorball (the match ball), placed with the Ball tool
  or handed to a player by clicking their chip (plus decorative extra
  training balls via Ball > Extra, each with its own colour tint)
- A goalie, switchable between a placeholder figure and a detailed
  textured model, freely movable and rotatable
- Ball-to-goal trajectory lines (to all 4 corners) plus a dotted
  "shooting line" to the goal's centre, colour-coded red / yellow /
  green for open, blocked-off-centre and squared-up shots
- A one-click "align goalie to shot line" button, and a matching outline
  highlight on the goalie itself
- A goal-coverage heatmap showing what fraction of the goal mouth the
  goalie blocks from the ball's current position
- Swiss Way tactical zone overlay (naher / hoher Slot, Tasche,
  Playmaker Position) and an optional numbered reference grid
- First-person walk controls (WASD / arrows, drag to look, scroll to
  zoom) with context-sensitive controls for the selected object

### Mode A - tactical planning & animation
- 2D / 3D view toggle - top-down orthographic for planning, first-person
  perspective for review. Both default to a landscape orientation of the
  rink; the top-down view rotates in 90° steps via a dock button. Wheel
  zoom + right-drag pan in 2D.
- RTS-style input model: left-click selects, left-drag moves the selected
  object(s), right-click on empty floor issues a move-command (the
  selected chip / ball / goalie eases to the click point), right-click
  cancels the active tool. Left-drag on empty floor draws a marquee
  rubber-band select (Shift-drag unions, Shift-click toggles one object).
- **Chip** stamp: drop numbered players (Team 1 / Team 2), with optional
  labels, roles and a per-row Layers panel. Chips snap to the nearest
  face-off dot within 800 mm (toggle in the HUD).
- **Ball**, **Cone** (full or flat disc) and **Arrow / Zone / Text**
  placement tools - zones support freehand, rectangle, circle and
  triangle shapes; arrows support straight/curved paths, head/shaft
  styles and semantic pass/shot/run colouring.
- Keyframe timeline at the bottom of the viewport: per-frame duration,
  duplicate / insert-before / insert-after / delete. Wheel over the strip
  resizes cards.
- Playback with linear + **cubic Bezier** chip paths - drag the two
  handles on a selected chip to shape the arc. Live dashed preview.
- **Choreograph mode**: draft the next frame by dragging chips to where
  they should end up (right-click move-commands and walk animations both
  work); ghost rings + live arrows show every planned move before you
  commit or cancel the draft frame.
- Per-frame camera keyframes: click the marker button on any card to
  snapshot the current view; playback lerps position + slerps quaternion
  between keyframes.
- Undo / redo (Ctrl+Z / Ctrl+Y) across every authoring action.
- Save / load named schemes to localStorage (with a visible save-status
  indicator and a warn-before-close guard if a save ever fails), export /
  import JSON, copy a share URL (deflate-raw compressed, ~32 KB limit
  before falling back to a JSON download).
- **Export video**: MP4 (H.264 via WebCodecs + mp4-muxer), WebM (VP9 via
  MediaRecorder), or PNG. Format / resolution / fps / range dialog, live
  progress bar, cancel.

### Mode B - photo/video analysis
- Align a real match photo to the rink via manual landmark placement, a
  draggable "fit rink outline" quadrilateral, or a guided one-hint-at-a-time
  flow with automatic goal detection (classical CV) once you zoom into the
  goal - OpenCV.js (`solvePnP` + Levenberg-Marquardt refinement) solves the
  camera pose, with a live before/after alignment slider.
- Auto-detects players (YOLOv8n via onnxruntime-web) and goalies, with
  jersey-colour team clustering and manual drag-to-correct.
- Ball placement, automatic ball-carrier assignment, and a facing
  direction per player - defaulted (carrier faces goal, goalie faces
  ball/out), refined via YOLOv8n-Pose shoulder/nose keypoints, or dragged
  by hand.
- Reuses Mode A's compute layer for insights on the photo itself: shot
  verdict (on target / near-miss / off), goal coverage heatmap, and
  clear/blocked passing lanes to every teammate - plus a "View in 3D"
  toggle that drops the detected positions into the top-down scene.

## Shortcuts

The full, current list lives in the in-app cheat sheet (press `?`) so it
can't drift from the actual key bindings - the highlights:

| | |
|---|---|
| left-click | select (empty floor = deselect, or place with the active tool) |
| left-drag chip/shape | move it under the cursor |
| left-drag empty floor | marquee-select (Shift-drag unions, Shift-click toggles one) |
| right-click floor | move-command: selected chip / ball / goalie walks there |
| right-click (tool active) | cancel the active tool |
| right-drag / middle-drag | pan the top-down camera |
| scroll / pinch | zoom |
| WASD / arrows | pan camera (2D) / walk (3D, first-person) - never moves a selection |
| Q / E | rotate the selected goalie (Shift = fine) |
| Tab / Shift+Tab | cycle selection |
| Esc | cancel active tool, then deselect on a second press |
| Del / Backspace | remove selected chip or shape |
| Space | play / pause |
| , / . | step to previous / next keyframe |
| 1..9 | playback speed |
| R | toggle loop |
| Ctrl+Z / Ctrl+Y | undo / redo |
| ? | shortcut cheat sheet |

## Running locally

```
cd web
python -m http.server 8000
```

Then open `http://localhost:8000`.

Zero build step for local dev - `three` and `mp4-muxer` are vendored at
`web/lib/three/` and `web/lib/mp4-muxer/`, resolved via `index.html`'s
importmap; the app runs offline with no third-party runtime host. The
share-URL codec uses the native `CompressionStream('deflate-raw')` API.
Mode B's OpenCV.js and the YOLO ONNX models (`web/lib/`) are vendored
locally and lazy-loaded only when Photo Overlay is opened - nothing
extra to install.

## Testing

```
pnpm install
pnpm test
pnpm test:e2e
```

`pnpm test` runs the `node --test` suite in `test/*.test.js` (pure-logic
modules - doc migration/validation, save-status tracking, share-URL
round-trip, face-off snapping, shot/coverage/pass compute - no browser
needed). `pnpm test:e2e` runs the Playwright integration suite in
`test-e2e/*.spec.js` against a headless Chromium (config in
`playwright.config.js`); its `webServer` block auto-starts
`scripts/serve-static.mjs` on port 8000 so nothing else is needed - one
command boots both. The e2e suite covers UI wiring that Node tests can't:
project rename, Library modal load/rename/duplicate/delete, legacy-key
migration on first boot, delete-current fallback. **All tests must pass
before committing.** `pnpm run build` (stages a minified `dist/` for
deploy) and `pnpm run check:size` (deploy-size budget) are what CI runs
on every push/PR; run them locally too if a change touches the build
pipeline itself.

## Regenerating assets

Every `.obj` / `.mtl` file under `web/assets/` is generated by a script
in `generators/` - there's no hand-edited geometry. To regenerate one:

```
cd generators
python generate_rink.py             # rink.obj/.mtl
python generate_goal.py             # floorball_goal.obj/.mtl
python generate_ball.py             # ball.obj/.mtl
python generate_goalie.py           # goalie.obj/.mtl (the placeholder figure)
python generate_tactical_zones.py   # tactical_zones.obj/.mtl
python generate_grid_tiles.py       # grid_tiles.obj/.mtl
python generate_player_chip.py      # player_chip.obj/.mtl (authoring tool)
```

Each writes directly into `../web/assets/`. The detailed goalie model
(`goalie_02.*`) is a user-supplied asset with no generator - it's a
static file under `web/assets/`.

## Project structure

```
docs/
  plan.md                          single source of truth: product plan,
                                    work-item backlog (stable IDs), phases
  phase-2-plan.md, phase-3-plan.md Mode B phase plans
  reference/                       old 2D-clone reference plan (inspiration only)
generators/                        Python scripts that generate every .obj/.mtl asset
scripts/
  build.mjs                        stages web/ -> dist/ for deploy (minify,
                                    SHA cache-bust) - never touches web/ itself
  check-size.mjs                   deploy size-budget gate
test/                              node --test suite - see Testing above
web/
  index.html                       page shell + HUD + dock + tool palette + timeline
  assets/                          generated (and one user-supplied) .obj/.mtl/.png files
  lib/                             vendored OpenCV.js + ONNX runtime + YOLO
                                    models for Mode B (lazy-loaded on first use)
  src/
    main.js                        module wiring + rAF loop
    state.js                       one shared mutable state object (see CLAUDE.md)
    scene.js, controls.js          perspective + top-down cameras, look/walk input
    selection.js, layers.js        hit-testing + HUD layer toggles
    insights.js                    pure compute core: shot verdict, coverage
                                    grid, pass corridors - shared by both modes
    coverage.js, trajectory.js     goal coverage heatmap + shot lines (Mode A scene)
    goalie.js                      goalie models + outline highlight
    help.js                        cheat-sheet overlay + first-visit tip
    touch-controls.js              on-screen D-pad + pinch zoom
    authoring/                     Mode A: tactical planning & animation
      doc.js, storage.js           schema v2 with frames[], migrate v1 on load,
                                    id validation on import/share-link
      dialog.js                    app-styled alert/confirm/prompt dialogs
      save-status-ui.js            save-status badge + beforeunload guard
      chips.js, balls.js, cones.js placeable object meshes + spawn / rebuild
      shapes.js, draw-tool.js      Arrow / Zone / Text primitives
      dock.js, tool-palette.js,
      layers-panel.js, timeline.js authoring surface UI
      frames.js, playback.js       frame CRUD + Bezier interp + camera lerp
      choreograph.js               draft-next-frame workflow (ghosts + arrows)
      path-handles.js              draggable Bezier handles + dashed preview
      history.js                   undo/redo stack
      share.js                     deflate-raw share URL
      faceoff-snap.js              snap-to-dot for chip placement
      export.js, export-dialog.js  MP4 / WebM / PNG export
      timer-worker.js              background heartbeat (staged for future
                                    tab-hidden recording)
      photo-overlay/               Mode B: photo/video analysis
        pnp.js                     OpenCV.js solvePnP wrapper (camera pose)
        landmarks.js, border-mode.js,
        detect.js                  manual + auto landmark placement, goal detection
        detect-players.js,
        detect-goalie.js,
        detect-pose.js             YOLOv8n player/goalie detection + pose keypoints
        team-cluster.js            jersey-colour team assignment
        facing-from-pose.js        pose keypoints -> facing angle
        insights-overlay.js,
        preview-3d.js              Step-4 insights render + "View in 3D"
```

## Sources & disclaimers

The rink, goal and ball dimensions are sourced from the IFF Material
Regulations (SPCR 011 / SP-METHOD 1506) and the Rules of the Game 2026.

Everything else is an illustrative estimate, not a sourced specification,
and is flagged as such in code comments where it matters most:

- The Swiss Way tactical zones (naher / hoher Slot, Tasche, Playmaker
  Position) are a proportional reconstruction from Swiss Unihockey's
  coaching lexicon, which defines them only in words and an unmeasured
  diagram - not an IFF spec.
- The detailed goalie model's scale is derived anthropometrically
  (180 cm standing male, kneeling butterfly stance), not measured from
  the source asset.
- The "how close counts as centred" threshold for the shooting-line
  colour / outline, the default camera / ball starting positions, and
  the 5x runtime chip display scale, are eyeballed for a reasonable
  default - not derived from any reference.
