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
question in section 11.

### Design system

Chosen stack: **Open Props** (spacing/radius/shadow/type tokens) +
**Shoelace** web components (buttons, tabs, sliders, drawers, alerts -
framework-agnostic, no build step) + **Radix Colors** (accessible 12-step
colour scales) for the palette, with a small semantic token layer on top
(`--surface-1/2/3`, `--accent`, `--team-home`/`--team-away`,
`--vector-pass`/`--vector-shot`/`--vector-coverage`).

**As of 2026-09-21, none of the three are actually in the repo.** They were
vendored locally under `web/lib/` (same pattern as `web/lib/opencv.js`)
rather than pulled from a CDN, but since nothing in `index.html`/`web/src`
ever referenced them - only the unshipped `web/design-sample/` demo did -
CodeQL flagged a bad HTML-comment regex (`js/bad-tag-filter`) inside
vendored Shoelace's own source, and since that code was 100% dead weight
already excluded from the deploy artifact (S-BACK-010), the fix was to
delete `web/lib/shoelace`, `web/lib/open-props`, `web/lib/radix-colors`,
and `web/design-sample/` outright rather than patch third-party vendored
code in place - see **S-BACK-013**. The stack choice above still stands as
the *plan*; re-vendor all three (see
`/memories/repo/design-system-vendoring.md` for the steps and a Shoelace
self-hosting gotcha hit while wiring it up the first time) when this
redesign actually starts.

### Visual direction exploration (design canvas)

A full-fidelity mockup canvas exploring the "ne plus ultra" minimalist
look lives as a Claude Design artifact:
<https://claude.ai/code/artifact/2272914e-271a-4f2b-a083-59dc8ce8e377>
(source `.dc.html` artboards are kept in the session scratchpad, not the
repo). Three directions, 8 screens each (Foundations, Plan single-select,
Plan multi-select, first-run, Analyze step 2 / step 4, Library, phone):

- **Broadcast / matchday sport** - *chosen.* Deep-ink stage, one
  electric-blue action colour (`#2E6BFF`) that never doubles as a team
  colour, domain green/red intact, IBM Plex Mono for every measurement,
  flat surfaces + hairline borders, a single 3px accent motif (active tab
  underline / panel-heading cap / selection ring). No glow, blur or
  angled corners - the deliberate break from today's tactical-HUD look.
- **Instrument** - cold technical (Linear / DAW): matte neutral greys,
  a cold mint accent used only on live elements, 1px rules, dense
  controls, no display face.
- **Chalk & Court** - warm editorial: bone paper, burnt-orange accent,
  Space Grotesk display, borderless panels, warm-charcoal dark mode.

Fixed across all three: the rink renders as a **blue surface with solid
black boards** and white markings; only the surrounding chrome changes.
This canvas is a design target to port toward, not shipped UI - the
Open Props + Shoelace + Radix stack above still stands.

---

## 3. Mode A - Tactical Planning

### 3.1 What ships today

The A1-A7 authoring stack: chips, paths, shapes, drawings, frames, playback,
export. Data model is `state.doc` v2 with a per-frame `scheme` accessor
(see [web/src/authoring/doc.js](../web/src/authoring/doc.js)).
`topdown-camera.js` provides the 2D view; `export.js` is camera-agnostic
(2D or 3D recording already free).

### 3.2 Gaps to product

- **[A-GAP-001]** [shipped] **2D-first authoring surface** (polish pass).
  Top-down mode now swaps in a flat-lighting profile (hemisphere ambient
  boosted to 2.6, both directional key/fill lights zeroed) via
  `setFlatLighting()` exported from [scene.js](../web/src/scene.js), so
  rink markings, the goal frame, ball and goalie read as diagrammatic
  flat colours instead of subtly shaded 3D surfaces - restored on exit.
  Per-tool cursor feedback on the WebGL canvas: chip stamp shows `copy`,
  the draw tools stay `crosshair`, and plain top-down select shows `grab`
  (driven by a `topdown-mode` body class toggled in `enterTopDown` /
  `exitTopDown`). `F` (in top-down only) resets zoom + pan back to the
  fitted default via the new `resetTopDownView()` helper - bound in
  [controls.js](../web/src/controls.js). Info panel updated to advertise
  the fit hotkey. Deliberately out of scope: no data-model change, no
  swap to Canvas2D/SVG rendering, no visual redesign toward the Broadcast
  direction (§2) - kept HUD look per user preference.
- **[A-GAP-002]** [shipped] **Frame thumbnails** on the timeline. Each
  card in [timeline.js](../web/src/authoring/timeline.js) now shows a
  landscape (rink long axis horizontal, 2:1) top-down snapshot of the
  frame's chips + shapes drawn from
  [frame-thumb.js](../web/src/authoring/frame-thumb.js), a plain 2D-canvas
  renderer (rink outline + centre line + team-coloured chip dots + zone
  fills + arrow polylines with a head at the last tangent). No WebGL,
  no scene mutation, no camera swap. Cached per `frame.id` with a
  size + `JSON.stringify(frame.scheme)` hash key so a re-render on frame
  selection or on any `playbackChanged` event returns the cached data URL
  and only a real content mutation (which changes the hash) triggers a
  redraw. Timeline's `render()` fires on `framesChanged` / `playbackChanged`
  / wheel-resize only (never per rAF - verified in `playback.js`, where
  the event is dispatched from discrete transport actions), so the
  stringify cost is bounded by user interaction rate.
  `test/frame-thumb.test.js` covers the DOM-less no-op path (returns `''`
  cleanly in Node), degenerate sizes, and malformed input tolerance; 4
  new tests, 51/51 green. Verified in a live Chromium tab via a CDP
  cache-clear reload - the thumb renders correctly with an empty frame
  and updates on chip placement (chips whose world-x exceeds `HALF_W`
  fall outside the drawn rink, matching the fact that the app currently
  allows off-rink chip placement; unrelated to this feature).
- **[A-GAP-003]** [shipped] **Named projects in a Library**. Each project
  is now a first-class localStorage entry
  (`floorball-3d:project:<id>`) with `doc.meta = { id, name, createdAt,
  modifiedAt }`; a small `floorball-3d:currentProjectId` pointer picks
  the one being edited. The legacy singleton `floorball-3d:doc` and the
  earlier `floorball-3d:slot:<name>` keys are migrated once by
  `migrateLegacyStorage()` (guarded by `floorball-3d:migrated:v1`) and
  then deleted - the singleton becomes "My scheme" and every named slot
  becomes its own project. Dock gets a project-name button (leftmost,
  click to rename); overflow menu swaps `Save scheme...` / `Load
  scheme...` for `Rename project...` and `Library...`. The new
  [library-dialog.js](../web/src/authoring/library-dialog.js) modal
  lists every persisted project (newest first) with load / rename /
  duplicate / delete row actions and a `New project...` header button;
  `switchToProject()` re-runs every rebuild hook and re-seeds the
  history stack so undo can't reach across projects. Import (`Import
  JSON...`) and share-URL load both go through `adoptDocAsProject()`
  which forces a fresh id + name so re-importing your own export never
  clobbers the current project. Export filename now includes the
  project name. Tests cover project CRUD, duplicate, adoption, and the
  one-shot legacy migration.

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

- **[A-BACK-001]** [shipped] **Layers panel enhancements**: right-rail
  panel with per-row eye toggles for chips + shapes, click-to-select, section
  + panel collapse persisted; **inline rename** of chip labels + shape names
  via double-click on the row's name (Enter / blur commits, Esc cancels);
  **row Delete** via a hover-visible trash button on every row and a
  **right-click row context** shortcut, both routed through `removeChip` /
  `removeShape` with a `deselectAll()` guard when the target row is the
  current selection. Also this session: fixed an info-panel / tool-palette
  overlap (`#info` shifted from `left:64` -> `left:150` so it clears the
  vertical tool palette that also anchors at `left:64`). **Drag-to-reorder
  within a section** shipped: HTML5 DnD on chip + shape rows (Team 1, Team 2,
  Zones, Arrows, Text), with a cyan insertion-line drop indicator above /
  below the target row. On drop, `reorderChips(orderedIds)` /
  `reorderShapes(orderedIds)` in `chips.js` / `shapes.js` rewrite the ids at
  the same absolute slots they currently occupy (so a within-team drag
  doesn't disturb the other team's slots, and a within-Arrows drag doesn't
  disturb Zone slots): `doc.scheme.players` keys are re-inserted in the new
  order and `doc.scheme.shapes` entries are swapped in place; shapes then
  call `rebuildShapesFromDoc()` so the three.js layer group insertion order
  (`low` / `mid` / `high`) reflects the new draw order. Both push history
  and dispatch `layers:dirty`. E2e coverage in
  [test-e2e/layers-panel.spec.js](../test-e2e/layers-panel.spec.js).
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
- **[A-BACK-005]** [shipped] **Wireframe/contour overlay mode**: a
  high-contrast outline-only render mode for the rink/goal overlay in
  Mode B, for photos where a solid overlay blends into similar-coloured
  backgrounds. New [wireframe.js](../web/src/authoring/photo-overlay/wireframe.js)
  walks the scene by `userData.wireframeSource` markers set in
  [layers.js](../web/src/layers.js) on `rinkGroup` and `goalsGroup`
  (deliberately not ball / grid / tactical zones - only the surfaces
  that camouflage into typical photos). For each tagged descendant
  `Mesh` it swaps in a bright-cyan `LineSegments` (`EdgesGeometry`,
  20° threshold) as a child, hides the underlying mesh, and records
  enough state to fully restore on disable. Collects meshes before
  mutating per CLAUDE.md's traverse gotcha. New `#photoWireframeToggle`
  checkbox in [index.html](../web/index.html) under the alignment
  slider; [photo-overlay.js](../web/src/authoring/photo-overlay/photo-overlay.js)
  applies on Enter Photo View if checked, always disables on Exit
  (so a re-entry never inherits a mixed state), and hot-toggles while
  in photo view. Not persisted per doc/frame - session-scoped display
  preference. Verified in a live browser via a CDP cache-clear reload:
  before enable = 3 meshes visible / 0 overlays; after enable = 3
  meshes hidden / 3 overlays, `isWireframeActive()` true; double-enable
  is idempotent (still 3); after disable = 3 visible / 0 overlays,
  active back to false. Not covered by a Node test - the module only
  does three.js scene mutation, no pure logic to isolate. **Caveat:**
  `LineBasicMaterial` linewidth is clamped to 1 px on every WebGL
  driver, so contours look faint from a distant establishing camera;
  in the intended Photo Overlay use (camera close to a single goal
  filling most of the frame) the goal frame reads fine. Follow-up if
  needed: swap to `Line2` / `LineMaterial` from three's addons for
  real wide lines.
- **[A-BACK-006]** [shipped] **Choreograph mode** (frame-recording UX).
  New "Choreo" button in the timeline toolbar. Clicking it duplicates the
  current frame -> creates a draft frame N+1, switches to it, snapshots
  every chip's position, and renders a semi-transparent cyan ring at each
  snapshot pos plus a live cyan line from the ring to the chip's current
  position (hidden while the chip hasn't moved yet). The user edits chips
  normally (drag, right-click move-command, walk-tween all work); a
  top-center banner offers **Commit** (dispose ghosts, keep the frame) or
  **Cancel** (dispose ghosts, delete the draft, return to N). Esc also
  cancels. Ghost + arrow updates ride the existing `animate()` loop via a
  new `tickChoreo()` exported from `authoring/index.js`. The "Choreo"
  button re-labels to "Commit" while active, driven by a
  `choreoChanged` window event so the Cancel banner button also flips it
  back. History: `duplicateFrame` and `deleteFrame` each push one entry,
  so Ctrl+Z incrementally unwinds; intermediate chip edits push their
  own entries as usual. No new data-model change - the draft frame is
  just a real frame that happens to be visualised specially. See
  [choreograph.js](../web/src/authoring/choreograph.js).
- **[A-BACK-007]** [shipped] **Marquee (box) multi-select**. Left-drag on
  empty top-down floor draws a rubber-band rect (`#marqueeRect`); every chip
  whose projected position lands inside is selected (shapes too when the
  "shapes" toggle in the Layers panel header is on - persisted to
  localStorage, **on by default** as of the mixed-drag work below; uncheck
  for pure formation authoring). Shift-drag unions with the current
  selection; Shift-click toggles one chip/shape in or out. `state.selectedSet`
  (array) holds the selection, `state.selected` stays as the primary (last
  added) for single-selection consumers. Rings are pooled one-per-object;
  path-handles / shape-handles / the chip popover suppress themselves when
  >1 is selected. Mutations made set-aware: delete (`controls.js`, one
  combined history entry via new `pushHistory=false` param on
  `removeChip`/`removeShape`), left-drag-move (whole set translates by the
  drag delta), and right-click move-command (**Option A**: formation
  translated so its centroid lands on the click point, relative offsets
  preserved). Bulk bar (`#chipBulkBar`, fixed bottom-centre) replaces the
  single-chip popover for >1 chip: "N players" + T1/T2 + Delete.
  `history.js`'s `apply()` now deselects before rebuilding so no stale ring
  survives an undo. Prereq for Choreograph mode (A-BACK-006), now unblocked.
  **Mixed-type drag (this session):** the old chip-only `chip-drag` mode is
  now a generic `obj-drag` - left-drag (or right-click move-command) on any
  selected object body translates the whole selection, chips *and* shapes
  (arrows / zones / text) together. Chips move via their Object3D position as
  before; shapes bake world coords into geometry, so during the drag they
  only get a transform offset and their doc coords (`points`, rect/triangle
  `x,z`, circle `cx,cz`, text `x,z`) are rewritten in one batch on release
  via `shapes.js`'s new `translateShapes(ids, dx, dz)` (single saveDoc, no
  own history push - the caller's `scheduleHistoryPush` makes the mixed drag
  one undo step). `translateShapes` returns `Map<id, newObj>` so the
  selection re-binds to the rebuilt objects. `buildShapeHighlight` folds in
  `obj.position` so the yellow outline tracks a live drag.
- **Move-command polish**. The RTS-style right-click currently teleports
  the chip / ball / goalie to the click point. Two cheap wins on top:
  1. **[A-BACK-008]** [shipped] *"Go here" flash marker* at the click point (a
     brief expanding ring, same idiom as the chip-drop animation in
     `chips.js`) so the gesture has a visible receipt.
  2. **[A-BACK-009]** [shipped] *Walk animation* - the right-click
     move-command now eases the chip / ball / goalie (and every chip in a
     multi-select move) from its old position to the target over 0.28 s
     (ease-out-cubic) instead of teleporting. New
     [walk-tween.js](../web/src/authoring/walk-tween.js), ticked from
     `main.js`'s `animate()`. The Doc stays authoritative: the
     move-command writes the destination into the doc + mesh immediately
     (so playback / export / serialization see the final position at
     once), and the tween only delays the *visual* arrival by driving the
     Object3D's rendered `position`. Interruptible - `startWalk` re-bases
     from the current rendered position when the same object is
     redirected. Playback-safe - `startWalk` is a no-op while
     `state.playback.playing`, and any in-flight walk is snapped to its
     end. Robust - a per-frame divergence check (rendered pos vs. what the
     tween last set) abandons the walk if a drag / keyboard move / undo
     rebuild takes over the object, `dt` is clamped to 1/30 s so a
     backgrounded-tab frame spike can't skip the whole walk, and
     `history.js`'s `apply()` calls `finishAllWalks()` before disposing
     meshes. Selection ring(s) follow via a `setWalkTickCallback`
     (`applySelectionVisuals`) so no circular import with selection.js.
- **[A-BACK-010]** [shipped] **Persistent in-scene chip labels**. The label
  sprite pipeline in [chips.js](../web/src/authoring/chips.js)
  (`refreshChipSprites` + `makeLabelSprite`) already renders
  `player.label` as a floating text sprite above the chip whenever the
  label is set - so a coach can scan a formation without clicking each
  chip. This session added the visibility toggle the plan called out:
  new `labels` checkbox in the Layers panel header
  ([index.html](../web/index.html)), persisted to
  `floorball3d.labels.visible` (default on) and wired via
  [layers-panel.js](../web/src/authoring/layers-panel.js). New
  `setLabelsVisible()` export in `chips.js` flips `state.labelsVisible`
  and re-runs `refreshChipSprites` for every chip - when off, chips with
  a label fall back to the number sprite so the chip stays readable in
  dense formations. Screen-space size follows the number sprite's
  existing pattern (world-height 110 mm), no zoom-level rework needed.
- **[A-BACK-011]** [shipped] **Arrow shape refinement**. Current arrows
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
- **[A-BACK-012]** [shipped] **Persist ball + goalie state in `frame.scheme`
  + ball carrier**. `playback.js` had a reader for `fa.balls.main.{x,z}` /
  `fa.goalie.{x,z,angle}` but nothing wrote them, so any ball / goalie
  edit was runtime-only and disappeared on reload, undo, or frame switch.
  New [actors.js](../web/src/authoring/actors.js) syncs both bodies each
  rAF (`tickActors()` in `main.js`'s animate loop, skipped during
  playback) and re-applies them from the scheme on every rebuild path
  (`frames.js`'s `afterMutation`, `history.js`'s `apply`). Ball scheme
  also carries a new `carrier: chipId | null` field: when non-null the
  ball snaps to `carrier.position + {x:0, z:250}` each tick (reads as
  "in front of the player"), and the carrier chip gets an orange ring.
  Two carrier-set gestures: **right-click a chip while the ball is
  selected** (added in `selection.js`'s `handleRightClick`, matches the
  RTS move-command idiom) and an Inspector **Carrier** dropdown listing
  every chip. Right-click on empty floor with the ball selected detaches
  the carrier first, then runs the normal move-command. Follow-ups still
  open: a small ball glyph above the chip carrying it (rather than an
  orange ring which is redundant with selection styling), a preview
  "pass arrow" during Choreograph mode when a frame changes carrier, and
  multi-ball support (data model already ready per
  [docs/reference/tactical-board-followups.md](reference/tactical-board-followups.md)).
- **[A-BACK-013]** [shipped] **Text-shape resize handles**. Standalone
  text shapes (drawn via the Text tool) used to be a fixed-`worldHeight`
  billboard with no user-facing size control. Now: `shape.size` (mm) is
  stored on the shape (default 1500, clamp 200-8000). Selecting a text
  shape in top-down draws a dotted amber rectangle hugging the visible
  letters (not the padded sprite bbox) with four amber corner handles;
  dragging a corner uniform-scales the sprite anchor-locked to the
  opposite corner. The rectangle + corners are laid out along the
  top-down camera's `(right, up)` axes rather than world XZ, so a
  rotated top-down (Q/E rotates `topDownCamera.up` between the four
  90-deg steps) still shows a rectangle aligned with the visible text.
  Inspector gets a Size slider (200-8000mm). The standard yellow
  bounding-box selection ring is suppressed for text shapes since the
  dotted rect + handles replace it. Pure math extracted to
  [text-resize-math.js](../web/src/authoring/text-resize-math.js) with 9
  node unit tests, plus 2 Playwright specs
  ([test-e2e/text-resize.spec.js](../test-e2e/text-resize.spec.js))
  covering handle spawn + Size slider round-trip.
- **[A-BACK-014]** [shipped] **Bezier / angle-lerp math extracted for
  unit-testing**. `playback.js`'s `bezierPos`, `segmentControls`,
  `lerpAngle` moved to [bezier.js](../web/src/authoring/bezier.js), a
  dependency-free module. `playback.js` still re-exports them so
  `path-handles.js` etc. keep working. The extraction surfaced a real
  bug in the old `lerpAngle`: JS's `%` keeps the dividend's sign, so
  the intended short-path wrap took the long way around for large-
  negative deltas (e.g. +170° -> -170° passed through 0° instead of
  ±180°). Fixed to `atan2(sin(d), cos(d))`. 9 new node tests cover
  Bezier endpoints, straight-line degeneracy, control-offset resolution,
  and the ±π short-path wrap. This closes part of S-BACK-009.
- **[A-BACK-015]** [shipped] **Pole cone kind (disc base + 150cm rod).**
  Third geometry under the Cone flyout in the tool palette: reuses the
  existing 40mm disc, adds a 1500mm × 50mm-diameter vertical rod on top
  for slalom-drill markers. Mesh is a `THREE.Group` for the pole case
  (disc + rod as children); new `disposeConeNode()` / `applyConeColor()`
  helpers in [cones.js](../web/src/authoring/cones.js) traverse the
  subtree so single-Mesh (disc/full) and Group (pole) cases share the
  same paths. `CONE_KINDS` gains `'pole'`, dock dispatches `cone-pole`,
  Inspector Kind dropdown offers `Pole (disc + rod)`, Layers panel row
  label is `Pole`. Commit `42af27c`.
- **[A-BACK-016]** [shipped] **Placeable extra goals + Ball-tool colour
  + real-size extras in 3D.** Three related Plan-mode toolbar additions
  in one change:
  - **Goal tool** (new [authoring/goals.js](../web/src/authoring/goals.js)):
    drops user-placed extra goals cloned from the loaded
    `assets/floorball_goal.obj`, persisted per-frame as
    `scheme.goals.extras = [{id, x, z, rotY?, label?, hidden?}]`.
    `state.extraGoals` is a separate collection from
    `state.goalInstances` so trajectory / coverage / photo-overlay code
    that hard-references the two fixed IFF goals by index is
    unaffected. `Q`/`E` rotates the selected extra goal (matches the
    goalie pattern), Inspector has a rotation slider + label + delete,
    Layers panel gains a Goals section, drag / right-click
    move-command / Del all work. New `layers:goal-loaded` event from
    [layers.js](../web/src/layers.js) resolves goals.js's template
    promise without polling.
  - **Ball-tool colour**: `spawnBall` now reads `state.drawColor`, so
    the dock's shape-color swatch doubles as the next-ball colour - no
    follow-up Inspector click needed to recolour.
  - **Real-size extras**: extra-ball geometry switched from a baked-5x
    sphere (180mm) to the real `BALL_RADIUS` (36mm);
    [topdown-camera.js](../web/src/authoring/topdown-camera.js)'s
    `applyBallTopDownScale` now scales every ball in `state.extraBalls`
    by 5x on `enterTopDown()` and back to 1 on `exitTopDown()`
    (piggy-backs on the main ball's existing hook). Fixes the "ball
    placed in 2D looks oversized in 3D" bug.

  Commit `9b4bc84`.
- **[A-BACK-017]** [shipped] **3D labels for the two fixed IFF goals A/B.**
  Follow-up to `f040894` (A-BACK-016) which shipped labels for extra
  goals only. Per-frame state at `doc.scheme.goals.fixed = { A: {...},
  B: {...} }` with the same schema as extras (`label?`,
  `labelVisible?`, `labelColor?`, `labelSize?`), plus per-side default
  text: A = 'Home', B = 'Away'. Reuses `syncGoalLabelSprite` +
  `makeTextSprite` from [authoring/goals.js](../web/src/authoring/goals.js);
  new helpers `fixedGoalLetterOf`, `fixedGoalDataFor`,
  `updateFixedGoal`, `syncFixedGoalLabels` sit alongside the extras
  API. Called from `rebuildGoalsFromDoc` (frame / project switch) and
  once on `layers:goal-loaded`. Inspector renders a fixed-goal panel
  (label input + Show / Colour / Size rows) when
  `state.goalInstances[0|1]` is the selection - no rotation slider or
  delete since fixed goals are pinned. Non-default fields are pruned
  from the doc, and an empty `fixed` object is deleted entirely so
  existing frames don't gain schema noise. Commit `dfe1c34`.

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
- **[B-BUG-001]** [mitigated] **Coplanar landmark trap**: solvePnP has a
  depth/FOV ambiguity when all placed points lie on a single plane. Auto-tune
  FOV then converges to wrong values (observed: 20° on a mid-focal shot). Mix
  at least two of {floor y=0, post-top y=1150, board-top y=500}. The
  underlying trap is a fundamental PnP constraint and can't be eliminated,
  but the detector that drives the warning banner was generalized: the old
  check only compared distinct Y values (`distinctY <= 1`), so it caught the
  "all floor" / "all board-top" cases this app's landmark set usually
  produces but would miss any other planar arrangement. New
  [pose-diagnostics.js](../web/src/authoring/photo-overlay/pose-diagnostics.js)
  `assessPlanarity()` computes the actual 3D covariance of the placed points
  and flags any set whose determinant-based spread score is ~0, regardless
  of which axis (or tilted plane) the degeneracy is in. Unit-tested in
  [test/pose-diagnostics.test.js](../test/pose-diagnostics.test.js): all-floor,
  all-board-top, an arbitrary tilted-plane set, a genuine 3D mix (not
  flagged), and the <4-points edge case.
- **[B-BUG-002]** [shipped] **Manual calibration UX is a dev console** -
  20+ controls at once, no guidance. The stepper redesign in 4.3
  addresses this. Steps 1-2 shipped previously; Steps 3-4 shipped this
  session on top of the now-complete Phases 2/3/3.5/4/5:
  - Horizontal 4-pill stepper indicator (`#photoStepper`) at the top of
    the photo panel showing Photo -> Align -> Players -> Insights.
    Pills report `pending` / `active` / `complete` state (colour-coded
    off `tokens.css`), reflect `aria-current="step"` on the active
    pill, and click-to-jump to the matching section (Steps 3/4 force-
    open their `<details>` and scroll into view).
  - Primary-CTA banners at the top of the Step 3 and Step 4
    `<details>`: a single guided-hint line + one enabled action button.
    Step 3's CTA delegates to the existing `Auto-detect players`
    button; Step 4's CTA either fires `Set ball` when players are placed
    but the ball isn't, or focuses the target-goal radio otherwise.
    Existing controls stay in place below the banner - the redesign
    guides the flow without hiding what the user already knows.
  - Pure step-computation extracted to
    [photo-step-tracker.js](../web/src/authoring/photo-overlay/photo-step-tracker.js)
    (`currentStep` / `stepStatuses` / `guidedHint` / `isPoseUsable`),
    fully unit-tested (19 node tests: photo-not-loaded / landmarks-below-
    threshold / reproj-error-too-high / usable-pose-no-players /
    players-no-ball / everything-placed / custom threshold overrides,
    plus per-status transitions and hint-text branches).
  - Auto-open logic: whenever the derived current step transitions to
    Players or Insights, that step's `<details>` opens automatically
    on the first transition into the step - a user's manual collapse
    later isn't fought.
  - E2e coverage in
    [test-e2e/photo-stepper.spec.js](../test-e2e/photo-stepper.spec.js):
    stepper renders 4 pills with Photo active on fresh load, Step 3/4
    CTA banners show the right hint + disabled CTA when preconditions
    aren't met, and pill clicks force-open the matching details block.
  - Deliberately kept: the existing scattered per-tool controls
    (feedback mode, per-player team/facing buttons, add-player mode,
    goalie selects) are still where they were - reorganising THOSE
    into "Advanced" accordions per §4.3 is a real refactor of ~300
    lines of DOM wiring in `photo-overlay.js` and out of scope for the
    stepper polish. The stepper + primary CTAs deliver the "one
    primary action per step" plan-level UX principle; the fine
    controls remain accessible via the same buttons as before.
- **[B-BUG-003]** [mitigated] **Long-baseline point sensitivity**: board/centre-line
  points ~16-20m from the goal cluster amplify small pixel-placement errors
  into large pose error far more than near-goal points do (observed this
  session: adding 3 imprecisely-dragged rink-outline points took a clean
  5.8px/6-point solve to 165px, with the camera position jumping to a
  nonsensical location). Previously neither the coplanar warning nor the
  per-point error caught this before the fact - the user had to notice and
  reason about it manually. `pose-diagnostics.js` gained
  `findLeverageOutliers()`: it flags any landmark that is BOTH a world-space
  distance outlier relative to the other placed points' centroid AND already
  carrying elevated reprojection error, which is exactly the combination
  that indicates a far point is dragging the solve off (a legitimately-far
  point with low error is left alone - being far isn't itself a problem).
  `trySolve()` in [photo-overlay.js](../web/src/authoring/photo-overlay/photo-overlay.js)
  names the offending landmark(s) in the reprojection-error line and adds an
  orange dotted-underline `.err.leverage` style + tooltip on that row in the
  landmark list, so the user knows *which* point to re-check instead of
  guessing from the aggregate error. Unit-tested in
  [test/pose-diagnostics.test.js](../test/pose-diagnostics.test.js#L47):
  far+high-error flagged, far+low-error not flagged, near+high-error not
  flagged, and the <4-points/mismatched-array no-op cases. Detection only -
  it still can't tell the user the CORRECT placement, just which click to
  re-examine.
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
      home: { chipId, source: 'yolo' | 'pose' | 'nearest', confidence: number | null } | null,
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
  - **[B-BACK-001]** [shipped] Feed `player.facingDeg` into `goalie-proxy.js`
    orientation + the coverage raycast so the goalie fan tilts with stance.
    Already wired end to end: `goalie-proxy.js` applies
    `group.rotation.y = degToRad(facingDeg)` to an anisotropic body
    (`WIDTH 760` lateral vs `DEPTH 300`), `insights-overlay.js` +
    `preview-3d.js` build the proxy with
    `effectiveFacingDeg(goalieChip, photo)` and call `updateMatrixWorld(true)`
    before handing it to `insights.shotVerdict` / `insights.coverageGrid`,
    and Mode A's `coverage.js` raycasts the real rotated detailed goalie OBJ
    (`state.goalieGroup.rotation.y`, tracked in its dirty-check as `grot`).
    Verified with a Playwright probe against a live scene goal: as the
    goalie facing sweeps 0-360 deg the blocked-coverage fraction swings
    ~25% -> ~69%, squared-up-to-the-ball blocks the most, side-on stances
    sit at the minimum (that ~44 pp gap *is* the facing effect), and the
    per-quadrant distribution shifts with the stance. Inherent limitation
    left as-is: pure geometric occlusion by a rigid proxy is ~180 deg
    symmetric (facing the shooter vs. facing away blocks the same solid
    angle) - modelling "facing away = worse save" would need a
    non-geometric awareness penalty, deliberately not added.
  - **[B-BACK-002]** [shipped] Per-chip "Clear facing" button
    (`#photoClearSelFacingBtn`, next to Delete selected player). The Step-4
    "Reset facing" button only clears the ball carrier + designated
    goalies; this clears whichever single chip is selected - `facingDeg`,
    `facingSource`, `facingCue`, `facingQuality` - reverting it to the auto
    default, then re-runs `updateStep4()` so insights + the Step-4 button
    refresh. Enabled only while the selected chip has `facingDeg != null`
    (any source: manual drag or pose seed); `handleChipSelected()` sets its
    disabled state and a manual facing drag on the selected chip flips it
    on live.
  - **[B-BACK-003]** [shipped] Facing arrow on non-carrier/non-goalie chips,
    with a confidence indicator. Turned out to be two separate things: the
    arrow itself already appeared for *every* chip once **B-PHASE-005**
    (auto-pose facing) shipped, since `effectiveFacingDeg()` resolves for
    any chip with a `facingDeg` and `renderPlayersAndBall()` was never
    actually gated to carrier/goalie - only the code comment describing it
    still was, and that's now fixed too. What this item actually needed was
    the "confidence score to attach" - `facing-from-pose.js` was already
    computing one (`quality` = the primary torso line's keypoint
    confidence, plus a `cue` naming which rule fired) and storing it as
    `player.facingQuality`/`facingCue`, but nothing read it. New
    [facing-confidence.js](../web/src/authoring/photo-overlay/facing-confidence.js)
    exports a pure `isLowConfidenceFacing(player)` (nose-only tiebreaker
    cue, or quality below 0.65) that `photo-overlay.js` now calls per chip;
    [photo-canvas.js](../web/src/authoring/photo-overlay/photo-canvas.js)
    draws that chip's facing arrow dashed and at 55% opacity instead of
    adding a second on-screen control. Manual drags and confident pose
    guesses are unaffected. 5 new node tests for the predicate; verified
    `pnpm test` 168/168, build + size-check pass, and
    `test-e2e/photo-stepper.spec.js` (closest existing coverage for this
    panel) still 4/4 - no dedicated visual check for the dashed rendering
    itself since that's canvas-only with no pure logic to isolate, same as
    the rest of `photo-canvas.js`.
- **Auto-detect / calibration follow-ups still open**:
  - **[B-BACK-004]** [shipped] Whole-image auto-detect false positives on red
    spectator chairs and sponsor banners winning over the actual goal.
    Fixed by adding a hollow-frame check to `detectGoal`'s scoring pass in
    [detect.js](../web/src/authoring/photo-overlay/detect.js). A real
    floorball goal is a red frame around an empty mouth (net / floor
    visible inside the bounding box); a row of red spectator chairs or a
    solid sponsor banner packs its whole bbox with red pixels. New helper
    `computeInteriorRedFraction(mask, bb)` samples the inner 60% of each
    candidate's bounding box on the red mask, and pure-scoring lives in
    new [detect-score.js](../web/src/authoring/photo-overlay/detect-score.js):
    `scoreGoalCandidate({ area, aspect, interiorRedFraction })` hard-rejects
    interior red fraction > 0.75 (`SOLID_RED_REJECT`) and applies a linear
    hollow bonus (x1.0 at &lt;=15% interior red, x0.5 at the reject edge)
    on top of the existing area / aspect-log scoring. Uses direct
    `mask.data` iteration on the inset window to skip the
    `@techstark/opencv-js` `new cv.Rect(x, y, w, h)` throw (see
    CLAUDE.md's photo-overlay note). 6 new node tests
    ([test/detect-score.test.js](../test/detect-score.test.js)) cover
    solid-red rejection, hollow-beats-solid ordering, aspect penalty
    still dominating, edge multiplier at the reject boundary, degenerate
    inputs, and area preference. Verified live in Chromium that the
    module loads with no page errors and the exports are wired into the
    running app; the CV path itself only runs against a loaded photo, so
    the pure tests carry the correctness weight. 228/228 unit tests +
    build + size checks green. Commit `b605c71`.
  - **[B-BACK-005]** [mitigated] Occluded-goalie detection (kneeling white
    gear against white ice). As predicted, addressed with Phase 4 pose
    cues (B-PHASE-005) rather than classically:
    [detect-goalie.js](../web/src/authoring/photo-overlay/detect-goalie.js)'s
    Layer 1 (object detector on the crease ROI) now falls back to a Layer
    1b pass - `detectPose()` on the same ROI at a relaxed threshold -
    whenever Layer 1 finds nothing at all. A kneeling/occluded goalie's
    head/torso keypoints can still register even where the plain object
    detector's box confidence never clears its own threshold. New pure
    helpers: `footPixelFromKeypoints()` (estimates the foot from ankle
    keypoints when confident, since a kneeling player's bbox-bottom is
    knee/shin height, not foot height - falls back to the existing
    bbox-bottom `footPixel()` when neither ankle is confident) and
    `pickGoalieCandidate()` (prefers any Layer 1 object-detector candidate
    over Layer 1b pose candidates, since Layer 1 is already more
    reliable when it finds something). The result's `source` field is now
    `'yolo' | 'pose' | 'nearest'` (was `'yolo' | 'nearest'`), threaded
    through `photo.goalies.autoDetected` and the Step-4 status line (data
    model in §4.4 updated to match). `isFootInCrease` and
    `projectCreaseRoi` were also exported and unit-tested for the first
    time in the process (previously untested despite being pure). 16 new
    node tests in `test/detect-goalie.test.js`. Verified: `pnpm test`
    201/201, `pnpm run build` passes, `test-e2e/photo-stepper.spec.js`
    4/4. **Not verified:** against a real occluded-goalie photo in a live
    browser (no such fixture exists in the repo, same limitation noted
    elsewhere for this panel) - the fallback's trigger condition (Layer 1
    empty) and candidate math are covered by unit tests, but whether the
    pose model actually detects keypoints on a real kneeling, heavily-
    padded goalie is unverified. Layer 2 (classical CV blob-in-mouth,
    for when pose also comes up empty) remains deferred.
  - **[B-BACK-006]** [mitigated] Auto-disambiguate L/R symmetric goal
    solves. `detectAndPlace()` in
    [photo-overlay.js](../web/src/authoring/photo-overlay/photo-overlay.js)
    already tried both L/R corner mappings and kept whichever gave the
    lower reprojection error, but a near head-on goal view is close to
    bilaterally symmetric so that comparison could be an unresolvable
    coin flip (observed: errors differing in the 6th decimal place).
    Two changes: (1) the L/R trial solve now folds in whatever's already
    placed elsewhere on the rink (other end, crease, board, face-off) in
    addition to the 4 candidate corners - a real camera is rarely
    dead-centered on the rink's mirror axis, so any other placed point
    almost always breaks the local symmetry and actually resolves cases
    that were previously a toss-up; (2) when the two trial errors are
    still statistically indistinguishable even with that extra context,
    `isAmbiguousChoice()` (new in
    [pose-diagnostics.js](../web/src/authoring/photo-overlay/pose-diagnostics.js))
    flags it, and the UI says so explicitly ("left/right could not be
    confidently resolved... use Flip left/right if mirrored") instead of
    silently locking in a guess - both in the manual Auto-detect button's
    result message and in `tryAutoAlign()`, which now withholds the
    "aligned for you" success banner when ambiguous (a clean reprojection
    error doesn't mean the pose is right if it's the mirror image).
    Manual "Flip left/right" remains the fallback for whatever's still
    ambiguous. Unit-tested in
    [test/pose-diagnostics.test.js](../test/pose-diagnostics.test.js):
    near-tied errors, exactly-equal/zero edge cases, a clearly-decided
    pair, the absolute-pixel-floor case (small errors near zero aren't
    "relatively huge"), and custom thresholds. Not verified against a
    real photo in a live browser - the ambiguity-resolution path depends
    on OpenCV's actual solvePnP output for a real image, which isn't
    practical to drive from Playwright; the decision logic itself
    (`isAmbiguousChoice`) is fully covered by unit tests.
  - **[B-BACK-007]** [shipped] Cosmetic: chip labels sometimes overlap
    landmark labels in cluttered photos. Fixed in
    [photo-canvas.js](../web/src/authoring/photo-overlay/photo-canvas.js)
    with a per-frame `placeLabelRect()` helper: every label drawn in
    `redraw()` (player chip labels, then landmark marker labels) measures
    its own bounding box and, if it would overlap a label already placed
    this frame, gets nudged straight down in fixed steps until clear (or
    after 8 attempts, whichever comes first). No data-model change, no new
    dependency - pure canvas-layout fix scoped to one render pass. Not
    unit-tested (canvas-only rendering, no pure logic to isolate, same as
    the rest of this module); `pnpm test` still 126/126 green.
  - **[B-BACK-008]** [shipped] ROI goal detect found only a small red
    blob on broadcast frames. On a real 2025x1139 frame the thin posts
    measured hue 150-160 (red chroma-bleeding into the blue floor), which
    is outside the red band (>=160), and at 1x scale the 3-4 px posts
    didn't survive the 5x5 morphology. The crossbar also washed out over
    white ads and a goalie hid part of the frame, so `minAreaRect` of
    whatever blob was left landed on the wrong corners. Fix in
    [detect.js](../web/src/authoring/photo-overlay/detect.js), ROI mode
    only: (1) the working mat is upscaled up to 4x
    (`workingScale`, max side 2048); (2) the hue band widens to 145-180
    (`redHueRanges({scoped})`, where magenta ads can't win because the
    user drew the box); (3) new
    [detect-posts.js](../web/src/authoring/photo-overlay/detect-posts.js)
    `cornersFromPosts()` fits the 4 corners from the two posts
    (HoughLinesP on the mask edges, clustered by x) and extends a partly
    hidden post to the full post's length along the full post's direction.
    If the posts aren't found, it falls back to the old rectangle.
    Whole-image detect is unchanged. Gotcha: this opencv.js build returns
    `HoughLinesP` lines as a 1xN Mat, so read the flat `data32S` rather
    than looping over `rows`. Verified on that frame: 4 different ROI
    sizes all converge to within ~5 image px on the visible corners
    (was: a 40x20 px blob). The full Draw-ROI flow in the live browser
    placed all 4 posts correctly. 15 new node tests
    (`detect-posts.test.js`, `detect-score.test.js`), with HSV samples
    taken from the real frame.
  - **[B-BACK-009]** [shipped] Goal-model frame fit for ROI detect. On a
    second real photo (close-up with an orange goalie, red spectators,
    red stand poles above both posts, and a red floor ad under the feet),
    "two longest vertical lines" (B-BACK-008) locked onto the clutter. New
    [goal-frame.js](../web/src/authoring/photo-overlay/goal-frame.js)
    `fitGoalFrame()` scores post-pair x crossbar candidates (built from
    Hough lines) against what every floorball goal shares:
    - posts are near-parallel;
    - a crossbar joins the post tops (weighted 3x, since clutter rarely
      fakes it);
    - the posts hang straight down from the crossbar;
    - there is **no front ground bar**, so each post foot is where red ends
      on the post line, with occlusion gaps bridged and floor-ad rows that
      spread outward trimmed off;
    - both posts have the same world length, so a partly hidden post is
      extended;
    - a solid bar across the upper mouth means the candidate crossbar is
      really something above the goal;
    - the interior is not solid red;
    - among plausible frames, prefer the bigger one.

    The winner is snapped onto the tube centres.
    `detect.js` uses it first, then falls back to `cornersFromPosts`, then
    to the old rectangle. Verified on that photo across 8 ROI sizes/offsets
    around the goal: 7/8 land top corners within ~20 px and bottom
    corners within ~25-50 px (a 1500x1000 image with a ~650 px tall goal).
    The miss is an ROI covering nearly the whole photo, where a stand
    railing plus the poles above the posts form a larger fake frame. 10
    node tests in `goal-frame.test.js` use synthetic masks (clean,
    perspective, clutter, occluded post, floor ad at the feet, merged
    goalie, off-axis side frame, railing above, washed-out crossbar,
    solid block). **Not re-verified** on the broadcast frame from
    B-BACK-008 (no longer in the browser cache). Re-test there before
    trusting.
  - **[B-BACK-010]** [in-progress] **Goal auto-detect robustness plan
    (steps 1-2 done, baseline recorded; resume at step 3).** Goal: ROI goal detect works across many
    different goal photos, not just the two it was tuned on. Photos vary a
    lot (broadcast wide shots, close-ups, side angles, goalies of any
    colour, red clutter in stands and floor ads, different venues), so
    every improvement has to come from **goal specifics** (what every
    floorball goal shares), never from tuning to one photo.

    **State at end of 2026-09-23.** Pipeline:
    `detect.js` `detectGoal(image, roi, {debug})` -> crop + upscale (max
    2048 px / 4x) -> scoped red hue mask (145-180) -> Canny -> HoughLinesP
    -> `goal-frame.js` `fitGoalFrame()` -> fallback `detect-posts.js`
    `cornersFromPosts()` -> fallback `minAreaRect`. Pass `{debug: {}}` to
    get every Hough line plus every candidate frame with its score or
    reject reason. That is the first thing to look at when a photo fails.
    Evaluation so far was manual: dynamic `import()` of `detect.js` inside
    `page.evaluate` in the live browser, 8 ROIs on one close-up photo,
    compared against hand-read corners. (Commits `f430e8f`, `825376c`,
    `c7eb9ed` are on `origin/main` now.) Superseded by the batch harness
    in step 2.

    **Lesson from B-BACK-009:** three plausible heuristics (crossbar
    overhang penalty, strict edge-continuity foot walk, robust re-fit)
    each made results *worse* on real photos and were reverted. So no
    heuristic gets kept without a before/after number from the harness in
    step 2.

    **Steps:**
    1. **Fixture set.** Collect 8-12 varied goal photos under
       `test/fixtures/goals/`. Add the folder to `.gitignore` if the
       photos can't be shared publicly. Add one `truth.json` holding, per
       photo, the 4 hand-labelled mouth corners (TL, TR, BR, BL, in image
       px, on the tube centre line) and 3-5 ROIs (tight, loose, offset
       left/right, nearly whole image). Coverage checklist:
       - the broadcast frame from B-BACK-008;
       - the close-up with clutter from B-BACK-009;
       - side angle around 45 deg;
       - near head-on;
       - a goalie hiding most of one post;
       - a crossbar in front of white ads;
       - low light or motion blur;
       - a different floor colour;
       - red seats or red stand poles above the goal;
       - a goal seen from behind or at an extreme angle (expected fail,
         must not crash).
    2. **Batch eval harness.** A local-only script
       (`scripts/eval-goal-detect.mjs`, driving Playwright against
       `serve-static.mjs`) loads each fixture and runs `detectGoal` per
       ROI with `debug`. It prints a table of per-corner error normalised
       by the true goal height, plus a pass rate (pass = all 4 corners
       within 3% of goal height). For every failure it writes the debug
       candidate list to `test-results/goal-eval/`. It is not a CI gate
       (fixtures may be git-ignored). Record the baseline numbers in this
       item before changing any detection code.

       **Done (2026-09-23).** Steps 1 + 2 shipped:
       - Fixtures: 16 YouTube broadcast screenshots in
         `test/fixtures/goals/` (git-ignored, not shareable). They cover
         the checklist except the B-BACK-008 / B-BACK-009 originals, which
         are gone. Extras: grey floor (goal seen from behind), green floor
         with a dark maroon frame, and a near edge-on goal. Six still carry
         the red YouTube progress bar; in two it crosses the goal bottom.
       - Labels: `truth.json` in the same folder, written by
         `pnpm label:goals` (`scripts/label-goals.mjs`, local page on
         :8010: click TL/TR/BR/BL, wheel/pinch zoom, autosave; drafts show
         `?` until confirmed with Enter). All 16 hand-confirmed. On goals
         seen from behind, the labeller picked the **outer** frame as the
         mouth in WFC 01, Hardau and Backhand 02.
       - Harness: `pnpm eval:goals` (`scripts/eval-goal-detect.mjs`,
         options `--only <substr>`, `--roi <name>`, `--truth <file>`).
         The ROIs are generated from the labels by
         `scripts/goal-eval-lib.mjs` `roiVariants()`: tight (+10%), loose
         (+75%), left/right (goal against one edge), whole (image minus 2%,
         never cutting the goal). Error = best-matching corner order, as a
         fraction of the mean post length; `orderOk` flags a reversed
         order. Output goes to `test-results/goal-eval/` (summary.md/json,
         an overlay JPEG per case, debug JSON per failure). `pnpm test:e2e`
         wipes that folder. `detectGoal`'s debug now also reports `source`
         (frame / posts / contour) and `map` (`{scale, offsetX, offsetY}`)
         to convert debug coords back to image px.

       **Baseline (2026-09-23, commit that added the harness, 16 photos x
       5 ROIs = 80 cases):**
       ```
       pass (<= 3%): 0/80   <= 10%: 13   <= 25%: 15   miss: 7   crash: 0
       per ROI: tight 0/16, loose 0/16, left 0/16, right 0/16, whole 0/16
       corner order reversed in 12 detections
       ```
       Failure groups, read from the table and overlays:
       - **Small / washed-out goals (55-97 px tall): total failure.**
         SUI-FIN 01, 02, 04, Backhand 01, WFC 02 are over 100% or missed on
         every ROI. On blue floors the frame renders pinkish-magenta and
         apparently drops out of the red mask, so the contour fallback
         grabs a red jersey instead. **Largest group, check this first:**
         corner refinement can't fix a goal that is never masked.
       - **Wrong frame or bottom too low (20-90%).** WFC 01 + 03, Hardau,
         Backhand 02, Penalties 01 + 05. The bottom edge follows the
         floor-level back bar, or front and back frame parts get mixed
         (= known failure 3a).
       - **Whole-image ROI** is much worse than tighter ROIs on every
         small goal (= known failure 3b).
       - **Near misses:** SUI-FIN 03 (3.8-4.0%), Penalties 02 (4.0-4.7%),
         Penalties 04 (6.3-7.5%). They look right in the overlay; one
         corner is off by a few px. On a 67 px goal, 3% is 2 px, about
         the label's own click precision, so also track <= 5% / <= 10%
         alongside the 3% headline.
    3. **Known failures, attack in this order** (each fix gets a synthetic
       mask unit test in `goal-frame.test.js` first, then a harness
       re-run). **Reordered after the baseline:** 3.0 and 3.1 come first.
       The old a/b become symptoms that the 3D model fit (3.1) should
       resolve without separate heuristics. Keep them only as a fallback
       if 3.1 doesn't pay off.

       3.0 **Red mask on small / washed-out goals** (baseline group 1).
          Measure the goal pixels' real HSV values on the 5 photos (mask
          coverage along the labelled frame vs. the scoped 145-180 hue
          band and `RED_MIN_SAT` / `RED_MIN_VAL`) before touching any
          threshold. If the frame falls out of the band, widen or adapt the
          band (e.g. relative to the local floor colour) and re-run the
          harness. A model fit can't align to pixels that never reach the
          mask.

          **Result (2026-09-23): don't tune the thresholds.** The labelled
          frame pixels were sampled (reddest pixel across the tube, every
          px along crossbar + posts):
          - Goals 118-416 px tall: 73-94% of frame samples pass the mask
            (hue 165-176).
          - Goals 55-97 px tall: **0-23% pass**. The frame is violet (hue
            128-131; Backhand 01: 102 = floor blue). Cause: the tube is
            only 2-3 px wide, and video chroma subsampling blends its red
            into the blue floor. There is hardly any red left to find.
          - Hardau: the dark maroon frame in dim light fails on value
            (70% of samples have V < 70).
          - R-G contrast vs. the floor a few tube widths away is positive
            on every photo, but thin on small goals (median 8-44, p10
            around 0-10). No per-pixel threshold separates it from floor
            edges, jerseys and floor lines.
          So the fix is to **integrate weak evidence along a known shape**:
          3.1 scores a continuous "redder than local background" map along
          the whole projected 3D frame, not a binary mask.
       3.1 **3D goal model fit.** Use the real goal geometry from
          [generate_goal.py](../generators/generate_goal.py) (IFF spec:
          mouth 1600 x 1150, upper depth 400, lower depth 650, 100 mm
          corner radius, back bars) as the reference. Project its tube
          centrelines with a camera pose and adjust the pose (6DoF + focal)
          until the projected tubes sit on the red-mask edges (e.g. a
          distance transform of the mask edges). Start from the existing
          pipeline's best candidate (or the user ROI).
          - **Resolves:** front vs back frame confusion (goals seen from
            behind), hidden posts (implied by the rest of the frame),
            quads a real goal can't produce (aspect + perspective built
            in), and it yields the camera pose Mode B needs anyway.
          - **Doesn't resolve:** goals that never reach the mask (3.0),
            although scoring evidence along projected tubes can accept
            weaker cues than a hard red/not-red mask. Also local minima
            (needs a decent start), and focal vs distance ambiguity on
            tiny goals (constrain FOV or camera height).
          - Unit-test on synthetic masks rendered from a known pose
            (round-trip the pose), then keep it only if `pnpm eval:goals`
            improves.
          - **Status: implemented, opt-in, real-photo eval pending.**
            [goal-model-fit.js](../web/src/authoring/photo-overlay/goal-model-fit.js),
            tests in [goal-model-fit.test.js](../test/goal-model-fit.test.js)
            (synthetic front view with clutter, goal seen from behind
            started on its back frame, small washed-out violet goal: all
            under 2% corner error). `detectGoal(img, roi, { modelFit: true })`
            fits from the frame/posts quad, the contour quad and the inset
            ROI; `pnpm eval:goals -- --model-fit` compares against the
            baseline. Off by default until the eval shows it helps.
            Lessons from getting the synthetic cases green:
            - Evidence is R-G minus its local mean (not the HSV mask),
              judged on a 1 px blur; each segment counts by projected
              length.
            - The back frame is itself a planar 1600 x 1177 mm rectangle:
              a start quad that is really the back frame is converted to
              the mouth it implies (exact pose), not shifted by a guess.
            - Do NOT optimise over the 4 corner coordinates: the focal
              length they imply swings from 1400 to 170 with 1-2 px of
              corner noise, trapping the fit at "mouth right, 3D wrong".
              The fit uses [u, v, log(f/Z), rotation vector, log f]
              instead, so f only changes perspective strength.

       a. **Bottom corners 25-50 px too low.** The foot walk runs past the
          real post end into floor ads or shadow. Candidate fixes, all
          goal-specific:
          - clamp post length from the crossbar width and the known
            mouth aspect (W 1600 x H 1150 mm, see
            [generate_goal.py](../generators/generate_goal.py)), allowing
            for perspective via the two post directions;
          - stop the foot where the post line meets the floor or net
            bottom edge.
       b. **ROI covering nearly the whole photo** picks a fake frame (a
          stand railing plus the poles above the posts). Candidate fixes:
          - an aspect prior (160:115 within perspective limits);
          - require net texture (white or grey mesh) inside the mouth;
          - two-pass: take the best candidate, re-run inside a tight ROI
            around it, and keep the result only if it is stable.
       c. **Broadcast frame regression check** (B-BACK-008 photo) - must
          still pass after a and b.
    4. **Goal specifics not used yet** (ideas pool for step 3):
       - the net inside the mouth;
       - the fixed mouth aspect;
       - the side frame and back frame going away from the camera
         (gives depth direction, which helps L/R and head-on
         disambiguation);
       - the crossbar is a single straight tube, so a crossbar line that
         runs far past both posts is probably a railing. Only retry this
         with harness numbers, since it was reverted once.
    5. **Stretch:** run `fitGoalFrame` on whole-image detect too, which
       would give an auto ROI with no user box.

    **Done when:** harness pass rate is at least 90% on the fixture set,
    no regression on the two known photos, every new constraint has a
    synthetic-mask unit test, and `pnpm test`, `pnpm test:e2e`,
    `pnpm run build` and `pnpm run check:size` are all green. No new e2e
    spec is needed unless the UI changes (this is pure logic).

---

## 10. Robustness / infra backlog (external review, 2026-09)

From a code review session against the public repo clone (not this
session's own analysis - flagged `(inferred)` where the reviewer read code
but never ran the app in a browser). Nothing in this section has been
applied yet except **S-BACK-004**, fixed the same session this section was
added.

- **[S-BACK-001]** [shipped] **Silent data loss on quota errors - save
  status + beforeunload guard.** `saveDoc()` (authoring/storage.js) used to
  swallow localStorage quota errors with `console.warn` only - no UI
  signal, so the user kept working while nothing persisted and a reload
  silently lost everything. Fixed: `storage.js` now tracks save status
  (`getSaveStatus()`/`onSaveStatusChange()`, pure/DOM-free so it stays
  Node-testable) and the new `save-status-ui.js` renders it as a
  `#saveStatus` badge ("saved HH:MM:SS" / "save failed - storage full or
  unavailable, export a backup") plus a `beforeunload` guard that only
  fires while the last save attempt is failed. Covered by
  `test/storage.test.js` (4 cases: success, quota-error, recovery,
  listener notification). Not verified in a browser - the badge's visual
  placement/timing needs a live check. **Remaining, not done:** see
  **[S-BACK-012]**.
- **[S-BACK-012]** [shipped] **Undo history not persisted, photo-overlay
  work not undoable.** `history.js`'s undo stack (MAX=100) used to be
  memory-only and lost on reload, including after an accidental "New
  scheme". Photo-overlay landmark placement/solve steps still aren't pushed
  to the undo stack at all. **Persistence half shipped this session:**
  - The stack's push/undo/redo/cursor bookkeeping was extracted to
    [history-stack.js](../web/src/authoring/history-stack.js) - a
    dependency-free module operating on a plain `{stack, cursor, max}`
    record, so it's unit-testable without pulling in `chips.js`/`shapes.js`/
    `scene.js` (closes part of **S-BACK-009**: `createHistoryStack`,
    `pushSnapshot`, `stepUndo`/`stepRedo`, `resetHistoryStack`,
    `canUndo`/`canRedo`, and a `serializeHistoryStack`/`hydrateHistoryStack`
    round-trip pair; 10 new node tests cover push/evict/cursor invariants
    and reject malformed persisted data instead of throwing).
    [history.js](../web/src/authoring/history.js) is now a thin wrapper:
    same public API (`pushHistory`/`undo`/`redo`/`initHistory`), same
    scene-rebuild side effects in `apply()`, delegating stack bookkeeping
    to `history-stack.js`.
  - `storage.js` gained `saveHistoryState`/`loadHistoryState`/
    `deleteHistoryState`, one `floorball-3d:history:<projectId>` key per
    project (kept separate from the project doc itself so a corrupt/
    oversized history blob can never block the doc load path). Failures
    are swallowed - unlike a doc-save failure, a history-persist failure
    degrades to memory-only for the session rather than needing the
    visible save-status badge. `deleteProject()` now also clears that
    project's history key. 3 new node tests in `test/storage.test.js`
    (round-trip, missing-key, quota-error, delete-cascade).
  - `history.js`'s `pushHistory`/`undo`/`redo` persist after every stack
    mutation; `initHistory()` (called on boot and on every
    `switchToProject()`) tries to rehydrate this project's saved stack
    first and only falls back to seeding a fresh one-entry stack from the
    current doc if nothing valid is stored - so undo survives a reload and
    still can't reach across projects.
  - Verified: `pnpm test` 138/138, `pnpm run build` + `check:size` pass,
    and the full Playwright suite (`test-e2e/library.spec.js` in
    particular, which drives `switchToProject`) - the first full-suite run
    after this change showed several unrelated failures that turned out to
    be caused by **stray leftover `python -m http.server` processes**
    squatting on port 8000 from an old session (not this repo's
    `serve-static.mjs`), which `reuseExistingServer` was silently reusing;
    killing those and rerunning gave every affected spec a clean pass in
    isolation, and only pre-existing multi-worker contention flakiness
    (also present with unrelated specs, not caused by this change)
    remained when running the whole suite at once.
  - **Photo-overlay wiring (this session), closing the item:**
    [photo-history.js](../web/src/authoring/photo-overlay/photo-history.js)
    is a new dependency-free module exporting `isHistoryCommitAction(action)`
    - a single named list of which photo-overlay actions are discrete edits
    worth an undo entry (landmark place/move/delete/flip, auto-detect goal,
    auto-tune FOV, player add/auto-detect/move/flip-teams/team-override/
    delete, ball place/move, facing drag/pose-estimate/reset/clear-one,
    feedback-clear, goalie assign/auto-detect, target-goal select) versus
    continuous input or a view transition that happens to reuse the same
    `saveDoc()`/`trySolve()` choke point (FOV/k1 slider drag - re-solves on
    every `input` tick; entering Photo View; restoring a saved overlay) -
    pushing on those would spam the stack instead of giving one undo step
    per user action. `photo-overlay.js`'s `trySolve()` now takes an optional
    `historyAction` param (`null` by default = no push) so each call site
    states its own granularity explicitly, and a small `commitPhotoAction()`
    wrapper (checked against the same list) covers the non-solve edits
    (player/ball/facing/goalie mutations). 3 new node tests in
    `test/photo-history.test.js` cover every named commit action, the
    explicitly-excluded continuous/view actions, and malformed input.
    Verified: `pnpm test` 185/185, `pnpm run build` passes, and the full
    Playwright suite is unaffected (one `library.spec.js` failure on a
    5-worker run was the same pre-existing multi-worker contention
    flakiness noted above, not a regression - passes 4/4 in isolation).
    **Not attempted:** making undo/redo visually repaint the photo canvas
    (re-sync landmark markers, pose, player/ball chips) after a photo-overlay
    undo - `history.js`'s `apply()` only rebuilds chips/shapes/cones/balls/
    actors today, so undoing past a photo-overlay edit updates
    `frame.photo` correctly but the live canvas won't reflect it until the
    panel is otherwise refreshed. That's a separate, DOM-heavy change (no
    fixture photo exists in the repo to drive it through Playwright either)
    and out of scope for wiring the data-model side of undo.
- **[S-BACK-002]** [shipped] **Unvalidated ids reach innerHTML.** Fixed at
  the ingestion boundary: new `isValidId()` (`[\w-]+`) + `sanitizeDoc()`
  in [doc.js](../web/src/authoring/doc.js) run from `acceptDoc()`, so every
  untrusted entry point (share-link decode via `share.js`, JSON import via
  `dock.js`, storage load) drops malformed ids from `scheme.players` keys,
  `scheme.shapes[].id`, and `frame.photo.players[].id`, and clears any
  `ballCarrier` / `goalies.{home,away}` references left dangling by the
  drop. As a second, independent line of defense, the specific render path
  the review called out (`goalieOptionsHtml`, photo-overlay.js) was
  converted to build a `DocumentFragment` of `<option>` nodes with
  `textContent` rather than an HTML template string, so a crafted id can't
  become script even if a future doc bypasses `acceptDoc()`. Covered by 4
  new tests in `test/doc.test.js` (malformed player-key drop, malformed
  shape-id drop, `frame.photo.players` drop + dangling-reference cleanup,
  valid-data pass-through) alongside the `isValidId` unit tests; 47/47
  green.
- **[S-BACK-003]** [shipped] **Keyboard handling is scattered - re-scoped
  after inspection.** Two of the review's specific claims didn't hold up:
  only 4 of the "nine" keydown registrations are actually `window`-level
  (dock.js, controls.js, timeline.js, help.js) - the other five
  (chip-popover.js, inspector.js x2, draw-tool.js) are element-scoped
  listeners on the input/li itself and already call `stopPropagation()`
  where it matters (draw-tool.js even has a comment explaining why, for
  Escape specifically). And the Escape "ambiguity" between controls.js and
  dock.js is intentional, working, and already documented: controls.js's
  handler checks `state.activeTool` and only deselects if dock.js's Esc
  (which cancels the active tool) had nothing to do - a real two-stage
  Escape, not a race. The one actual bug in this area was dock.js's
  missing INPUT/TEXTAREA guard, already fixed as **[S-BACK-004]**; all 4
  `window`-level handlers now have it. What was still genuinely true: no
  single place documented the full keybinding set (the help overlay was
  hand-maintained separately from the 4 handlers and had already drifted -
  controls.js's `F` reset-top-down-view and dock.js's Ctrl+Shift+Z alt-redo
  were both real, working shortcuts missing from the overlay). Fixed this
  session with a documentation-only consolidation, deliberately **not**
  merging the 4 handlers themselves (still the regression risk called out
  below): new [keymap.js](../web/src/keymap.js) exports `KEY_SECTIONS`, a
  plain data array of `{title, entries, note}` describing every shortcut
  shown in the help overlay; [help.js](../web/src/help.js) now builds its
  shortcut grid from that data via `renderShortcutGrid()` instead of a
  hand-written HTML block, and picked up the two missing entries in the
  process. The 4 keydown handlers are untouched - this only changes what
  help.js *displays*, so the drift risk shrinks to "one file to update"
  rather than being eliminated (a new shortcut added to a handler still
  needs a manual `keymap.js` entry to show up in the overlay). Verified via
  `pnpm test` (126/126) and the `test-e2e/a11y.spec.js` help-overlay spec
  (still passes - it checks dialog role/focus-trap structure, not exact
  shortcut text).
- **[S-BACK-004]** [shipped] **`dock.js` keydown missing INPUT/TEXTAREA
  guard.** Unlike controls.js/timeline.js/help.js, dock.js's handler had no
  check for a focused text field - typing in a chip label and hitting
  Escape cancelled the active tool, Ctrl+Z undid a scene change, instead of
  editing the text. Fixed: same guard as controls.js
  (`document.activeElement?.tagName` check) added at the top of dock.js's
  handler.
- **[S-BACK-005]** [shipped] **Accessibility gaps.** The blanket claim
  of "no `<label for>` on any input" didn't hold up under inspection: of
  the 25 inputs in `web/index.html`, 23 were already implicitly labelled
  (wrapped in `<label>...<input>...</label>`, which the accessible-name
  algorithm handles the same as an explicit `for`). Found and fixed the
  actual two gaps: `photoFileInput` (no label at all - added
  `aria-label="Upload photo to analyze"`) and `photoAlignSlider` (a
  `<label>` existed nearby but wasn't associated - added `for=
  "photoAlignSlider"`). **This session closes the three remaining pieces:**
  - Icon-only button `aria-label` audit: added explicit `aria-label`s
    to every button whose only content is a unicode glyph and whose
    surrounding `title` isn't announced by every screen reader -
    timeline transport (`data-tl="prev|play|stop|next|speed|loop|add"`),
    the layers/info/coords/photoPanel collapse toggles
    (`.lp-toggle`, `.hud-toggle`), and the dock's `rotate` / `color` /
    `overflow` buttons. Buttons that already carry a visible text label
    alongside their glyph (Chip, Ball, Arrow, Curved, Zone, Text, Cone,
    T1/T2, 3D) were left alone - a redundant `aria-label` would fight
    the accname algorithm's "text content" pass. Covered by an e2e
    spec that walks every visible top-level `<button>` and fails if
    the accessible name (aria-label OR visible text OR title) is empty.
  - Focus trap + `role="dialog"` + `aria-modal="true"` on the hand-rolled
    `help.js` overlay and `export-dialog.js`. Trap lives in a new
    `web/src/focus-trap.js` with a pure `nextTrappedIndex()` helper (7
    node tests: no-op empty trap, wrap end<->start on Tab/Shift+Tab,
    hand-off to browser default in the middle, single-element trap
    onto itself). Both dialogs restore focus to the opener on close.
    Native `<dialog>`-based UIs (`dialog.js`, `library-dialog.js`) still
    get focus trap + Escape for free from `showModal()` and were not
    touched. E2e spec opens the help overlay via `?`, asserts
    `role="dialog"`, `aria-modal="true"`, initial focus lands on Close,
    Tab wraps within the overlay, Escape closes.
  - `prefers-reduced-motion` gating for the JS/Three.js decorations:
    new `web/src/reduced-motion.js` exports a single
    `prefersReducedMotion()` that reads `window.matchMedia` on every
    call (6 node tests for missing-window / missing-matchMedia /
    matches-true / matches-false / no-caching-across-calls / throw-safe).
    `walk-tween.js`'s `startWalk` short-circuits to the destination
    coordinate under reduce-motion (no ease, no per-frame tick), and
    `chips.js`'s `spawnChipMesh` skips the 0.7x -> 1.0x drop scale and
    doesn't spawn the cyan ring flash. Playback timelines (interpolated
    frame animation) are deliberately NOT gated - they're the primary
    product output, not decoration. E2e spec emulates
    `reducedMotion: 'reduce'`, calls `spawnChip`, and asserts the group
    is already at full display scale on the frame it was created;
    baseline spec (`reducedMotion: 'no-preference'`) confirms the chip
    starts at 0.7x display scale so we know the reduce path is really
    what disabled it.
  The one plain CSS `transition:` in `index.html` (100 ms border-color +
  background on `.tl-card:hover`) is deliberately left alone - well
  under the WCAG "essential" threshold and not the kind of motion that
  causes vestibular issues.
- **[S-BACK-006]** [shipped] **Blocking `alert`/`confirm`/`prompt` calls.**
  dock.js had 8 occurrences (New/Delete-slot/Overwrite confirms,
  load-failed/import-failed/too-large-for-share alerts, save-as prompt,
  and a share-link-copy prompt used only as the Clipboard API's fallback,
  which was already the primary path there). Fixed: new
  `authoring/dialog.js` (`showAlert`/`showConfirm`/`showPrompt`, all
  Promise-based) backed by the native `<dialog>` element -
  `showModal()` gives focus trapping and Escape-to-cancel for free, so
  this also closes part of S-BACK-005 for these specific dialogs. Every
  dock.js call site converted to `async`/`await` around the new calls; no
  behavioural change to the decision logic at each site, just the
  presentation. No unit test - this is a DOM-only module (`<dialog>`,
  `showModal()`) with no pure logic to isolate; not verified in a browser.
- **[S-BACK-007]** [shipped] **Hardcoded asset count in loading indicator.**
  `status.js`'s `pending` is now driven by call-site `expectLoad(name)` +
  `loaded(name)` pairs (in `chips.js`, `goalie.js`, `layers.js`), so the
  counter always matches the real number of in-flight loads instead of
  drifting when a loader is added or removed. The previous literal `7`
  actually undercounted the real 8 loaders and could clear the indicator
  before every asset had finished.
- **[S-BACK-008]** [shipped] **CI/build
  pipeline: test + minify + size-budget gate before deploy.** The deploy
  workflow used to upload `web/` byte-for-byte with no test/build/size
  gate, and `constants.js`'s `CACHE_BUST` was `?t=${Date.now()}` -
  recomputed on every page load, so it wasn't actually a cache-bust in
  production, just a permanent forced-refetch of every asset on every
  visit. Fixed, and verified locally end-to-end with `pnpm` (this session
  had pnpm available, unlike the earlier S-BACK-001/002/009 commits which
  only had bare `node`):
  - `scripts/build.mjs`: stages `web/` into `dist/` - per-file `esbuild`
    minify of `web/src/**/*.js` (not bundled - the app loads modules
    natively via `index.html`'s import map, so bundling would break that),
    the `Date.now()` cache-bust replaced with a commit-SHA-based one in
    the staged copy only (`web/` itself is never touched, so local
    zero-build-step dev is unaffected), and the confirmed-unreferenced
    dirs from **S-BACK-010** excluded.
  - `scripts/check-size.mjs`: budget gate, sizes set from this repo's
    *actual* measured output (dist ~55.5MB/70MB budget, dist/assets
    ~6.4MB/8MB, web/src ~0.51MB/0.8MB) - not copied from the external
    review's numbers, which turned out not to match this repo (see
    S-BACK-010).
  - `.github/workflows/deploy-pages.yml`: split into a `build` job (runs
    on every push and PR: `pnpm install --frozen-lockfile`, `pnpm test`,
    `pnpm run build`, `pnpm run check:size`) and a `deploy` job (main-push
    only, needs `build`, uploads `dist/` instead of `web/`).
  - Verified for real: `rm -rf dist node_modules && pnpm install
    --frozen-lockfile && pnpm test && pnpm run build && pnpm run
    check:size` all pass from a clean state (39/39 tests, minify succeeds,
    both size budgets pass); the built `dist/` was served locally and
    every touched module from this session's other fixes (`dock.js`,
    `dialog.js`, `save-status-ui.js`, `insights.js`, etc.) loads with a
    200. Workflow YAML validated with `js-yaml`.
  - **Not verified:** an actual GitHub Actions run (this was local-only;
    the workflow itself was never executed by Actions) and no goalie
    texture WebP conversion was done (that part of the external review's
    "load size" numbers was about `web/lib`/texture size, separate from
    this build-pipeline change and not attempted - would need image
    tooling and visual verification this session doesn't have).
  - **Now on `main`** (as of this check): this work was originally kept
    on a `perf/ci-and-load` branch pending a real PR + Actions run, but
    the same CI/build/size gate was independently re-implemented directly
    on `main` via commit `690151b` ("CI: test/build/size gate + trim
    unreferenced deploy weight (#1)") and has since been extended further
    (Playwright e2e in **S-BACK-014**, vendored-lib deletion in
    **S-BACK-013**). `main`'s current `deploy-pages.yml` runs `pnpm test`,
    the Playwright e2e suite, `pnpm run build`, and `pnpm run check:size`
    in the `build` job before `deploy` uploads `dist/` - confirmed by
    reading the live file, not by an Actions run inspected this session.
    The `perf/ci-and-load` branch itself is now stale and superseded -
    merging it would regress `main` (it would drop the e2e step and the
    `@playwright/test` dependency, and reintroduce `EXCLUDE_DIRS` entries
    for `lib/shoelace`/`lib/open-props`/`lib/radix-colors`/`design-sample`,
    which **S-BACK-013** deleted outright). Recommend deleting the branch
    rather than merging it.
- **[S-BACK-009]** [shipped] **Automated tests for the pure-logic
  modules.** `package.json` + `node --test` added (see S-BACK-001/002).
  60 tests across 5 files now cover `doc.js` (id sanitization/migration),
  `storage.js` (save-status tracking), `share.js` (encode/decode
  round-trip, size-limit, malformed-payload handling), `faceoff-snap.js`
  (snap radius/toggle), `insights.js` (shot verdict colour/angle
  bands, coverage-grid open/fully-blocked, pass-corridor clear/blocked/
  goalie-exclusion), and `bezier.js` (cubic Bezier endpoints + straight-
  line degeneracy, `segmentControls` im1/im2 resolution, `lerpAngle`
  short-path across ±π). The `bezier.js` module was extracted from
  `playback.js` for this - three functions (`bezierPos`, `segmentControls`,
  `lerpAngle`) moved to a dependency-free file; `playback.js` still
  re-exports them so `path-handles.js` etc. keep working. Extracting also
  surfaced a real bug in the old `lerpAngle`: JS's `%` keeps the
  dividend's sign, so the intended short-path wrap actually took the long
  way around for large-negative deltas (e.g. +170° -> -170°). Fixed to
  `atan2(sin(d), cos(d))`. Run via `npm test`. **Photo-overlay coverage
  added this session:** `back-project.js` (`footPixel`, `backProjectFoot`
  above-horizon null, `backProjectToHeight` at a lifted plane,
  `backProjectPlayers` out-of-rink drop + id assignment + extra-field
  pass-through), `detect-pose.js` (`matchPoseToPlayers` IoU pairing,
  minIou threshold, missing-bbox skip, best-of-many pick - imports the
  module without touching ORT since `loadOrt()` is call-time-only), and
  `facing-from-pose.js` (world -> image -> back-project round-trip at
  eight facings 0/±45/±90/±135/180, plus null/nose-fallback/cue reporting
  paths). 94 tests across 8 files now, up from 69. **This session:** did
  exactly the extraction this item called for, for `chips.js` and
  `shapes.js`'s permutation/lookup logic (the `history.js` half was done
  separately as part of **S-BACK-012** - see `history-stack.js`):
  - [reorder.js](../web/src/authoring/reorder.js) - `reorderAtSlots(items,
    orderedIds, getId?)`, one shared implementation of the "keep absolute
    slots, take on the new relative order" algorithm that `chips.js`'s
    `reorderChips` (over `Object.keys(players)`) and `shapes.js`'s
    `reorderShapes` (over the `shapes` array, keyed by `.id`) used to
    each hand-roll independently, with zero test coverage on either copy.
    Both call sites now delegate to it - a reuse win as well as a
    testability one. 6 new tests (subset reorder, full permutation, no-op,
    two invalid-input shapes, no-mutation, object/getId usage).
  - [numbering.js](../web/src/authoring/numbering.js) -
    `nextAvailableNumber(players, team)`, `chips.js`'s `nextNumber` minus
    the `ensureDoc()` call. 4 new tests (empty team, per-team isolation,
    gap-filling, wraparound at 25).
  - [shape-coords.js](../web/src/authoring/shape-coords.js) -
    `translateShapeCoords(shape, dx, dz)`, `shapes.js`'s `translateShapes`
    coordinate math (points/x·z/cx·cz), unchanged behaviour. 5 new tests
    (points, rect/text anchor, circle centre, no-op on unrelated fields,
    a shape carrying more than one representation at once).
  - [frame-list.js](../web/src/authoring/frame-list.js) -
    `isValidFrameIndex`/`clampInsertIndex`/`canRemoveFrame`/
    `clampCurrentAfterRemoval`, the bounds-check math behind `frames.js`'s
    `selectFrame`/`insertBlankFrame`/`deleteFrame` (the actual
    `doc.frames.splice()` call stays in `frames.js` - only the "is this
    index valid / where does the pointer land after removal" decisions
    moved out). 9 new tests covering every boundary: index 0 and
    length-1 valid, length itself and negative invalid; insert-at-end and
    negative/past-the-end clamping; refusing to remove the last remaining
    frame; and the pointer pull-back when the removed frame was both
    current and last.
  163 tests across 12 files now, up from 138 (S-BACK-012's own +12).
  Verified: `pnpm test` 163/163, `pnpm run build` + `check:size` pass, and
  `test-e2e/layers-panel.spec.js` (drives `reorderChips`/`reorderShapes`
  through real drag-and-drop) still 2/2 - no existing e2e spec exercises
  frame CRUD directly, so `frame-list.js`'s extraction relies on the node
  tests plus the fact it's a mechanical, behaviour-preserving move (same
  comparisons, same splice calls, still in `frames.js`).
  **`history.js`/`trajectory.js`/`coverage.js` (this session), closing the
  item:** re-inspected all three rather than re-stating the earlier
  conclusion unchecked.
  - `history.js`'s `apply()` is confirmed to have nothing further worth
    extracting - it's pure sequencing (five dynamic imports + rebuild
    calls in a fixed order, `structuredClone`, `saveDoc()`), no branching
    or computation of its own to isolate. This is genuinely the same
    finding as before, not a re-statement - `history-stack.js` (the
    actual stack push/undo/redo/cursor math) was already pulled out in
    **S-BACK-012**, and what's left in `apply()` *is* the impure glue by
    construction.
  - `trajectory.js` likewise has no extractable pure logic beyond what's
    already tested: its one non-trivial decision
    (`computeShotLineColor`) already delegates entirely to `insights.js`'s
    `shotVerdict()`, covered by existing tests. The rest is THREE.js
    buffer/transform mutation that requires a real scene graph.
  - `coverage.js`'s `coverageInputsChanged()` (skip the 221-sample raycast
    pass when nothing tracked moved, added for the S-BACK-011 perf note)
    *was* real, previously-untested pure logic - just inlined as a
    hand-rolled field-by-field comparison. Extracted to
    [dirty-check.js](../web/src/dirty-check.js): `snapshotChanged(prev,
    next, keys)` (shallow diff over a named key list) and
    `copySnapshot(target, source, keys)`, both dependency-free and
    reusable by any other per-frame recompute - directly relevant to
    **S-BACK-011**'s open perf note that the main `animate()` loop has no
    equivalent dirty-check at all. `coverage.js` now builds a plain
    snapshot object and calls the shared comparator instead of hand-rolled
    field comparisons; behaviour is unchanged (same fields tracked, same
    NaN-sentinel-always-triggers-first-frame semantics). 6 new node tests
    in `test/dirty-check.test.js` (equal/differing snapshots, untracked
    keys ignored, NaN-never-equals-itself, null/undefined/object-identity
    refs, `copySnapshot`'s in-place mutate-and-return).
  207 tests across 14 files now, up from 201 (B-BACK-005's own +6-ish).
  Verified: `pnpm test` 207/207, `pnpm run build` passes, syntax-checked.
  The refactor is behaviour-preserving by construction (same tracked
  fields, same comparison semantics, same NaN-sentinel first-frame
  behaviour - only the comparison itself moved to a tested pure
  function). **Not independently confirmed via Playwright this session:**
  a full e2e run on this machine hit severe (30-50x normal) slowdowns
  and `browserContext.close` teardown timeouts traced to dozens of
  concurrent Firefox/Edge processes already running on the dev machine
  (a real desktop, not a clean CI runner) - unrelated to this change (no
  stray Playwright/Chromium processes of this session's own were found),
  but it made e2e results for this specific edit inconclusive rather than
  worth re-running repeatedly under that contention.
- **[S-BACK-010]** [shipped] **Deploy ships
  unreferenced libraries.** Re-measured (the external review's `web/lib`
  numbers didn't match this repo - e.g. it claimed a vendored/minified
  `three.module.js` that doesn't exist here at all, three.js loads from
  the unpkg CDN via `index.html`'s import map, untouched by this fix):
  `web/lib/models` 26MB, `opencv.js` 13MB, `onnxruntime-web` 11MB (all
  three confirmed referenced, Mode B, left alone), vs. `shoelace` 9.8MB,
  `open-props` 44KB, `radix-colors` 24KB (confirmed via `grep -rl` against
  `index.html` and `web/src` - zero references; only `web/design-sample/`
  uses them, and `design-sample` itself isn't linked from `index.html`).
  `scripts/build.mjs` initially excluded `lib/shoelace`, `lib/open-props`,
  `lib/radix-colors`, and `design-sample/` from `dist/` only - confirmed no
  dangling references in the built output. Deploy artifact: 66MB source ->
  55.5MB built (includes both the exclusion and the JS minification from
  S-BACK-008, not separable). **Superseded by S-BACK-013**: those four
  paths were later deleted from the repo entirely (not just excluded from
  `dist/`), so `EXCLUDE_DIRS` in `build.mjs` is now empty - re-add an entry
  there if/when the design stack is re-vendored for the redesign.
  `pnp.js`'s stale comment claiming
  OpenCV is "NOT bundled" was also fixed in passing (it is committed to
  the repo at `web/lib/opencv.js`, just lazy-loaded on Photo Overlay open
  rather than at startup).
- **[S-BACK-011]** [shipped] **Perf micro-findings:**
  - **`animate()` unconditional render-loop - addressed this session.**
    `renderer.render()` was called every single frame regardless of
    whether anything visible changed (coverage.js already had its own
    dirty-check for the raycast pass; the loop's actual draw call had
    none). New [render-dirty.js](../web/src/render-dirty.js): a one-shot
    `markRenderDirty()`/`consumeRenderDirty()` flag, deliberately
    fail-open (forgetting to mark dirty costs one extra correct render,
    never a frozen frame). `main.js`'s `animate()` now skips
    `renderer.render()` unless at least one of: the flag was set since
    last frame; the active camera's pose/zoom differs from last frame
    (polled, not hooked - covers every camera-movement path: WASD walk,
    mouse-look drag, top-down pan/zoom - without needing to find every
    mutation site); the selection (primary + full set) differs from last
    frame; or an in-flight animation subsystem reports itself active
    (chip spawn/drop, move-command flash rings, walk-tweens, choreograph
    ghosts - each of `updateChipAnimations`/`updateMoveMarkers`/
    `updateWalks`/`tickChoreo` now returns whether it did anything this
    frame), the draw tool has an in-progress preview
    (`state.drawState`), or playback is advancing
    (`state.playback.playing`). `markRenderDirty()` is called from
    `storage.js`'s `saveDoc()` (the near-universal choke point every doc
    mutation - chips/shapes/cones/balls/frames/undo - already funnels
    through) and from the handful of visibility toggles that bypass the
    doc entirely: `utils.js`'s `bindLayerToggle()` (rink/goals/ball/
    grid-tiles/tactical layers), the goalie and scene-grid checkboxes,
    and `chips.js`'s `setLabelsVisible()`.
    [dirty-check.js](../web/src/dirty-check.js)'s `snapshotChanged`/
    `copySnapshot` (extracted from coverage.js in the S-BACK-009 pass
    just before this one) does the actual camera/selection comparison.
    4 new node tests for `render-dirty.js`'s flag semantics (starts
    dirty, edge-triggered, re-arms, collapses repeated marks).
    Verified: `pnpm test` 211/211, `pnpm run build` passes, and - after
    an initial full-suite run on this machine hit severe unrelated
    slowdowns (dozens of concurrent Firefox/Edge processes already
    running on this dev machine, not a clean CI runner) - the full
    Playwright e2e suite (all 5 spec files, 16/16) was re-run
    individually with a single worker once that contention eased,
    including the reduced-motion chip-drop-animation test specifically
    (the case most likely to break if the dirty-check wrongly suppressed
    a render mid-animation). **Explicitly flagged as needing further
    manual verification before being fully trusted** (this was the
    user's own call when scoping the item): this is a best-effort,
    best-understanding pass over the mutation surface, not an exhaustive
    proof - a missed case would show as a frame that silently doesn't
    update until something else invalidates it, which no automated test
    here can catch (`requestAnimationFrame` is paused in an unfocused
    Playwright tab, per this file's own testing notes). Known
    not-exhaustively-checked surface: Mode B's `preview-3d.js` ("View in
    3D" toggle, injects preview chips into the top-down camera without
    touching `state.doc`) and the Inspector panel's per-field controls
    (colour pickers, text inputs) weren't individually traced - both are
    expected to be covered incidentally (Inspector edits mutate the doc
    and go through `saveDoc()`; entering/exiting Preview-3D swaps the
    active camera, which the polled camera check catches), but that's
    inference, not a verified trace like the choke points above.
  - **Actioned in a later pass:** `three.js` + `mp4-muxer` are now
    vendored at `web/lib/three/` (r160 `three.module.min.js` +
    `MTLLoader` + `OBJLoader` addons, ~686 KB total) and
    `web/lib/mp4-muxer/` (`mp4-muxer.mjs`, ~67 KB), resolved via
    `index.html`'s importmap; a live-browser check confirmed zero
    external HTTP requests on boot and `mp4-muxer` resolves via bare
    `import('mp4-muxer')` from `export.js`. The renderer picks its
    quality tier at boot from `navigator.hardwareConcurrency` /
    `navigator.deviceMemory` / `window.devicePixelRatio` via the pure
    [renderer-quality.js](../web/src/renderer-quality.js) helper: weak
    devices (&lt;=4 cores or &lt;=2 GB) get `antialias: false,
    pixelRatio: 1`; everything else keeps the previous `antialias:
    true, pixelRatio: min(dpr, 2)`. A `localStorage.floorball.renderQuality`
    key (`'low' | 'high' | 'auto'`) lets a power user override the
    heuristic. Nine new node tests
    ([test/renderer-quality.test.js](../test/renderer-quality.test.js))
    cover the tier picker: high/low boundaries, cores-only weakness,
    mem-only weakness, dpr cap at 2 even on a 4x-dpr display, both
    override directions, missing inputs, and Firefox's missing
    `deviceMemory`. Verified live in a focused Chromium tab:
    `three.REVISION === '160'` loaded from `./lib/three/`,
    `rendererQuality.tier === 'high'` on this dev machine, zero
    external HTTP requests, no page errors. 237/237 unit tests, build
    + size checks green.
- **[S-BACK-013]** [shipped] **CodeQL alert: bad HTML-comment regex inside
  vendored Shoelace.** GitHub code scanning (`js/bad-tag-filter`) flagged
  `web/lib/shoelace/chunks/chunk.CXZZ2LVK.js:16` - a regex that only
  matches `-->` and not the equally-valid `--!>` HTML comment-end syntax.
  This was third-party vendored code, not anything this repo authored, and
  per S-BACK-010 it was already confirmed 100% unreferenced by the shipped
  app (only the unshipped `design-sample/` used it) and already excluded
  from the deploy artifact. Hand-patching a regex inside someone else's
  minified vendored bundle would be fragile (silently reverted on any
  re-vendor) and wouldn't fix anything real users are exposed to, so
  instead of patching it in place, `web/lib/shoelace/`,
  `web/lib/open-props/`, `web/lib/radix-colors/`, and `web/design-sample/`
  were deleted from the repo outright via `git rm`. `scripts/build.mjs`'s
  `EXCLUDE_DIRS` (added for S-BACK-010) is now empty since there's nothing
  left to exclude. The chosen design-system stack (section 2) is
  unaffected as a *plan* - just re-vendor all three (see
  `/memories/repo/design-system-vendoring.md`) when that redesign starts,
  and re-add an `EXCLUDE_DIRS` entry in `build.mjs` at the same time if
  `design-sample/` comes back as a non-shipped reference.
- **[S-BACK-014]** [shipped] **Automated browser-level integration
  tests.** `pnpm test` (node --test) only covered pure logic; the
  A-GAP-003 refactor surfaced a real failure mode (module init reading
  `state.doc` before `authoring/index.js`'s top-level-await bootstrap
  finalises it) that no Node test could have caught. Added a
  Playwright-based e2e suite ([test-e2e/library.spec.js](../test-e2e/library.spec.js)),
  a portable static-file server ([scripts/serve-static.mjs](../scripts/serve-static.mjs))
  wired via [playwright.config.js](../playwright.config.js)'s
  `webServer` so CI doesn't depend on Python, a `pnpm test:e2e` script,
  and a new CI step in
  [.github/workflows/deploy-pages.yml](../.github/workflows/deploy-pages.yml)'s
  `build` job that installs Chromium via `playwright install --with-deps`
  and gates the deploy the same way `pnpm test` does (failure uploads
  the Playwright report as an artifact). Initial coverage:
  `library.spec.js` for the A-GAP-003 flows - rename + reload
  persistence, new + switch + state isolation, legacy-key migration on
  first boot, delete-current fallback. 4 specs, ~40s wall-clock.
  Follow-up policy: grow the suite only when a similar UI regression
  bites, no fishing. **Grew once:** commit `4bcbd41` added
  [test-e2e/bootstrap.spec.js](../test-e2e/bootstrap.spec.js) after a
  boot-time regression (`effectiveFacingDeg` declared without `export`
  in `photo-overlay.js`) slipped past every existing spec - each one
  hit `page.goto('/')` and would have triggered the throw, but none
  listened for `pageerror` or `console.error`. The new spec asserts
  zero unhandled page errors and zero own-source console errors during
  boot, plus that `#rinkCheckbox` and `#dockProjectName` become
  visible - i.e. main.js's scene bootstrap and dock.js's init both
  finished. This is the "similar regression bites" case, not a fishing
  expedition: any future missing-export / null-querySelector / typo
  in a module-init path fails here without needing a targeted spec.
- **[S-BACK-015]** [shipped] **App-shell WIP: mode-switching topbar
  + left rail.** Working-tree redesign that moves project rename and
  Library out of the dock's overflow menu into a persistent
  [#appTopbar](../web/index.html) (Floorball Studio / &lt;Project
  Name&gt;, click name to rename) plus a fixed
  [#appRail](../web/index.html) on the left with **Plan** / **Analyze**
  / **Library** buttons. `shell.js` toggles `[data-view="plan"]` vs
  `[data-view="analyze"]` panel visibility, keeps `#photo-canvas`
  hidden outside Analyze, restores the three.js renderer canvas when
  leaving Analyze, treats Library as a modal dialog (not a
  full-viewport mode), and dispatches a `shell:mode` custom event so
  photo-overlay.js can lazy-restore its cached photo when the user
  actually enters Analyze instead of eagerly on `window.load`. Commit
  `4bcbd41` wired dock.js + photo-overlay.js up to this shape and
  added compat aliases (`data-dock="project"` on the topbar name,
  `data-action="library"` on the rail button) so the existing e2e
  specs still resolve.

  **What the -487 / -100 line diff on `photo-overlay.js` /
  `photo-canvas.js` actually was:** not consolidation, but the
  **removal of an in-progress "feedback / ground-truth capture"
  mode** that had shipped into the working tree without a plan
  entry. Dropped in the same commit because the shell rewrite
  touched every one of these DOM ids and it was cheaper to remove
  the half-baked UI than reattach it. Concretely gone from
  photo-overlay.js: the `photoFeedbackToggle` panel and its
  `photoFeedback{Controls,Status}` / `photoCopy{,Clear}FeedbackBtn`
  / `photoResetFacingBtn` / `photoClearSelFacingBtn` /
  `photoEstimateFacingsBtn` buttons, the `snapshotPlayerPos` /
  `snapshotPlayerFacing` / `snapshotBall` / `updateFeedbackStatus`
  helpers, and ~84 references to `feedback` / `ghost` / `corrected`
  / `facingLowConfidence` state. Gone from photo-canvas.js: the
  `ballGhost` state + `setBallGhost` export, ghost-chip rendering
  (pre-correction position + dashed connector to live chip),
  "corrected" green ring, low-confidence dashed facing nose, and
  the `placeLabelRect` overlap-avoidance placer. Also partly
  reverted in photo-canvas.js: the tokens.js colour migration -
  `TEAM_HOME` / `TEAM_AWAY` / `SHOT_LINE_TOKENS` /
  `VECTOR_PASS_*` / `VECTOR_COVERAGE_*` imports were inlined back
  to literal hex (`'#ff6b4a'` / `'#4a9bff'` / `'#ff3b30'` etc.);
  design-system-vendoring covers why we still want the token path
  eventually, but the shell rewrite prioritised getting the boot
  clean over keeping the imports.

  If any of the feedback-mode UX is wanted back, git blame the
  removed helpers - the pre-removal shape is preserved in `4bcbd41^`.
  **Update:** the removal was much wider than described here and has
  been fully reverted - see **S-BACK-017**.

  Unrelated: the pnp.js stale-comment reversal that also rode in
  with the WIP was undone (the correct comment says opencv IS
  vendored at web/lib/opencv.js and lazy-loaded, per S-BACK-010 -
  the reversal contradicted that and CLAUDE.md's own note).
- **[S-BACK-016]** [shipped] **Restore Plan-mode surface panels as
  floating draggable widgets + close the "silent no-op when a DOM
  root goes missing" hole.** Commit `4bcbd41` (S-BACK-015) removed
  `#toolPalette`, `#inspector`, and `#layersPanel` from index.html
  but left their side-effect modules imported; each guarded its
  root with `if (el) { ... }` and silently no-op'd, so Plan mode
  shipped without a Tool palette, Inspector, or Layers panel
  (dock's tool buttons re-appeared as an unintended fallback) and
  every gate stayed green: `pnpm test` had no DOM, the build
  parsed fine, and `bootstrap.spec.js` only asserted
  `#rinkCheckbox` + `#dockProjectName`. Fixed in two layers:
  **(1) restored all three panels** with their original CSS ported
  to `position:fixed` and a shared `.floatable-grip` drag handle;
  new [floatable.js](../web/src/authoring/floatable.js) does the
  pointer-capture drag + resize re-clamp + localStorage
  persistence, delegating the pure clamp/parse math to
  [palette-position.js](../web/src/authoring/palette-position.js)
  so it's Node-testable ([test/palette-position.test.js](../test/palette-position.test.js),
  6 new tests: in-bounds pass-through, top-left/bottom-right snap,
  degenerate-tiny-viewport, garbage/valid `parseStoredPos`); each
  panel persists to its own key (`floorball.toolPalette.pos`,
  `floorball.inspector.pos`, `floorball.layersPanel.pos`) with
  reserved edges accounting for the 40px topbar + 52px rail.
  **(2) hardened the regression net:** `tool-palette.js`,
  `inspector.js`, and `layers-panel.js` now `throw` when their
  root is missing (matching `dock.js`'s existing pattern);
  [bootstrap.spec.js](../test-e2e/bootstrap.spec.js) grew three
  visibility asserts (`#toolPalette`, `#inspector`, `#layersPanel`)
  as the belt to that throw's suspender; and CLAUDE.md's
  Architecture section now documents the rule ("DOM-owning modules
  must throw when their root element is missing, not silently
  no-op") with the specific antipattern and commit reference. This
  addresses part of S-BACK-015's "not yet done" cleanup: the three
  removed panels are back and the silent-no-op class of regression
  is now caught by the same tripwire that S-BACK-014 added. Not
  addressed: chip-popover.js and other side-effect modules weren't
  audited for the same pattern (grep for `getElementById` + `if
  (\w+) {` if extending); the -487/-100 line consolidation inside
  photo-overlay.js / photo-canvas.js from S-BACK-015 still needs
  its own documentation pass. Verified `pnpm test` 217/217, the
  full non-`photo-stepper` e2e suite 13/13 (`photo-stepper.spec.js`
  4 failures are pre-existing on `origin/main`, unrelated to this
  work, part of S-BACK-015's broader WIP), and a live-browser
  drag+persist smoke-test through the CDP-cache-clear pattern from
  CLAUDE.md.
- **[S-BACK-017]** [shipped] **Restore everything 4bcbd41 silently
  reverted + get CI green.** S-BACK-015's write-up undersold the
  damage: `4bcbd41` replaced `web/index.html`, `photo-overlay.js`
  and `photo-canvas.js` with a stale copy, reverting far more than
  feedback mode. The regressed features included: the Photo stepper + Step 3/4 CTAs
  (B-BUG-002, the source of the 4 red `photo-stepper.spec.js`
  tests), wireframe overlay toggle (A-BACK-005), pose-diagnostics
  coplanar/leverage warnings (B-BUG-001/003), L/R ambiguity
  handling (B-BACK-006), photo-overlay undo entries (S-BACK-012),
  "Estimate facings (pose)" (B-PHASE-005), Reset / Clear facing
  (B-PHASE-004, B-BACK-002), low-confidence dashed facings
  (B-BACK-003), label overlap placer (B-BACK-007), the Layer-1b
  pose goalie source label (B-BACK-005), the `goalieOptionsHtml`
  DOM-node builder (S-BACK-002 XSS defence - had gone back to an
  `innerHTML` template), tokens.css + tokens.js colours, the
  `#saveStatus` badge (S-BACK-001), timeline thumbnail CSS
  (A-GAP-002), per-tool cursors (A-GAP-001), the Choreo button
  (A-BACK-006), chip popover / marquee / bulk-bar CSS, icon-button
  aria-labels (S-BACK-005), and `#info` click pass-through. It also
  brought back dead Save/Load overflow buttons with no handlers. Fix: restored all three files from `4bcbd41^`,
  then re-applied the legitimate later changes (topbar project name
  + rail Library from 4bcbd41, floating panels from S-BACK-016,
  Goal tool / Pole cone, vendored three.js importmap); rename /
  library stay in the topbar/rail, not the overflow. Feedback mode
  (from `c617bc1`) came back with the rest. The cached-photo restore on
  Analyze entry (4bcbd41) was kept. It also fixes a follow-on bug:
  Plan -> Analyze round trip left a loaded photo hidden
  (`photoCanvas.showIfLoaded()` + re-`setCalibrating`). Also fixed
  a pre-existing race in `library.spec.js`'s legacy-migration test:
  seeding after booting the app let its rAF `saveDoc()` write an
  "Untitled" project back between `localStorage.clear()` and the
  reload, so seeding now establishes the origin on a static asset.
  New e2e: `bootstrap.spec.js` pins the restored control ids (red
  on `623e61b`, green after), `photo-stepper.spec.js` covers the
  round trip. Verified: unit 237/237, e2e 19/19, build + size OK,
  live-browser Plan/Analyze round trip with a cached photo.

---

## 11. Open questions

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
