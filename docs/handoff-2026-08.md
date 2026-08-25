# Session handoff - August 2026

State of the world and the shortest path to picking up in a new
session. This file supersedes the "next steps" section of
`floorball-3d-authoring-plan.md` (that plan is now fully implemented).

## Shipped (A1 - A7 + follow-ups)

The authoring plan `floorball-3d-authoring-plan.md` is done. All seven
milestones plus a handful of polish tweaks landed. Commit trail on
`main`:

- `ed3e4ae` - landscape default + rotate-90-deg button + 2D fog fix
- `92f8066` - README + CLAUDE.md updated for A1..A7
- `382395e` - **A7** touch / polish: face-off snap, help overlay, onboarding, 2D pinch
- `c8fd92b` - **A6** MP4 / WebM / PNG export dialog
- `2974adc` - **A5** bezier chip paths + camera keyframes + chip-tool selects existing chip
- `5a006ea` - 1 m chip diameter + 2D drag-to-move
- `f1000f3` - explicit 2D / 3D view toggle on the dock
- `fdc5fa9` - **A4** keyframe animation + timeline + playback
- `6bc2930` - selection: active tool wins over object hit-testing
- `2b07c86` - **A3** named slots + JSON import/export + share URL
- `c1cea59` - **A2** polish (color picker etc.)
- `b2b0af4` - **A2** shape tools + top-down camera
- `76c6d4d` - **A1** player chips + dock

The live demo (https://brndkfr.github.io/floorball-3d/) redeploys on
every push to `main` via `.github/workflows/deploy-pages.yml`.

## What actually works today

**Analytical viewer** (pre-A1, unchanged): rink, ball, goalie, coverage
heatmap, trajectory / shooting-line, Swiss Way zones, layer toggles.

**Authoring** (new since A1):
- 3D perspective / 2D top-down toggle on the dock (`3D` / `2D` button).
  Both views default to a landscape orientation of the rink. The 2D
  view rotates in 90 deg steps via a dock button.
- Chip stamp with green (Team 1) / red (Team 2) discs, ~1 m across at
  rink scale. Chips snap to the nearest face-off dot within 800 mm
  (HUD toggle).
- Arrow / Zone / Text shape tools with a color palette.
- Undo / redo (Ctrl+Z / Ctrl+Y).
- Left-drag moves the selected chip in 2D; wheel zoom + right-drag pan
  in 2D.
- Save / load named schemes to localStorage, export / import JSON,
  copy share URL (deflate-raw + base64url, ~32 KB fragment limit
  before falling back to a JSON download).

**Animation** (A4, A5):
- Timeline strip at the bottom of the viewport, per-frame duration,
  duplicate / insert-before / insert-after / delete. Wheel resizes cards.
- Playback: Space toggles, `,` / `.` step, `1..9` speed, `R` loop,
  transport buttons on the timeline.
- Linear interpolation of chip position + angle, ball position, goalie
  position + angle.
- Cubic Bezier chip paths - two draggable handles per selected chip's
  outgoing segment when in 2D. Live dashed preview.
- Per-frame camera keyframes: click the marker button on any card to
  snapshot the current view; playback lerps position + slerps
  quaternion between keyframes.

**Export** (A6): MP4 (WebCodecs + `mp4-muxer` from esm.sh), WebM
(MediaRecorder), PNG. Format / resolution / fps / range dialog, live
progress bar, cancel.

**Touch / polish** (A7): pinch scales the top-down zoom in 2D; `?`
opens a shortcut cheat sheet; first-visit welcome tip dismisses to
localStorage.

## Key modules

Full tree is in the README's "Project structure" block. High-level:

- `web/src/state.js` - one shared mutable state object with a
  non-enumerable `scheme` accessor that returns
  `state.doc.frames[state.doc.currentFrame].scheme` so every A1-A3
  callsite (`doc.scheme.players[id]`, etc.) transparently reads / writes
  the active keyframe.
- `web/src/scene.js` - perspective + orthographic top-down cameras,
  `setTopDownRotationSteps` for the 90-deg rotate button, resize
  handler.
- `web/src/authoring/` - the whole authoring surface:
  `doc.js` schema + `acceptDoc()` migrator; `chips.js`, `shapes.js`,
  `draw-tool.js` primitives; `dock.js` + `timeline.js` UI; `frames.js`
  + `playback.js` animation model; `path-handles.js` bezier handles;
  `history.js` undo/redo; `share.js` share URL; `storage.js` named
  slots + JSON I/O; `faceoff-snap.js` chip snap; `export.js` +
  `export-dialog.js` video/PNG export; `topdown-camera.js` 2D camera
  enter/exit + fog save/restore; `timer-worker.js` staged heartbeat.

Gotchas live in `CLAUDE.md`. **Read it first** in any new session; the
scheme accessor, im1/im2 offset convention, H.264 codec-level trap,
`seekTo` vs `play` during export, and the fog-clearing-in-2D rule all
have bitten us and are documented there.

## Next-work menu

Pick from `docs/tactical-board-followups.md`; ranked here by
value-vs-effort.

### Quick wins (a few hours each)

- **Rink-constants extraction.** `RINK_L`, `RINK_W`, face-off dot
  positions etc. are duplicated across `generators/*.py` and
  `web/src/authoring/faceoff-snap.js`. Generate one `rink-spec.json`
  from a Python script and consume it from both the other Python
  generators and the JS runtime. Small refactor, prevents future
  drift. **CLAUDE.md flags this.**
- **Roster import.** Load a team's player names + numbers from JSON so
  chips show `Nyman #7` instead of just `7`. Add UI: overflow menu ->
  "Import roster..." reads a small `{team, players: [{name, number}]}`
  JSON, stashes it in localStorage, and `chips.js` `makeNumberSprite`
  optionally renders `name #num`.
- **tactical-board.com JSON import.** Their scheme model maps ~1:1
  to ours modulo a coord scale (they're in SVG px, we're in mm).
  One-shot converter as `authoring/tactical-board-import.js` +
  overflow menu entry. Low effort, high goodwill for anyone
  migrating.
- **Auto-lower export defaults on touch.** The follow-up doc calls
  this out. In `export-dialog.js`, pick 720p / 30 fps as default when
  `matchMedia('(pointer: coarse)').matches`. Add a warning about
  encoding heat on mobile.

### Bigger UX wins (a day or two each)

- **Frame thumbnails on the timeline.** Render each keyframe's
  top-down view into a small canvas on the card. Lazy generation on
  first render + on `framesChanged`; cache in a WeakMap keyed by
  `frame.id`. Big readability win once you have ~5+ keyframes.
- **Split-view (2D + 3D simultaneously).** Two renderer viewports,
  authoring on the left, live 3D on the right, both updating as chips
  are dragged. Doubles per-frame render cost but a big win for
  authoring feel. Prototype behind a HUD toggle first.
- **Per-element timeline tracks.** One row per chip showing its
  keyframes, like a real animation tool. Only worth it once users
  report that a single-row timeline is limiting.
- **Isometric authoring camera.** Third camera option between top-down
  and full 3D. Small addition to `topdown-camera.js`; a HUD button in
  the layers panel that swaps `topDownCamera` for an
  `OrthographicCamera` rotated 30 deg / 45 deg. Would want its own
  rotate button + zoom-friendly frustum.

### Nice-to-haves

- Voiceover / narration audio track baked into the MP4 export.
- Better GIF encoder (gifski WASM) so we can ship GIF as first-class.
- Server-side render fallback for browsers without any client
  encoder (very rare in 2026).
- Multiple balls / pucks in one scene (already supported by the data
  model, needs UI palette entries).
- Shape templates / snippets - save a curved-arrow style and reuse it.

## Verified conventions worth respecting

- Zero build step. Everything is ESM served from `web/` by
  `python -m http.server 8000`. Dependencies come from esm.sh via the
  importmap in `index.html`.
- No hand-edited geometry. Every `.obj` / `.mtl` in `web/assets/` is
  generated by a Python script in `generators/`.
- All units are mm. Rink is 40 000 x 20 000 mm.
- Rink-forward is +Z. Cameras look down -Z by default; `setCameraLook`
  adds a fixed 180 deg yaw offset. Any camera-relative math must
  account for it.
- `state.doc` uses schema v2. v1 auto-migrates via `acceptDoc()` on
  every load path (localStorage, JSON file, share URL fragment).
- Chip meshes are runtime-scaled by `CHIP_DISPLAY_SCALE = 5` in
  `chips.js`. Real player-size geometry underneath (so coverage /
  trajectory math stays honest); the scale only affects the visible
  disc + number sprite + selection ring.
- Bezier `im1` / `im2` are stored as **offsets** (`{dx, dz}` from the
  chip's frame position), so moving a chip preserves the arc shape.

## Environment notes

- OS: Windows. Terminals: PowerShell. Dev server: Python
  `http.server`. Bounce with `Stop-Process`; note that Windows locks
  files a running server has open, so stop the server before renames.
- The Playwright browser used for validation runs in an unfocused tab,
  which pauses `requestAnimationFrame` and silently breaks Web Workers.
  Validate playback / animation math by calling `seekTo(elapsed)` or
  `tickPlayback(dtMs)` directly; skip Worker-driven paths there.
- Chromium caches ES modules aggressively even after
  `location.reload()`. Every module-swap validation in a shared
  Playwright page needs this recipe (both CDP + goto):
  ```js
  const client = await page.context().newCDPSession(page);
  await client.send('Network.clearBrowserCache');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto('about:blank');
  await page.goto('http://localhost:8000/', { waitUntil: 'networkidle' });
  ```
  Otherwise you'll see `does not provide an export named 'X'` even
  though the file on disk clearly exports X.

## Handoff prompt for the next session

> The `floorball-3d` viewer / authoring tool is fully caught up with
> `docs/floorball-3d-authoring-plan.md` (A1..A7 shipped). See
> `docs/handoff-2026-08.md` for a state dump and prioritized
> next-work menu. `CLAUDE.md` documents the gotchas that have already
> cost us time (scheme accessor, im1/im2 offsets, H.264 codec-level
> trap, fog-in-2D, Chromium ESM module caching). Pick one item from
> the "Quick wins" list unless the user asks for something else.
