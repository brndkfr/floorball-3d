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
- **[S-BACK-012]** [open] **Undo history not persisted, photo-overlay work
  not undoable.** `history.js`'s undo stack (MAX=100) is memory-only and
  lost on reload, including after an accidental "New scheme". Photo-overlay
  landmark placement/solve steps aren't pushed to the undo stack at all.
  Scoped out of S-BACK-001 - persisting an undo stack (or snapshotting to
  storage) and wiring photo-overlay actions into `history.js` is a bigger
  structural change than the quota/indicator fix, with real regression risk
  that needs live browser verification to do safely, not attempted blind in
  this pass.
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
- **[S-BACK-008]** [shipped, on branch `perf/ci-and-load`] **CI/build
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
  - Deliberately kept on a branch, not merged to `main` - this changes the
    live deploy artifact and deserves a real PR + Actions run before it
    touches the live site.
- **[S-BACK-009]** [in-progress] **Automated tests for the pure-logic
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
  paths). 94 tests across 8 files now, up from 69. **Not done:**
  `chips.js`, `shapes.js`, `frames.js`, `history.js` still have no tests
  - each pulls in `scene.js` (which reads `window.innerWidth` at module
  load) or dispatches `document` events at module load, so covering them
  needs a refactor to extract the pure permutation / lookup logic
  (`nextNumber`, `reorderChips` / `reorderShapes` id-slot rewrite,
  `translateShapes` coord math, frame-list mutations) into a
  dependency-free module first. `trajectory.js` and `coverage.js`
  remain entangled with `scene.js` for the same reason.
- **[S-BACK-010]** [shipped, on branch `perf/ci-and-load`] **Deploy ships
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
- **[S-BACK-011]** [open] **Perf micro-findings, not yet actioned:**
  `animate()` render-loops unconditionally every frame even when nothing
  moved (coverage.js already has a dirty-check; the main loop doesn't);
  `three.js`/`mp4-muxer` load from CDN (unpkg/esm.sh) rather than being
  vendored, contradicting the "no runtime third-party host dependency"
  claim in section 2 (that claim was true only for the design-system stack
  while it was vendored - see S-BACK-013, it no longer is); renderer
  always uses `antialias:true` + pixelRatio 2 with no quality tier for
  weaker devices.
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
  bites, no fishing.

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
