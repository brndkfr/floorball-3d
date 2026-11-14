# Floorball Studio - Plan

What to build next and why. Read this and [CLAUDE.md](../CLAUDE.md) first.
Keep it short: the full spec of a big item lives in [items/](items/),
lasting choices in [decisions/](decisions/), shipped history in git and
[archive/](archive/).

---

## 1. Vision

A static-site tool for floorball coaches, on a shared 3D rink and a shared
compute layer (trajectory, coverage, goal geometry, doc model):

- **Mode A - Plan**: design plays. Author in 2D, play back and record in
  2D or 3D.
- **Mode B - Analyze**: align a real photo (later a video frame) to the
  rink and answer tactical questions with the same compute layer ("was
  that shot on target?", "who could he have passed to?").

Only the input source differs between the modes; insights render the same.

**Target user (confirmed 2026-10-15):** youth coaches, U14 first. They use it on a laptop or tablet to prepare, and on a
tablet or phone at the rink to show players.

**v1 means (confirmed 2026-10-15):** a coach can
(1) build a short play with passes and a shot and play it back to the
team, and (2) load a match photo, align it, and show one or two insights
that agree with what the coach saw. Everything else is post-v1.

**First-demo insights ([M-Q-001], answered 2026-10-15):**
1. Passing alternatives lead ("your pass was blocked, #7 was open").
2. Shot verdict + coverage gap second.
3. Angle and distance as small supporting numbers.

---

## 2. UX principles

- Persistent left rail: Plan / Analyze / Library.
- Each mode owns the workspace; no HUD-panel soup.
- Progressive disclosure: <= 5 controls by default, the rest under
  "Advanced".
- One primary action per step.
- Visual feedback beats numbers (a before / after slider beats
  "reprojection error 4.2 px").
- Named things: "Player 7", not `chip_7`.
- Desktop first, then tablet, then phone.

Visual direction and component library:
[decisions/002](decisions/002-broadcast-direction.md),
[decisions/001](decisions/001-web-awesome.md).

---

## 3. Priorities

Ranked. Work top to bottom; don't start "Later" items without moving them
up here first.

### Now

1. **[S-BACK-029] Audit: photo privacy (M9, M6)** The cached match photo (minors) has
   no expiry or "Forget photo" control, and previews share the
   production origin. M6 needs a hosting decision (second repo's Pages
   site or an external preview host). Until M6 is fixed, label PRs
   `preview` only when needed.
   [items/S-BACK-029](items/S-BACK-029-audit-2026-10.md).
2. **[B-BACK-011] Insight check on real photos** Check the insights
   against 5-10 real Jets photos where the true outcome is known,
   passing alternatives first (see section 4).
3. **[S-BACK-023] Type checking** In CI (see section 5).
4. **[A-BACK-038] Scene recorder** "Next move" button and frame details
   in the right panel; controls and the Variant A layout shipped ("play
   it back to the team" is half of v1).
   [items/A-BACK-038](items/A-BACK-038-scene-recorder.md).

### Next

5. **[S-BACK-024] Ball and goalies from the doc** Doc as the only
   source of truth. Before any item that adds actors (arena branding,
   figure kit).
6. **[S-BACK-029] Audit: the rest** In the order given in the item
   file: pipeline (M7, L6, L5), coverage staleness (C1), then
   robustness, frame time, hardening.
7. **[S-BACK-025] Persistence cost** Saving that scales with project
   size.
8. **[S-BACK-026] Download weight** Smaller models, textures and
   libraries.
9. Polish passing alternatives, then shot verdict + coverage (items to
   be created from the B-BACK-011 results).

### Look and motion track (added 2026-11-14)

Runs beside the list above; it is what players see when the coach
"plays it back to the team". Each item file is written as small,
ordered steps with the tests to write first. Steps tagged `[small]`
can be handed to a smaller model as they are; `[lead]` steps need a
strong model that can look at screenshots, or the user's eye.

Progress lives in each item file ("Progress" section or `[done]` on a
step). State on 2026-11-14 (branch `look-and-motion`, committed, not
merged): S-BACK-030 step 0 and A-BACK-040 steps 1 to 3 done (orbit,
pan, wheel dolly, fitted default view); next is S-BACK-030 steps 8
(figures off the discs, disc 0.7 m), 3, 1, 2 and 6, then A-BACK-040
step 4 (presets).

1. **[S-BACK-030] 3D look, steps 0-3, 6** Look-shots script, tone
   mapping, background, blob shadows, white boards. Cheap, biggest
   change to the first impression.
   [items/S-BACK-030](items/S-BACK-030-3d-look.md).
2. **[S-BACK-026] Download weight, first slice** Detailed goalie to
   GLB + WebP: about 5.5 MB off every boot (see section 5).
3. **[A-BACK-040] 3D camera navigation** Orbit camera, presets, fitted
   default view.
   [items/A-BACK-040](items/A-BACK-040-camera-navigation.md).
4. **[A-BACK-041] Player moves** Carry, pass, receive, wrist and slap
   shot. [items/A-BACK-041-043](items/A-BACK-041-043-floorball-moves.md).
5. **[S-BACK-030] 3D look, rest** Floor, figures off the game pieces,
   shadow map, arena shell.
6. **[A-BACK-042] Posable goalie**, then **[A-BACK-043] Goalie
   behaviour** (043 needs S-BACK-024 first). Same file as 041.

### Later (parked)

- **[A-BACK-028 to 030] Arena branding** Board slots, floor logo,
  board ads.
  [items/A-BACK-028-030](items/A-BACK-028-030-arena-branding.md).
- **[A-BACK-033 / 034] Player kit** Jersey, number, stick.
  [items/A-BACK-033-034](items/A-BACK-033-034-player-kit.md).
- **[A-BACK-035 to 037] Coaching features** Frame notes, drill sheet,
  templates, and the unnumbered ideas (drill notation shapes, player
  view, ...).
  [items/A-BACK-035](items/A-BACK-035-coaching-features.md).
- **[B-BACK-010] Goal auto-detect**
  [items/B-BACK-010](items/B-BACK-010-goal-detect.md).
- **[B-PHASE-006] Video analysis**, **[S-BACK-022] Slow local e2e
  runs**, **[S-BACK-027] Idle CPU**, **[S-BACK-028] Oversized
  modules**.

---

## 4. Open items

Each starts with ID, a short title and the status, then one or two
lines. An item that needs more than ~10 lines gets its own file under
[items/](items/).

### Mode A - Plan

- **[A-BACK-028] Board slots** [open] Slots on the boards (52 x 2 m)
  with toggleable labels.
  [Spec](items/A-BACK-028-030-arena-branding.md).
- **[A-BACK-029] Floor logo** [open] Floor logo + shared IndexedDB
  image store (project-level `doc.arena`). Same spec file.
- **[A-BACK-030] Board ads** [blocked-by: A-BACK-028, A-BACK-029]
  Images in the board slots. Same spec file.
- **[A-BACK-033] Jersey and number** [open] Jersey, shorts and back
  number on the 3D figures. [Spec](items/A-BACK-033-034-player-kit.md).
- **[A-BACK-034] Floorball stick** [in-progress] Figures hold it in
  both hands in a ready stance, per-player Stick L / R (2026-10-16);
  open: pose tuning, hand wrap, team colours. Same spec file.
- **[A-BACK-035] Frame notes** [open] A caption per frame, shown in
  playback and export.
  [Spec](items/A-BACK-035-coaching-features.md), which also lists the
  unnumbered coaching ideas and missing drill-notation shapes.
- **[A-BACK-036] Printable drill sheet** [blocked-by: A-BACK-035]
  One-page storyboard of numbered frames with notes. Same file.
- **[A-BACK-037] Formation templates** [open] Formation and set-piece
  templates (2-2-1, box, 5v4, 4v5, face-offs, breakouts). Same file.
- **[A-BACK-038] Scene recorder redesign** [in-progress] Controls
  (seconds, slow motion, frame menu) and the Variant A layout (docked
  time track, segments as wide as they are long, drag to set durations)
  shipped 2026-10-28; next the "Next move" button and frame details in
  the right panel.
  [Review, steps and design canvas](items/A-BACK-038-scene-recorder.md).
- **[A-BACK-040] 3D camera navigation** [in-progress] Orbit rig
  instead of the first-person walker, wheel dolly instead of FOV zoom, view presets
  (stand, behind each goal, player eye), touch gestures, follow-ball
  in playback. [Spec](items/A-BACK-040-camera-navigation.md).
- **[A-BACK-041] Player moves** [open] Real floorball moves from the
  doc's ball events: carry, pass, receive, wrist / slap shot, defend. Procedural stick
  tracks on the existing IK (no usable free motion capture exists).
  [Spec](items/A-BACK-041-043-floorball-moves.md).
- **[A-BACK-042] Posable goalie** [open] Goalie as a kneeling figure
  with generated gear and a capsule proxy for coverage; replaces both
  goalie meshes. Same file.
- **[A-BACK-043] Goalie behaviour** [blocked-by: A-BACK-042] Auto
  position on the ball line, save reactions timed from the shot.
  Also needs S-BACK-024. Same file.

### Mode B - Analyze

- **[B-BACK-010] Goal auto-detect** [in-progress] Robustness. Baseline
  0/80; 3D model fit built, off by default, eval pending.
  [Spec and notes](items/B-BACK-010-goal-detect.md).
- **[B-BACK-011] Insight check on real photos** [open] Run 5-10 real
  Jets photos with a known outcome through Analyze. Per photo record:
  what happened, what each insight says, agree / disagree, and why
  (alignment, player positions, goalie stand-in, facing, corridor width).
  Output: a short table in this item and the fixes it points to. Inputs
  under suspicion: `goalie-proxy.js` (cylinder + box), the 400 mm pass
  corridor half-width in `insights.js` (estimate), facing from pose.
  Done when the table exists and each disagreement has a cause.
- **[B-PHASE-006] Video analysis** [open] Frame picker, tracking,
  interpolation. Scope depends on M-Q-002.

### Shared / infrastructure

- **[S-BACK-022] Slow local e2e runs** [open] Slow and noisy (2.2 to
  17.5 min for the same 80 tests; headless Chromium stalls before app
  code runs; CI unaffected). Try one change at a time, three timed full
  runs each: local `trace: 'on-first-retry'`, `workers: 2`, a Defender
  exclusion for `test-results/` and `node_modules/.pnpm/`, then a
  GPU-backed launch (`--use-angle=d3d11`). Keep what measurably helps.
- **[S-BACK-029] Security and performance audit** [in-progress] Audit
  of 2026-10-07 (4 high, 9 medium, 10 low). H1-H4 and M1 shipped
  2026-10-15 (PRs #13-#15, #17, #18).
  [Findings and order](items/S-BACK-029-audit-2026-10.md). M5 is part
  of S-BACK-024, L4 of S-BACK-023.
- **[S-BACK-030] 3D look** [in-progress] The view above the boards is a
  black void, nothing casts a shadow, floor and boards are flat. Tone
  mapping, background, shadows, floor, white boards, arena shell,
  figures off their 1 m discs. Starts with a look-shots script for
  before / after pictures. [Spec](items/S-BACK-030-3d-look.md).

## 5. Architecture debt

From the code review of 2026-10-15. Ranked by how much later work they
make cheaper or safer.

- **[S-BACK-023] Type checking** [open] ~20k lines of JS with no
  `@ts-check`, `jsconfig.json` or linter. Add `checkJs` + `tsc --noEmit`
  as a CI step (JSDoc types where inference fails; start with
  `web/src/*.js` and widen). Would have caught the missing-export boot
  crash (`4bcbd41`) at commit time.
- **[S-BACK-024] Ball and goalies from the doc** [open] The doc as the
  only source of truth. `tickActors()` ([actors.js](../web/src/authoring/actors.js))
  reads ball and goalie mesh positions every frame and writes changes back
  into `doc.scheme`. Every other write path has to work around it
  (synchronous undo in `history.js`, `applyActorsFromScheme()` after
  playback stop and project switch, hand-reset `lastBall` / `lastGoalie`
  caches). It caused the undo, project-switch (A-BACK-019) and edit-frame
  (A-BACK-022) bugs. Chips already follow the right pattern (doc written
  on drag release, mesh derived). Move ball and goalies to it: gestures
  write the doc, a carried ball's position is derived from its carrier
  and never stored, meshes only render the doc. Removes the write-back
  and the caches.
- **[S-BACK-025] Persistence cost** [open] Each edit synchronously
  writes the full doc to localStorage, `structuredClone`s it into history
  and re-serialises the whole history stack (up to 100 snapshots) to
  localStorage. Cost grows with doc size x 100, and history can fill the
  ~5 MB per-site quota shared by all projects, which then makes the doc
  save itself fail. Opening the Library parses every full project to read
  names. Fix: IndexedDB (already used for photos), history as diffs or
  capped by bytes, a small project-name index, debounced saves.
- **[S-BACK-026] Download weight** [open] Measured 2026-10-15:
  - Every boot fetches `goalie_02_texture.png` (4.99 MB),
    `goalie_02.obj` (0.93 MB), `ball.obj` (0.41 MB),
    `floorball_goal.obj` (0.29 MB). Convert to GLB + meshopt with WebP or
    KTX2 textures (gltf-transform is already a dev dependency).
    **First slice** `[small]`: `generators/prepare_goalie.mjs`,
    modelled on `prepare_player_figure.mjs`: move `goalie_02.obj`,
    `.mtl` and the PNG from `web/assets/` to `generators/vendor/meshy/`
    (never deployed), read them there and write `web/assets/goalie_02.glb`
    (meshopt, texture 1024 px WebP, roughness 0.7); `goalie.js` loads
    it through `GLTFLoader` + `MeshoptDecoder`. Tests first: the GLB
    is under 600 KB (estimate) and its bounding box matches the OBJ's;
    lower `dist/assets` in `scripts/check-size.mjs`; rerun the
    coverage e2e specs (coverage raycasts this mesh). Dropped again
    when A-BACK-042 replaces the mesh.
  - Mode B: `yolov8n.onnx` 12.9 MB + `yolov8n-pose.onnx` 13.5 MB fp32;
    try fp16 / int8 and measure accuracy. `opencv.js` 13 MB full build;
    a custom build with only the used functions.
  - ONNX Runtime: the loader is duplicated in `detect-players.js` and
    `detect-pose.js`. The threaded wasm build needs COOP / COEP headers,
    which GitHub Pages does not send; check whether detection runs
    single-threaded and whether the non-threaded build is smaller.
  - Web Awesome (S-BACK-021): `index.html` loads its theme CSS and
    `src/ui/webawesome.js` (core + icon registry) on every boot, but no
    `wa-*` component is used yet. Drop both until the first component
    (likely the photo-vs-overlay `wa-comparison` slider) needs them.
- **[S-BACK-027] Idle CPU** [open] `animate()` skips the draw call
  when nothing changed (S-BACK-011) but still runs every per-frame tick,
  allocates and joins strings every frame, forever. Run the loop only
  while something is active (battery on tablets at the rink).
- **[S-BACK-028] Oversized modules** [open] `photo-overlay.js`
  (2,062 lines, 84 `getElementById` calls), `photo-canvas.js` (1,143),
  `inspector.js` (1,017). Split along the existing pure-logic extraction
  pattern when next touched, not as a standalone rewrite.

Also noted, no item yet: one mutable `state` object imported by 39
modules, ~14 untyped string events for cross-module calls, and modules
that add to the scene at import time. Revisit after S-BACK-023 makes the
coupling visible.

---

## 6. Open questions

- **[M-Q-002] Video scope** [open] Single-frame analysis per picked frame
  first, or tracking + interpolation from the start? Sets B-PHASE-006
  scope.
- **[M-Q-003] Sharing plays** [open] The Library is local (localStorage);
  share links URL-encode a doc (32 KB limit). Is a shareable landing
  surface needed, and does it affect S-BACK-025? The read-only player
  view / quiz mode and library export / import in
  [items/A-BACK-035](items/A-BACK-035-coaching-features.md) depend on
  the answer.
- **[M-Q-004] Team assignment in photos** [open] In Mode B, beyond jersey-colour
  k-means + "Flip teams": per-chip override or manual paint?
- **[A-Q-001] Figures on by default** [open] 3D figures on by default once they look right, or
  always opt-in? Buy the Teen / Regular body (SOURCE tier, $19.99)?
- **[A-Q-002] Goalie as a figure** [open] Proposed answer (2026-11-14):
  yes, with procedural poses and generated gear, see A-BACK-042.
  `coverage.js` does raycast the goalie mesh, so 042 swaps it for a
  capsule proxy first. Needs the user's go.
- **[A-Q-003] Goalie model licence** [open] `goalie_02.obj` was made with Meshy AI. If from the
  free plan it may be CC BY; check its terms and credit it in README.
  Its texture also shows a real goalie-gear brand name on the chest.
  Both go away with A-BACK-042.
- **[A-Q-005] Reference clips for moves** [open] For the moves in A-BACK-041
  to 043: can the user supply a few photos or clips per move (carry,
  pass, wrist shot, slap shot, goalie stance, a save)? Without them
  every pose number stays an estimate.
- **[A-Q-006] Goalie height** [open] Adult only, or a U14 setting? It
  changes what coverage reports (A-BACK-042).
- **[A-Q-004] Tablet authoring** [open] Coaches prepare on a laptop or
  tablet and use a tablet at the rink, but the UX principle is "desktop
  first". Should touch authoring move ahead of desktop polish?

---

## 7. Working rules for this file

- **IDs:** `<mode>-<kind>-<nnn>`. mode `A` (Plan), `B` (Analyze), `S`
  (shared / infra), `M` (meta). kind `GAP`, `BACK`, `BUG`, `PHASE`, `Q`,
  `DROP`. IDs are permanent and never reused; claim the next unused
  number in the sequence (grep this file, [items/](items/) and
  [archive/plan-2026-10.md](archive/plan-2026-10.md)).
- **Title:** every item has a short title (two to four words) inside
  the bold part, right after the ID: `**[A-BACK-040] 3D camera
  navigation** [in-progress] ...`. Use the same title wherever the
  item is listed (priorities, open items); the heading of its
  `items/` file may be longer.
- **Status:** `[open]`, `[in-progress]`, `[blocked-by: <ID>]`,
  `[mitigated]` (risk reduced, root cause remains), `[shipped]`,
  `[dropped]`. One status per item; `in-progress` and `blocked-by` don't
  combine.
- **When an item ships:** remove it from this file and delete its
  `items/` file (or move it to `archive/` if the notes are worth
  keeping). The PR description carries the "as built" detail: what
  changed, tests added, what was verified, known gaps.
- **No session-relative wording** ("this session", "today"): write
  absolute dates.
- **Estimates:** numbers without a source are marked as estimates where
  they are defined.
- **Test first:** every code step, in this file or an item file,
  follows the workflow in [CLAUDE.md](../CLAUDE.md) ("Workflow: TDD,
  always validate, never assume"): failing test first, then the code,
  then `pnpm test`, the affected e2e specs, build and size check. A
  step that cannot be unit-tested says why in its PR. This holds for
  `[small]` steps too, even where the step text does not repeat it.
- **Step tags** in item files: `[small]` = specified tightly enough
  for a smaller model (files, function names and first tests are
  given); `[lead]` = needs a strong model that can judge screenshots,
  or the user. One step = one PR. A model that finds a `[small]` step
  underspecified stops and asks instead of guessing.

### Handoff checklist for a new session

1. Read this file and [CLAUDE.md](../CLAUDE.md).
2. Given an ID, grep `docs/` for it: open items are here or in
   [items/](items/), shipped ones in
   [archive/plan-2026-10.md](archive/plan-2026-10.md) or git history.
3. Know which mode a change targets before writing code.
4. For Mode B calibration issues, read `window.__photoOverlayDebugLog`
   in the browser before guessing from a screenshot.

### Old section references

Code comments cite sections of the old plan (`docs/plan.md §4.3`,
`section 2`, `§10`). They resolve in
[archive/plan-2026-10.md](archive/plan-2026-10.md): §2 UX and design
system, §3 Mode A, §4 Mode B (4.3 target UX, 4.4 `frame.photo` data
model), §9 deferred, §10 robustness backlog, §11 questions. The design
system part of §2 also lives in
[archive/S-BACK-021](archive/S-BACK-021-broadcast-port.md).

---

## 8. Not doing

- **[S-DROP-001] 2D board clone** A tactical-board.com clone. Reference only:
  [reference/floorball-board-clone-plan.md](reference/floorball-board-clone-plan.md).
- **[S-DROP-002] Backend and accounts** No backend, accounts or cloud
  sync. Static site only.
  Exporting / importing the library as a file is fine; live sync
  between coaches is not.
- **[B-DROP-001] Auto-pose deferral** Superseded by B-PHASE-005
  (auto-pose facing shipped).
