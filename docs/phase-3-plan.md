# Phase 3 execution plan - Insight overlays (Mode B, Step 4)

**Scope:** implement Step 4 of the Mode B guided stepper from
[docs/plan.md](plan.md) §4.3: given a Phase-1-aligned photo with a solved
`frame.photo.camera` and Phase-2 populated `frame.photo.players` / `.ball`
/ `.ballCarrier` / `.facingDeg`, render the tactical insight overlays
(shot trajectory, on-target verdict, coverage gap, passing alternatives,
angle to goal) directly on the photo, plus a "View in 3D" preview that
drops the reconstructed positions into the existing 3D scene.

**Non-goals (deferred):**
- Auto-pose / facing direction from ML - Phase 4. Facing is still v1
  "toward the closer goal + drag-to-rotate handle" from Phase 2.
- Video / multi-frame tracking + interpolation - Phase 5.
- Any new detection model. Phase 3 does zero ML - it's plain geometry
  over Phase-2 outputs.
- Persisting derived insight numbers into `frame.photo`. Everything in
  this phase is a pure function of the already-persisted fields (camera,
  players, ball, ballCarrier, facingDeg) and recomputed on demand. Only
  one small user-choice field is added (`targetGoal` / goalie
  designations, see §2).

**Prerequisites the executor should read first:**
- [CLAUDE.md](../CLAUDE.md) - coordinate conventions (mm, +Z forward, camera
  yaw offset), rendering gotchas (frustumCulled = false for mutated
  BufferGeometry), verification (`.mjs` syntax check, CDP cache-clear
  reload, workers/rAF gotchas).
- [docs/plan.md](plan.md) §4 (Mode B) and §5 (shared compute layer).
- [docs/phase-2-plan.md](phase-2-plan.md) §1-2 for the Phase-2 data
  model. `frame.photo.players[]` shape, `pose.projectWorld()` reuse
  pattern, `back-project.js` conventions.
- `/memories/repo/floorball-3d-photo-overlay.md` items **#39, #40**
  (photoCamera.updateMatrixWorld required, aspect must be set) - all
  Phase-3 insight overlays project world coords through `photoCamera`
  the same way Phase-2 chips do; the same trap applies if any code path
  re-computes without going through the cached `pose.projectWorld`.

---

## 1. Architecture at a glance

Phase 3 has **two ends**: a **compute core** that must work in both Mode
A and Mode B (the actual "shared compute layer" promise from
[plan.md](plan.md) §5), and a **Mode-B overlay renderer** that draws the
compute results on the 2D photo canvas.

```
frame.photo (Phase 1 + 2 - unchanged)
        │
        ▼  photo-overlay.js  (Step 4 UI)  ─── user picks target goal + goalie chip
        │                                    (frame.photo.targetGoal / goalieId per team)
        ▼
insights.js  (NEW - pure compute, shared with Mode A eventually)
    inputs:  { ballWorld, ballCarrierId, players[], goalie, targetGoal, facingDeg }
    outputs: {
        shot: { openLanes[], blockedLanes[], verdict, angleDeg },
        coverage: { gridBlocked:Float32Array, pctBlocked, quadrants:{tl,tr,bl,br} },
        passes: [{ toPlayerId, corridorClear, defendersInLane[] }],
    }
        │
        ▼  photo-canvas.js  (NEW setters: setShotLines / setCoverageOverlay / setPassLines / setAngleBadge)
        ▼  3D preview button ─── swaps active camera to state.photoCamera OR to a free-orbit
                                 rig, mounts a goalieProxyGroup + ballGroup + playerChipGroup
                                 driven from frame.photo, hides all Mode-A doc.frames rendering
                                 while active.
```

New files:
- `web/src/insights.js` - pure compute core. Zero DOM, zero THREE scene
  mutation (accepts `THREE.Vector3` for math but does not touch
  `state.*`). See §3 for the exact function signature contract.
- `web/src/authoring/photo-overlay/goalie-proxy.js` - builds an upright
  cylinder+box `THREE.Group` at a given world floor point, tall/wide
  enough to approximate a floorball goalie for the coverage raycast and
  the 3D preview. NOT a rigged model - a fast proxy shape.
- `web/src/authoring/photo-overlay/insights-overlay.js` - the Step 4
  wiring: reads `frame.photo`, calls `insights.js`, calls the new
  `photo-canvas.js` setters.
- `web/src/authoring/photo-overlay/preview-3d.js` - the "View in 3D"
  button handler; sets up the temporary Mode-B 3D preview.

Edited files:
- `web/src/authoring/photo-overlay/photo-canvas.js` (new setters for
  shot lines, coverage overlay heatmap, pass lines, angle badge)
- `web/src/authoring/photo-overlay/photo-overlay.js` (Step 4 accordion,
  target-goal picker, goalie-per-team picker, wiring)
- `web/src/authoring/photo-overlay/doc.js` extension - `frame.photo`
  gains `targetGoal: 'A'|'B'`, `goalies: { home: id|null, away: id|null }`
  (both additive, no migration - same discipline as Phase 2).
- `web/index.html` - Step 4 `<details>` block in the photo panel
  (matching the plain `<button class="dock-btn">` + `<details>` pattern
  already used, per memory item **#38** - the panel does NOT use
  Shoelace).
- `web/src/trajectory.js` and `web/src/coverage.js` - **light refactor
  only**. Extract the pure math (see §3.4) into `insights.js`; keep the
  Mode-A DOM/scene wiring inside these files, calling the extracted
  functions instead of duplicating them. Do NOT rewrite Mode-A behaviour;
  it must be a byte-identical result on the ground-truth doc.

Deliberately NOT touched:
- `web/src/goalie.js` (Mode-A goalie loader). Mode B uses `goalie-proxy.js`
  instead - a full-detail goalie mesh isn't warranted for a
  photo-derived pose, and loading the OBJ during Step 4 would drag in a
  4-second cold start for no visible benefit.

---

## 2. Data model additions

Only two additive fields on `frame.photo`. No migration; `ensureDoc()`
still never inspects `frame.photo`.

```js
frame.photo = {
  // Phase 1 (unchanged)
  landmarks, intrinsics, camera, reprojErrorPx, imageWH,

  // Phase 2 (unchanged)
  players, ball, ballCarrier, facingDeg,

  // Phase 3 (new)
  targetGoal: 'A' | 'B' | null,      // which end the ball carrier is attacking
  goalies: {                         // designated defender chips (Phase-2 player ids)
    home: id | null,                 //   - Mode B has no ML goalie detection,
    away: id | null,                 //     user picks one chip per team via the panel
  },
};
```

**Defaults:**
- `targetGoal` defaults to whichever goal is closer to `ball` in the +Z
  direction of the ball carrier's `facingDeg` (i.e. "the goal the carrier
  is facing"). Pure heuristic; user can flip via a "Flip target goal"
  button, same style as the Phase-1 "Flip left/right" button.
- `goalies.home` / `.away` default to `null`. The Step 4 UI shows a
  banner "Pick the goalie for each team" until both are set; insights
  that need a goalie (coverage, shot-block colour) render greyed-out
  until then, but shot-lane geometry (angle, on-target verdict against
  the goal frame) renders regardless.

Persistence: `saveDoc()` picks these up automatically since they're
plain fields on `frame.photo`. The photo-cache.js auto-restore path
(memory item **#44**) already deep-copies `frame.photo`, so restoring
recovers `targetGoal` + `goalies` unchanged.

---

## 3. Tasks

Each task is an independent, verifiable unit. Order them as listed; each
depends only on prior ones. Do NOT parallelize across tasks - each has
its own manual verification step in a real browser tab.

### T1 - Extract pure compute core (`insights.js`)

**Deliverable:** a single new module `web/src/insights.js` exporting
these pure functions (no `state.*`, no DOM, no `scene.add`):

```js
// Shot from a ball position toward a target goal. Colour of the shooting
// line follows the same rules coverage/trajectory already use in Mode A:
//   'open'          - no goalie in the ray
//   'blocked-off'   - goalie mesh in the ray, but lateral X offset > 200mm
//   'blocked-centred' - goalie in the ray AND lateral offset <= 200mm
export function shotVerdict({
  ballWorld,           // THREE.Vector3 (mm)
  goalCenterWorld,     // THREE.Vector3 (mm) - target goal's mouth centre
  goalieMesh,          // THREE.Object3D or null - raycast target
}) : {
  angleDeg: number,             // 0 = straight-on shot, 90 = along goal line
  distance: number,             // ball -> goal centre, mm
  lineColor: 'open' | 'blocked-off' | 'blocked-centred',
  onTarget: 'on' | 'near-miss' | 'off',   // for the verdict badge
};

// Coverage grid (same 16x12 grid as coverage.js). Callable with either a
// goalie THREE mesh (Mode A: detailed OBJ; Mode B: proxy cylinder from
// goalie-proxy.js) or with null (all cells open).
export function coverageGrid({
  ballWorld,
  targetGoalGroup,     // THREE.Group - the goal, with GOAL_MOUTH_CORNERS_LOCAL
  goalieMesh,          // THREE.Object3D or null
}) : {
  blockedAt: Float32Array,      // COVERAGE_VERTEX_COUNT
  pctBlocked: number,           // 0..100
  quadrants: { tl, tr, bl, br }, // pctBlocked per quadrant of the mouth
};

// Pass corridors. For each teammate of the ball carrier, is the line
// ball -> teammate inside the "clear corridor" (no defender within
// CORRIDOR_HALF_WIDTH mm laterally)?
export function passOptions({
  ballCarrierId,
  players,             // Phase-2 shape: [{ id, world:[x,0,z], team }]
  carrierTeam,         // 'home' | 'away' - own-team players excluded from defender list
  goalies,             // { home:id, away:id } - excluded from teammate iteration AND from defender list
  corridorHalfWidthMm, // default 400
}) : Array<{
  toPlayerId,
  clear: boolean,
  defendersInLane: Array<id>,   // for the yellow "close-call" tint
  distanceMm: number,
}>;
```

Own-team players are candidate receivers, not defenders. Both goalies are
excluded from receivers (you don't pass to your own goalie in this
analysis) AND from the defender list (goalie coverage is handled by the
shot verdict, not by treating them as a pass blocker).

**Implementation notes:**
- Copy `shotLineXAtZ` and the `GOALIE_CENTERED_THRESHOLD` constant
  (200 mm, see `trajectory.js` line 62 and its comment) verbatim - do
  not "clean them up" while moving; a byte-identical Mode-A behaviour
  is part of the acceptance test.
- Copy the coverage 16x12 grid geometry from `coverage.js` verbatim,
  including `COVERAGE_VCOLS = COVERAGE_COLS + 1` etc. Only the
  `state.*` reads and DOM writes are dropped.
- `quadrants` is new: split the 16x12 cell grid into four 8x6 blocks
  (top-left / top-right / bottom-left / bottom-right of the goal mouth,
  computed off the same `blockedAt` array). Mean of each 4-corner cell
  same way `pctBlocked` already averages.
- `passOptions` is new; there is no Mode-A precedent. Corridor test:
  for each defender, project onto the ball -> teammate segment; if the
  projection parameter `t` is in [0.05, 0.95] (skip endpoints so the
  ball/receiver aren't self-flagged) and the perpendicular distance is
  <= `corridorHalfWidthMm`, add to `defendersInLane`. `clear = defendersInLane.length === 0`.

**Acceptance:**
- `.mjs` syntax check passes.
- Node smoke test (`node --input-type=module -e "..."` or a `.mjs`
  scratch file - do NOT commit it): synthetic ball at
  `(0, 100, 20000)`, goal centre at `(0, 575, 0)` (rink centre → Goal
  A), no goalie mesh → `shotVerdict` returns `angleDeg ≈ 0`,
  `distance ≈ 20500`, `lineColor: 'open'`, `onTarget: 'on'`.
- Node smoke test for `passOptions`: carrier `id: 1` at
  `[0, 0, 20000]`, teammate `id: 2` at `[0, 0, 10000]`, defender `id:
  3` at `[100, 0, 15000]` (100 mm off the line, well within default
  400 mm corridor) → `passes[0].clear === false`,
  `passes[0].defendersInLane` includes `3`.

### T2 - Refactor `trajectory.js` + `coverage.js` to use `insights.js`

**Deliverable:** the Mode-A modules call into `insights.js` instead of
duplicating the math. Public exports (`updateTrajectory`,
`updateCoverage`, `updateGoalieLabel`) keep the same signature and
behaviour. Every DOM/state.* / scene.add stays in these files.

**Implementation approach:**
- `trajectory.js`'s `computeShotLineColor()` becomes a thin wrapper:
  read `state.goalieGroup` + `state.targetGoal`, call
  `insights.shotVerdict({...})`, map its `lineColor` to the existing
  `SHOT_OPEN_COLOR` / `SHOT_BLOCKED_OFFCENTER_COLOR` /
  `SHOT_BLOCKED_CENTERED_COLOR` `THREE.Color` instances.
- `coverage.js`'s `coverageInputsChanged` cache stays here (Mode-A
  60-fps constraint); the raycast pass itself calls
  `insights.coverageGrid(...)` on every changed frame.
- Do NOT change `align-goalie` behaviour in `trajectory.js` (the
  `state.goalieGroup.position.x = shotLineXAtZ(...)` line at 149).
  Keep calling the extracted `shotLineXAtZ` directly.

**Acceptance (regression) - exact harness:**

Run this in the browser console BEFORE the refactor, record both outputs;
run the same block AFTER the refactor, compare. Byte-identical required.

```js
// Setup: default doc, both coverage + trajectory checkboxes on.
document.getElementById('coverageCheckbox').checked = true;
document.getElementById('coverageCheckbox').dispatchEvent(new Event('change'));
document.getElementById('trajectoryCheckbox').checked = true;
document.getElementById('trajectoryCheckbox').dispatchEvent(new Event('change'));
// Datapoint 1 - defaults.
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const d1 = {
  pct: state.currentCoveragePct,
  shotColor: '#' + shootingLine.material.color.getHexString(),
};
// Datapoint 2 - move goalie 500mm laterally.
state.goalieGroup.position.x += 500;
state.goalieGroup.updateMatrixWorld(true);
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const d2 = {
  pct: state.currentCoveragePct,
  shotColor: '#' + shootingLine.material.color.getHexString(),
};
console.log(JSON.stringify({ d1, d2 }));
```

(`shootingLine` isn't currently on window - either temporarily export it,
or read via `scene.children.find(c => c.type === 'LineSegments' && c.material.type === 'LineDashedMaterial')`.)

Both `d1` and `d2` must match exactly across the refactor. `.mjs` syntax
check on both files.

### T3 - `goalie-proxy.js` (upright placeholder mesh)

**Deliverable:** `createGoalieProxy(worldFloorPoint, facingDeg)` returns
a `THREE.Group` containing:
- A vertical `CylinderGeometry(radius=250, height=1750)` centred at
  `y=875` (waist) - approximates a standing goalie's body volume for
  the coverage raycast. Radius/height are estimates, clearly commented,
  matching CLAUDE.md's "numbers without a cited source" rule.
- A small forward-facing box at the front of the cylinder (a hint of
  the goalie's forward face) - purely for the 3D preview readability;
  the raycast doesn't need it.
- Group origin at the floor point (memory item's coordinate rule:
  local origin at floor-contact); rotation applied so +Z of the group
  matches `facingDeg`.

**Uses:**
- `insights.coverageGrid` for coverage raycast against `state.goalieGroup`
  in Mode A stays the actual detailed mesh; Mode B passes this proxy
  group as `goalieMesh`.
- Preview-3d.js mounts one proxy per designated goalie chip.

**Acceptance:**
- Given `worldFloorPoint = (500, 0, 0)`, `facingDeg = 0`, the group's
  world bounding box (`new THREE.Box3().setFromObject(group)`) has
  `min.y >= 0` and `max.y >= 1750` (feet on floor, head up).
- `.mjs` syntax check passes.

### T4 - `insights-overlay.js` (photo-canvas overlay renderer)

**Deliverable:** module that, given a `frame.photo` with all Phase
1/2/3 fields, projects each insight to image pixels via the cached
`pose.projectWorld` (same accessor Phase 2 uses for chip re-projection,
see memory items **#39/#40**) and calls new setters on `photo-canvas.js`:

- `photoCanvas.setShotLines(shotLines)` - `shotLines = { corners: [{px1, px2}]*4, centre: {px1, px2}, colorKey: 'open'|'blocked-off'|'blocked-centred' }`
- `photoCanvas.setCoverageOverlay(cov)` - `cov = { corners: [tl,tr,bl,br], grid: Float32Array, cols, rows } | null` -
  draws a low-opacity red/green heatmap by mapping the goal-mouth
  quad on the photo (four corner pixels) to a warped grid. Use the
  same red/green colour scheme as Mode A's coverage mesh.
- `photoCanvas.setPassLines(passes)` - `passes = [{ fromPx, toPx, clear:bool }]` -
  green if clear, red if blocked; a small circle at the receiver end.
- `photoCanvas.setAngleBadge(angleDeg | null)` - draws a small badge
  near the ball marker with the angle in whole degrees; null clears.

**Coordinate rule (same as Phase 2):** setters take image pixels; the
world→pixel conversion stays in `insights-overlay.js`. This keeps
`photo-canvas.js` domain-agnostic (memory item **#21**'s labelResolver
pattern).

**Coverage heatmap warp - simplest correct approach:** call
`pose.projectWorld(x, y, z)` per grid VERTEX (the same 17x13 vertex set
`insights.coverageGrid` samples) - do NOT try to bilinearly interpolate
over a quad. `pose.projectWorld` is a fast closure over the solved
intrinsics + extrinsics (see `pnp.js` line 132); projecting ~220 points
costs well under 1 ms. Fill each cell as a `ctx.fillStyle` `fillRect` at
the projected TL corner with size = projected-TR minus projected-TL. On
user-action-only redraw this is fine.

Pseudocode skeleton:
```js
const GRID_LOCAL = insights.getCoverageGridLocalPoints(); // [{x,y,z}] length = VCOLS*VROWS
const goalGroup = frame.photo.targetGoal === 'A' ? goalGroupA : goalGroupB;
const vLocal = new THREE.Vector3(), vWorld = new THREE.Vector3();
const px = [];
for (const p of GRID_LOCAL) {
  vLocal.set(p.x, p.y, p.z);
  vWorld.copy(vLocal); goalGroup.localToWorld(vWorld);
  px.push(pose.projectWorld(vWorld.x, vWorld.y, vWorld.z)); // [px, py]
}
// then for each cell (r, c): 4 corner pxs + blockedAt[vertex] avg -> colour + fillRect
```

`insights.js` must therefore also export the raw grid local-space points
(`getCoverageGridLocalPoints()`) so Mode-B can project them without
re-deriving the geometry.

**`recomputeInsights()` entry point sketch** (single function in
`insights-overlay.js`; every wire in T5 just calls this):

```js
export function recomputeInsights() {
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  const pose = getLastPose();  // NEW export from photo-overlay.js - see note below
  if (!photo || !pose || !photo.ball || !photo.targetGoal) {
    photoCanvas.setShotLines(null);
    photoCanvas.setCoverageOverlay(null);
    photoCanvas.setPassLines(null);
    photoCanvas.setAngleBadge(null);
    return;
  }

  const targetGoalGroup = photo.targetGoal === 'A' ? state.goalGroupA : state.goalGroupB;
  const goalCenterWorld = targetGoalGroup.localToWorld(GOAL_CENTER_LOCAL.clone());
  const ballWorld = new THREE.Vector3().fromArray(photo.ball);

  // Goalie proxy - defender of the attacked goal is on the OPPOSITE team
  // from the ball carrier.
  const carrier = photo.players.find(p => p.id === photo.ballCarrier);
  const defendingTeam = carrier?.team === 'home' ? 'away' : 'home';
  const goalieId = photo.goalies?.[defendingTeam];
  const goalieChip = goalieId != null ? photo.players.find(p => p.id === goalieId) : null;
  const goalieMesh = goalieChip ? createGoalieProxy(new THREE.Vector3().fromArray(goalieChip.world), 0) : null;

  const shot = insights.shotVerdict({ ballWorld, goalCenterWorld, goalieMesh });
  const cov  = insights.coverageGrid({ ballWorld, targetGoalGroup, goalieMesh });
  const pass = insights.passOptions({
    ballCarrierId: photo.ballCarrier,
    players: photo.players,
    carrierTeam: carrier?.team,
    goalies: photo.goalies,
    corridorHalfWidthMm: 400,
  });

  // Project to image px via pose.projectWorld and hand to canvas setters.
  photoCanvas.setShotLines(projectShotLines(shot, ballWorld, targetGoalGroup, pose));
  photoCanvas.setCoverageOverlay(projectCoverage(cov, targetGoalGroup, pose));
  photoCanvas.setPassLines(projectPasses(pass, ballWorld, photo.players, pose));
  photoCanvas.setAngleBadge(shot.angleDeg);

  goalieMesh?.parent?.remove(goalieMesh);  // proxy is transient, don't leak into scene graph
  window.__photoOverlayDebugLog?.push({ kind: 'insights', /* ... */ });
}
```

`getLastPose()` needs to be added to `photo-overlay.js` (it currently
holds `lastPose` at module scope, not exported - see
[photo-overlay.js](../web/src/authoring/photo-overlay/photo-overlay.js)
line 413 and its uses at 1036/1053). Add
`export function getLastPose() { return lastPose; }` next to those uses.
`pose.projectWorld(x, y, z)` returns `[px, py]` in **original image
pixels** (or null if behind camera - see [pnp.js line 132](../web/src/authoring/photo-overlay/pnp.js#L132)),
which is exactly the space `photo-canvas.js`'s setters draw in.

**Render trigger:** recompute on every user action that changes any
input (chip drag release, ball move, `targetGoal` flip, goalie
designation change). Do NOT recompute on every rAF tick - `insights.js`
is cheap but the raycast in `coverageGrid` still costs ~2 ms per call.

**Debug logging:** every recompute logs to
`window.__photoOverlayDebugLog` (same channel as Phase 1/2): input
ball world, target goal, goalie present y/n, shot verdict, pctBlocked,
pass count / clear count, elapsed ms. Same shape as prior entries.

**Acceptance:**
- On the ground-truth photo with 1 goalie chip + 3 teammates + ball
  placed via Phase-2 flow: shot lines render from the ball to each of
  4 goal corners plus centre; pass lines fan out to each teammate;
  angle badge shows ~sensible degrees for the setup.
- Coverage heatmap only appears once a goalie is designated for the
  attacked-goal's team.
- `.mjs` syntax check passes.

### T5 - `photo-overlay.js` Step 4 wiring

**Deliverable:** new "Step 4 - Insights" `<details>` in the photo panel,
disabled until `frame.photo.reprojErrorPx < 20` AND
`frame.photo.ball != null` (Phase 2 prerequisites already ship this).

Controls:
1. **Target goal**: two-radio (`Goal A` / `Goal B`) with a default
   populated from the "carrier is facing" heuristic in §2. Change fires
   overlay recompute.
2. **Home goalie** dropdown: lists all chips with `team === 'home'` by
   `id`; picking one sets `frame.photo.goalies.home`. Same for away.
   A shortcut **"Auto-assign nearest to each own goal"** button picks
   the home-team chip nearest Goal-B (defends Goal B if home attacks
   Goal A) and vice versa. Deterministic, no ML.
3. Info block (read-only, updated live from the last insight recompute):
   angle to goal, distance to goal, coverage % (or `-` when no
   goalie), pctBlocked per quadrant, count of clear passing options.
4. **View in 3D** button - hands off to `preview-3d.js` (T7).

Wire order:
```
// Recompute triggers - all call the same recomputeInsights() entrypoint
photoCanvas.setPlayerChipMovedHandler(fn)        // extend Phase-2 handler
photoCanvas.setBallMovedHandler(fn)              // extend Phase-2 handler
targetGoalRadios.change                          // NEW
goalieDropdowns.change                           // NEW
```

Each `recomputeInsights()` rebuilds a transient goalie proxy group for
each designated goalie (created via T3), calls `insights.js` for shot
+ coverage + passes, projects all outputs to image px, and calls the
T4 setters. Proxy group is discarded at end of recompute (do NOT keep
one in a scene graph - not needed for the 2D overlay case; only
`preview-3d.js` in T7 mounts these).

**Acceptance:**
- Radio flip / dropdown change → overlay updates within one frame.
- Reload survives all new fields (`targetGoal`, `goalies.*`) via the
  existing saveDoc / photo-cache path.

### T6 - `photo-canvas.js` overlay setters

**Deliverable:** the 4 new setters listed in T4 with the same "call once,
redraw is idempotent" pattern as `setPreviewStrips` / `setPlayerChips`.

**Draw order** (bottom → top):
1. Photo image
2. Preview strips (Phase 1)
3. Coverage heatmap (Phase 3, transparent)
4. Placed landmark markers (Phase 1, with labels)
5. Pass lines (Phase 3)
6. Shot lines (Phase 3) - drawn ABOVE pass lines so the shooting line
   isn't visually lost in a fan of pass lines.
7. Player chips + outlines (Phase 2)
8. Ball marker + angle badge (Phase 3)

Preview-opacity slider (Phase 1) applies to preview strips only (memory
item **#13**) - Phase-3 overlays are opacity-independent, matching the
Phase-2 chip precedent. Reasoning: Phase-1 strips are a calibration
sanity check; Phase-2/3 overlays are the actual answer being read out,
so hiding them behind a "hide preview" slider would be a UX regression.

**Acceptance:**
- `.mjs` syntax check passes.
- Regression: with all Phase-3 setters called with `null`, canvas
  renders identically to Phase-2 end-state (byte compare a screenshot).

### T7 - `preview-3d.js` (3D preview of the reconstructed scene)

**Deliverable:** module exporting `enterPhotoPreview3D(frame)` /
`exitPhotoPreview3D()`. Wired to a "View in 3D" button in Step 4.

**Behaviour:**
- `enterPhotoPreview3D`: for each entry in `frame.photo.players`, call
  `spawnChip({ team: p.team, x: p.world[0], z: p.world[2], number: p.id, pushHistory: false })`
  (the actual export from [chips.js](../web/src/authoring/chips.js) -
  `spawnChip`, not `createChip`). `pushHistory: false` is critical: the
  preview must not clutter the Mode-A undo stack.
  Place `state.ballGroup` at `frame.photo.ball` (save its previous
  position first for exit). Mount one goalie proxy per designated
  goalie into `scene`. Set `state.targetGoal` to whichever goal
  `frame.photo.targetGoal` names (Mode A already has both goal groups
  mounted).
- **Camera**: there is no existing free-orbit rig in this codebase -
  scene.js has only `camera` (first-person perspective) and
  `topDownCamera` (orthographic top-down, see
  [scene.js](../web/src/scene.js#L38)). Simplest path: reuse
  `topDownCamera` via `setActiveCamera(topDownCamera)` for the preview
  (Mode A's 2D authoring view is already this camera - familiar UX,
  zero new controls to wire). Save + restore the previous
  `state.activeCamera` via the existing
  [topdown-camera.js](../web/src/authoring/topdown-camera.js) enter/exit
  helpers as a template. **Do NOT reuse `photoCamera`** - its FOV/pose
  are photo-derived and constrain the view uselessly.
- `exitPhotoPreview3D`: `removeChip(id)` (also from `chips.js`) each
  spawned chip, remove goalie proxies from `scene`, restore ball group
  position, restore previous active camera + previous `state.targetGoal`.
- The Mode-A authoring doc (`state.doc.frames[...]`) is NOT touched.
  This is a preview, not a "convert photo to a play" (that's an
  explicit follow-up; see §5).

**Caveat**: `spawnChip` currently DOES mutate `state.doc.scheme.players`
(that's how Mode A persists chip state). Verify by reading
[chips.js](../web/src/authoring/chips.js) L142 before implementing - if
this turns out to be true, the preview needs to snapshot
`state.doc.frames[currentFrame].scheme` before entering and restore it
on exit, otherwise Mode A gets Mode-B's players baked into its doc.
An alternative is to build a lightweight non-`spawnChip` renderer that
drops chip meshes directly into the scene without touching `state.doc`
at all - lower risk, ~30 lines. Prefer this if `spawnChip` mutates the
doc; the acceptance criterion "state.doc unchanged after exit" is
non-negotiable.

**Acceptance:**
- Enter preview: 3D scene renders with chips at plausible rink positions
  (drop them into the top-down view for a quick sanity check).
- Exit preview: previous view restored exactly, `state.doc` unchanged.
- `.mjs` syntax check.

### T8 - `index.html` panel additions

Add the Step 4 `<details>` block after Step 3, matching the plain
`<button class="dock-btn">` + `<details>` pattern - memory item **#38**
established this is not a Shoelace panel.

Contents (all inside the `<details>`, all `disabled` initially, T5
enables when Phase-2 has run + reproj OK):
- `<fieldset>` with two radio buttons (`Goal A` / `Goal B`).
- Two `<select>` (home goalie, away goalie) populated dynamically by T5.
- One `<button class="dock-btn">Auto-assign nearest goalies</button>`.
- One `<button class="dock-btn">View in 3D</button>`.
- A small `<div>` for the read-only insight readout (angle, coverage %,
  clear-pass count).

### T9 - Verification pass

Run all of the following before declaring the phase done:

1. `.mjs` syntax check on every edited/new `.js` under `web/src/` and
   `web/src/authoring/photo-overlay/`.
2. Full CDP cache-clear + hard reload dance from CLAUDE.md before every
   browser retest (Chromium module cache burns; memory items **#6, #19,
   #43**).
3. Mode-A regression: load the app in default Mode A, tick coverage +
   trajectory checkboxes, move the goalie manually - `pctBlocked` and
   shot-line colour must be byte-identical to pre-refactor values on
   the same two datapoints (see T2 acceptance).
4. Mode-B ground-truth: use the repo's photo-overlay test image, run
   through Steps 1-3 (Phase 1 + Phase 2 auto-restore via
   photo-cache.js), then in Step 4:
   - Pick target goal, designate two chips as goalies. Overlay must
     render within one frame.
   - Drag the ball. Overlays follow.
   - "View in 3D" enters preview; exit restores original view.
   - Reload page. `frame.photo.targetGoal` + `.goalies.*` survive.
5. Debug log check: `window.__photoOverlayDebugLog` shows one entry per
   recompute with the fields listed in T4.
6. Coplanar / stale-matrixWorld regression check: after a solve, before
   the first recomputeInsights(), verify `photoCamera.matrixWorld` is
   fresh (memory item **#39** - the same trap will bite Phase 3 if
   `pose.projectWorld` is bypassed anywhere).

---

## 4. Known risks & fallbacks

- **Goalie proxy underestimates real block volume**: an upright cylinder
  is narrower than a real goalie with pads spread. Coverage will
  under-report vs a real crouched goalie. Acceptable v1 - a coach
  wanting precision would still adjust manually via drag; ML-based
  goalie-pose estimation is Phase 4 territory. If v1 feels wildly wrong
  on real photos, widen the cylinder radius to ~350 mm before adding a
  new shape.
- **`insights.js` <-> `trajectory.js`/`coverage.js` behaviour drift**:
  the T2 refactor is the highest-risk change in this phase because
  Mode-A behaviour must not regress. The byte-identical acceptance test
  (T2 acceptance) is the guard. If the numbers drift on the ground-
  truth doc, a follow-up option is to leave Mode A untouched and let
  Mode B keep its own copy of the math (uglier, but reversible).
- **Coverage heatmap warp visually wrong on strongly-tilted mouth
  quads**: the bilinear-over-quad approximation assumes the goal
  mouth's on-photo quad is roughly convex, which it is for any
  realistic goal shot. If a pathological angle breaks it, fall back to
  per-vertex `photoCamera.project`; it's ~20 ms/redraw vs ~2 ms - still
  fine for a UI that only recomputes on user action.
- **Passing-corridor false negatives near the ball carrier**: two
  teammates standing shoulder-to-shoulder will each get "blocked by
  each other" if the corridor test doesn't excempt the carrier's own
  team. Fix in T1: skip same-team defenders in the corridor unless
  they're the ball carrier's chip itself (they aren't - the carrier
  isn't in `players` for `toPlayerId` iteration). Verify with a
  synthetic test.

---

## 5. Out-of-scope for Phase 3 (call these out to the user if asked)

- **Auto-goalie designation from ML**: Phase 4. v1 uses a per-team
  dropdown + "auto-assign nearest to own goal" heuristic.
- **Facing-direction ML** for the ball carrier or the goalie: Phase 4.
  Ball-carrier facing is still the Phase-2 default + drag handle;
  goalie facing follows the ball carrier's shot line automatically
  (proxy just points at ball).
- **"Convert this photo to a Mode-A play"**: an obvious follow-up
  (drop the reconstructed chip positions into a new `state.doc` frame,
  let the user animate from there) but not part of this phase.
  Reasoning: Phase 3 is about answering tactical questions from ONE
  moment; converting to a Mode-A play is a bridge between modes and
  earns its own phase.
- **Multi-frame video insight tracking**: Phase 5.
- **Persisting computed insight numbers** in `frame.photo`. Recompute
  on demand from Phase-1/2 fields; adds no bloat to the shareable doc.

---

## 6. When Phase 3 ships

Update:
- [docs/plan.md](plan.md) §4.5 phase table: change Phase 3 from "not
  started" to a one-line "shipped" summary.
- `/memories/repo/floorball-3d-photo-overlay.md`: append Phase 3
  learnings as new numbered bullets in the same style as Phase 1/2
  entries. Every real bug fixed during execution goes here so the next
  phase inherits the trap list.
- CLAUDE.md: only if a new class of gotcha shows up (new coordinate
  convention, new rendering trap, new cross-module state assumption).

Do NOT create a `handoff-*.md` file. `plan.md` is the single source of
truth per §8 of that doc.
