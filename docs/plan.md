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

1. **[S-BACK-029] M9, M6** Privacy: the cached match photo (minors) has
   no expiry or "Forget photo" control, and previews share the
   production origin. M6 needs a hosting decision (second repo's Pages
   site or an external preview host). Until M6 is fixed, label PRs
   `preview` only when needed.
   [items/S-BACK-029](items/S-BACK-029-audit-2026-10.md).
2. **[B-BACK-011]** Check the insights against 5-10 real Jets photos where
   the true outcome is known, passing alternatives first (see section 4).
3. **[S-BACK-023]** Type checking in CI (see section 5).
4. **[A-BACK-038]** Scene recorder controls, then the Variant A layout
   ("play it back to the team" is half of v1).
   [items/A-BACK-038](items/A-BACK-038-scene-recorder.md).

### Next

5. **[S-BACK-024]** Ball and goalies: doc as the only source of truth.
   Before any item that adds actors (arena branding, figure kit).
6. **[S-BACK-029]** Rest of the audit, in the order given in the item
   file: pipeline (M7, L6, L5), coverage staleness (C1), then
   robustness, frame time, hardening.
7. **[S-BACK-025]** Persistence that scales with project size.
8. **[S-BACK-026]** Download weight.
9. Polish passing alternatives, then shot verdict + coverage (items to
   be created from the B-BACK-011 results).

### Later (parked)

- A-BACK-028 to 030 arena branding,
  [items/A-BACK-028-030](items/A-BACK-028-030-arena-branding.md).
- A-BACK-033 / 034 jersey, number, stick,
  [items/A-BACK-033-034](items/A-BACK-033-034-player-kit.md).
- A-BACK-035 to 037 and the other coaching features (frame notes, drill
  sheet, templates, drill notation shapes, player view, ...),
  [items/A-BACK-035](items/A-BACK-035-coaching-features.md).
- B-BACK-010 goal auto-detect, [items/B-BACK-010](items/B-BACK-010-goal-detect.md).
- B-PHASE-006 video, S-BACK-022 local e2e noise, S-BACK-027 idle CPU,
  S-BACK-028 split oversized modules.

---

## 4. Open items

One or two lines each. An item that needs more than ~10 lines gets its
own file under [items/](items/).

### Mode A - Plan

- **[A-BACK-028]** [open] Board slots (52 x 2 m) with toggleable labels.
  [Spec](items/A-BACK-028-030-arena-branding.md).
- **[A-BACK-029]** [open] Floor logo + shared IndexedDB image store
  (project-level `doc.arena`). Same spec file.
- **[A-BACK-030]** [open] [blocked-by: A-BACK-028, A-BACK-029] Board ads.
  Same spec file.
- **[A-BACK-033]** [open] Jersey, shorts and back number on the 3D
  figures. [Spec](items/A-BACK-033-034-player-kit.md).
- **[A-BACK-034]** [in-progress] Floorball stick. Figures hold it in
  both hands in a ready stance, per-player Stick L / R (2026-10-16);
  open: pose tuning, hand wrap, team colours. Same spec file.
- **[A-BACK-035]** [open] Frame notes: a caption per frame, shown in
  playback and export.
  [Spec](items/A-BACK-035-coaching-features.md), which also lists the
  unnumbered coaching ideas and missing drill-notation shapes.
- **[A-BACK-036]** [open] [blocked-by: A-BACK-035] Printable drill
  sheet: one-page storyboard of numbered frames with notes. Same file.
- **[A-BACK-037]** [open] Formation and set-piece templates (2-2-1,
  box, 5v4, 4v5, face-offs, breakouts). Same file.
- **[A-BACK-038]** [in-progress] Scene recorder redesign: controls
  (seconds, scrubber, slow motion, frame menu, Export button), then the
  Variant A layout (full-width time track) on the Broadcast shell.
  [Review, steps and design canvas](items/A-BACK-038-scene-recorder.md).

### Mode B - Analyze

- **[B-BACK-010]** [in-progress] Goal auto-detect robustness. Baseline
  0/80; 3D model fit built, off by default, eval pending.
  [Spec and notes](items/B-BACK-010-goal-detect.md).
- **[B-BACK-011]** [open] **Insight check on real photos.** Run 5-10 real
  Jets photos with a known outcome through Analyze. Per photo record:
  what happened, what each insight says, agree / disagree, and why
  (alignment, player positions, goalie stand-in, facing, corridor width).
  Output: a short table in this item and the fixes it points to. Inputs
  under suspicion: `goalie-proxy.js` (cylinder + box), the 400 mm pass
  corridor half-width in `insights.js` (estimate), facing from pose.
  Done when the table exists and each disagreement has a cause.
- **[B-PHASE-006]** [open] Video wrapper: frame picker, tracking,
  interpolation. Scope depends on M-Q-002.

### Shared / infrastructure

- **[S-BACK-022]** [open] Local e2e runs are slow and noisy (2.2 to
  17.5 min for the same 80 tests; headless Chromium stalls before app
  code runs; CI unaffected). Try one change at a time, three timed full
  runs each: local `trace: 'on-first-retry'`, `workers: 2`, a Defender
  exclusion for `test-results/` and `node_modules/.pnpm/`, then a
  GPU-backed launch (`--use-angle=d3d11`). Keep what measurably helps.
- **[S-BACK-029]** [in-progress] Security and performance audit of
  2026-10-07 (4 high, 9 medium, 10 low). H1-H4 and M1 shipped
  2026-10-15 (PRs #13-#15, #17, #18).
  [Findings and order](items/S-BACK-029-audit-2026-10.md). M5 is part
  of S-BACK-024, L4 of S-BACK-023.

## 5. Architecture debt

From the code review of 2026-10-15. Ranked by how much later work they
make cheaper or safer.

- **[S-BACK-023]** [open] **Type checking.** ~20k lines of JS with no
  `@ts-check`, `jsconfig.json` or linter. Add `checkJs` + `tsc --noEmit`
  as a CI step (JSDoc types where inference fails; start with
  `web/src/*.js` and widen). Would have caught the missing-export boot
  crash (`4bcbd41`) at commit time.
- **[S-BACK-024]** [open] **Ball and goalies: doc as the only source of
  truth.** `tickActors()` ([actors.js](../web/src/authoring/actors.js))
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
- **[S-BACK-025]** [open] **Persistence cost.** Each edit synchronously
  writes the full doc to localStorage, `structuredClone`s it into history
  and re-serialises the whole history stack (up to 100 snapshots) to
  localStorage. Cost grows with doc size x 100, and history can fill the
  ~5 MB per-site quota shared by all projects, which then makes the doc
  save itself fail. Opening the Library parses every full project to read
  names. Fix: IndexedDB (already used for photos), history as diffs or
  capped by bytes, a small project-name index, debounced saves.
- **[S-BACK-026]** [open] **Download weight.** Measured 2026-10-15:
  - Every boot fetches `goalie_02_texture.png` (4.99 MB),
    `goalie_02.obj` (0.93 MB), `ball.obj` (0.41 MB),
    `floorball_goal.obj` (0.29 MB). Convert to GLB + meshopt with WebP or
    KTX2 textures (gltf-transform is already a dev dependency).
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
- **[S-BACK-027]** [open] **Idle CPU.** `animate()` skips the draw call
  when nothing changed (S-BACK-011) but still runs every per-frame tick,
  allocates and joins strings every frame, forever. Run the loop only
  while something is active (battery on tablets at the rink).
- **[S-BACK-028]** [open] **Oversized modules.** `photo-overlay.js`
  (2,062 lines, 84 `getElementById` calls), `photo-canvas.js` (1,143),
  `inspector.js` (1,017). Split along the existing pure-logic extraction
  pattern when next touched, not as a standalone rewrite.

Also noted, no item yet: one mutable `state` object imported by 39
modules, ~14 untyped string events for cross-module calls, and modules
that add to the scene at import time. Revisit after S-BACK-023 makes the
coupling visible.

---

## 6. Open questions

- **[M-Q-002]** [open] Video: single-frame analysis per picked frame
  first, or tracking + interpolation from the start? Sets B-PHASE-006
  scope.
- **[M-Q-003]** [open] Sharing: the Library is local (localStorage);
  share links URL-encode a doc (32 KB limit). Is a shareable landing
  surface needed, and does it affect S-BACK-025? The read-only player
  view / quiz mode and library export / import in
  [items/A-BACK-035](items/A-BACK-035-coaching-features.md) depend on
  the answer.
- **[M-Q-004]** [open] Team assignment in Mode B beyond jersey-colour
  k-means + "Flip teams": per-chip override or manual paint?
- **[A-Q-001]** [open] 3D figures on by default once they look right, or
  always opt-in? Buy the Teen / Regular body (SOURCE tier, $19.99)?
- **[A-Q-002]** [open] Goalie as a figure? Posable stance presets, but no
  save animations or gear. Check whether `coverage.js` depends on the
  current goalie mesh shape before swapping it.
- **[A-Q-003]** [open] `goalie_02.obj` was made with Meshy AI. If from the
  free plan it may be CC BY; check its terms and credit it in README.
- **[A-Q-004]** [open] Tablet authoring: coaches prepare on a laptop or
  tablet and use a tablet at the rink, but the UX principle is "desktop
  first". Should touch authoring move ahead of desktop polish?

---

## 7. Working rules for this file

- **IDs:** `<mode>-<kind>-<nnn>`. mode `A` (Plan), `B` (Analyze), `S`
  (shared / infra), `M` (meta). kind `GAP`, `BACK`, `BUG`, `PHASE`, `Q`,
  `DROP`. IDs are permanent and never reused; claim the next unused
  number in the sequence (grep this file, [items/](items/) and
  [archive/plan-2026-10.md](archive/plan-2026-10.md)).
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

- **[S-DROP-001]** 2D tactical-board.com clone. Reference only:
  [reference/floorball-board-clone-plan.md](reference/floorball-board-clone-plan.md).
- **[S-DROP-002]** Backend, accounts, cloud sync. Static site only.
  Exporting / importing the library as a file is fine; live sync
  between coaches is not.
- **[B-DROP-001]** Superseded by B-PHASE-005 (auto-pose facing shipped).
