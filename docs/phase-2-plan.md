# Phase 2 execution plan - YOLO player auto-detect (Mode B, Step 3)

**Scope:** implement Step 3 of the Mode B guided stepper from
[docs/plan.md](plan.md) §4.3: given a Phase-1-aligned photo (solved camera
pose in `frame.photo`), auto-detect player boxes, back-project them onto
the rink floor, split into two teams, let the user drag any chip to
correct it, mark the ball with one click, and persist everything to
`frame.photo`.

**Non-goals (deferred):**
- Auto-pose / facing direction from ML - defer to Phase 4. v1 facing is
  "point toward the closer goal" plus a drag-to-rotate handle in Step 3.
- Video / multi-frame tracking - Phase 5.
- Insight overlays (shot trajectory, coverage gap, verdicts) - Phase 3.

**Prerequisites the executor should read first:**
- [CLAUDE.md](../CLAUDE.md) - coordinate conventions, rendering gotchas,
  verification (`.mjs` syntax check, hard-refresh, worker/rAF gotchas).
- [docs/plan.md](plan.md) §4 (Mode B) - target UX, data model
  (`frame.photo`), phase table.
- `/memories/repo/floorball-3d-photo-overlay.md` - every fixed Phase-1 bug
  and the class of mistakes to avoid (stale ES module cache, opencv.js
  build gotchas, min-drag-threshold pattern for click-vs-drag, coplanar
  trap - not directly relevant here but shows the review discipline).

---

## 1. Architecture at a glance

```
photo (HTMLImageElement, live via photoCanvas.getImage())
        │
        ▼  detect-players.js  (ONNX Runtime Web + yolov8n.onnx, person class only)
person bboxes [{x,y,w,h,score}] in original image px
        │
        ▼  back-project.js  (ray from photoCamera through bbox foot pixel × y=0 plane)
world floor points [{id, world:[x,0,z], bbox}]
        │
        ▼  team-cluster.js  (k-means k=2 in Lab over jersey pixels)
players [{id, world, team:'home'|'away', bbox}]
        │
        ▼  photo-canvas.js  (draggable chip overlay, ball marker, carrier ring)
        ▼  photo-overlay.js  (Step 3 UI: Detect players / Clear / Flip teams / Set ball)
        ▼  doc.js            (frame.photo.players/ball/ballCarrier/facingDeg persist)
```

New files:
- `web/src/authoring/photo-overlay/detect-players.js`
- `web/src/authoring/photo-overlay/back-project.js`
- `web/src/authoring/photo-overlay/team-cluster.js`

Edited files:
- `web/src/authoring/photo-overlay/photo-canvas.js` (chip/ball overlay + drag)
- `web/src/authoring/photo-overlay/photo-overlay.js` (Step 3 UI + wiring)
- `web/src/authoring/doc.js` (persist new `frame.photo.*` fields - accessor unchanged)
- `web/index.html` (Step 3 controls in the photo panel, behind an accordion until pose is solved)

Vendored (see §3):
- `web/lib/onnxruntime-web/` (ort-wasm-simd.wasm + ort.min.js)
- `web/lib/models/yolov8n.onnx`

---

## 2. Data model additions

Extend `frame.photo` per [plan.md](plan.md) §4.4. `doc.js`'s `ensureDoc()`
already tolerates unknown extra keys on `frame.photo`; there is nothing to
migrate because Phase 1 shipped `frame.photo` as a plain object. Just
write / read the new fields.

```js
frame.photo = {
  // Phase 1 (unchanged)
  landmarks, intrinsics, camera, reprojErrorPx,

  // Phase 2 (new)
  players: [                       // detected + user-adjusted chips
    { id, world: [x, 0, z], team: 'home' | 'away', bbox: [x, y, w, h] }
  ],
  ball: [x, 0, z] | null,          // world mm, null until user clicks
  ballCarrier: id | null,          // player id; auto = nearest to ball
  facingDeg: number | null,        // v1 default = toward closer goal
};
```

No `doc.js` migration required. `frame.photo` is a v2-shape doc already;
new fields are additive. `ensureDoc()` never inspects `frame.photo`.

---

## 3. Vendoring (do this first)

Match the `web/lib/opencv.js` pattern - no CDN at runtime, no build step.

### 3.1 ONNX Runtime Web

The executor must not attempt to auto-download a multi-MB WASM binary
through tools. Ask the user to place the files, same convention as
opencv.js. Required files (from
`https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/`):
- `ort.min.js` -> `web/lib/onnxruntime-web/ort.min.js`
- `ort-wasm-simd-threaded.jsep.wasm` -> same folder
- `ort-wasm-simd-threaded.jsep.mjs` -> same folder

At runtime, set the WASM base path explicitly (required when self-hosting):

```js
ort.env.wasm.wasmPaths = new URL('../../../lib/onnxruntime-web/', import.meta.url).toString();
ort.env.wasm.numThreads = 1;   // no cross-origin isolation on static Pages
ort.env.wasm.simd = true;
```

Load ORT via a plain `<script>` tag in `index.html` (like opencv.js) so
`window.ort` is globally available, then read `ort` from window inside
`detect-players.js`. Do NOT use ES module import for ORT itself - the
`.mjs` build needs COOP/COEP headers for threads that GitHub Pages does
not provide, and past experience with opencv.js showed script-tag +
`window.*` is the reliable path.

Verification (before writing detection code):
```powershell
Copy-Item web/lib/onnxruntime-web/ort.min.js web/lib/onnxruntime-web/ort.min.mjs
node --check web/lib/onnxruntime-web/ort.min.mjs
Remove-Item web/lib/onnxruntime-web/ort.min.mjs
# then in the browser console (real tab, not Playwright - see CLAUDE.md worker note):
# > window.ort.InferenceSession   // should be a function
```

### 3.2 YOLOv8n model

Ask the user to download `yolov8n.onnx` from Ultralytics
(`ultralytics/assets` releases, ~12 MB fp32) and drop it at
`web/lib/models/yolov8n.onnx`. Fp16 quantization is a follow-up if size /
first-load latency becomes a real problem (measure first).

Model I/O (fixed for YOLOv8):
- Input: `images` name, shape `[1, 3, 640, 640]`, RGB, normalized to
  `[0, 1]`, letterboxed square with grey (114/255) padding.
- Output: `output0` name, shape `[1, 84, 8400]` - 4 box coords (cx, cy,
  w, h in 640-space), 80 COCO class scores. Person is class **0**.

Post-process: transpose to `[8400, 84]`, filter by `person score > 0.35`,
undo letterbox to original image px, NMS with IoU 0.5, cap at 20 boxes.

---

## 4. Tasks

Each task is an independent, verifiable unit. Order them as listed; each
depends only on prior ones. Do NOT parallelize across tasks - each has
its own manual verification step in a real browser tab.

### T1 - `detect-players.js` (inference only, no UI)

**Deliverable:** `detectPlayers(image, { scoreThreshold = 0.35 } = {})`
returns `Promise<Array<{ bbox: [x, y, w, h], score: number }>>` in
original image px. Uses `window.ort`, loads model lazily on first call,
caches the `InferenceSession` on module scope.

**Implementation notes:**
- Letterbox the image on an offscreen canvas to 640x640 grey-padded,
  record scale + pad offsets to invert after inference.
- Feed as Float32Array in NCHW order (`[batch, channel, row, col]`, not
  the HTML canvas's default `[row, col, channel]` interleaved layout -
  easy footgun).
- NMS in plain JS is fine (8400 boxes worst case, most filtered by score
  threshold before NMS runs).
- Log every inference to `window.__photoOverlayDebugLog` the same way
  Phase 1 does (input dims, box count pre/post NMS, elapsed ms) - the
  debug log is the reliable inspection channel per CLAUDE.md.

**Acceptance:**
- In a real Chromium tab (not Playwright - workers/rAF gotchas), load the
  repo's ground-truth photo, call `detectPlayers` from the console, get
  a plausible box count (may be 0 on a synthetic goal render - test also
  on any real phone photo the user provides).
- `.mjs` syntax check passes.
- Second call reuses the cached session (measure: first call > 500 ms,
  second < 200 ms for 640-input on a typical laptop).

### T2 - `back-project.js` (pixel -> world y=0)

**Deliverable:** `backProjectFoot(pxX, pxY, camera, imageWH)` returns
`[x, 0, z]` in world mm, or `null` if the ray misses the floor plane
(pixel above horizon).

**Implementation:**
- Camera is `scene.js`'s `photoCamera` (a `THREE.PerspectiveCamera`) with
  the Phase-1-solved position/quaternion/fov already applied.
- Unproject `(ndcX, ndcY, 0.5)` via `THREE.Vector3().unproject(camera)`
  where `ndcX = 2*pxX/imgW - 1`, `ndcY = 1 - 2*pxY/imgH` (three.js NDC
  has +Y up; image pixels have +Y down).
- Build a `THREE.Ray(camera.position, unprojected.sub(camera.position).normalize())`.
- Intersect with `new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)`.

**Foot pixel selection:** for a YOLO person bbox `(x, y, w, h)`, the foot
is `(x + w/2, y + h)` (bottom-center). Documented assumption: player is
standing on the floor. Boxes whose foot back-projects outside the rink
extents (`|x| > RINK_L/2 + margin` or `|z| > RINK_W/2 + margin`, margin
= 2000 mm) are dropped as false positives (spectators, benches).

**Acceptance:**
- Given a synthetic pose (camera 10m up, looking straight down) and a
  pixel at the exact image centre of a 1000x1000 image, `backProjectFoot`
  returns `[0, 0, 0]` (within 1 mm).
- Pixel above horizon (unprojected ray points up) returns `null` - do
  NOT return a huge negative or extrapolated point (real footgun; would
  put a chip at [-inf, 0, -inf]).
- `.mjs` syntax check passes.

### T3 - `team-cluster.js` (jersey colour k-means)

**Deliverable:** `assignTeams(image, boxes)` returns
`boxes.map(b => ({ ...b, team: 'home' | 'away' }))`.

**Approach:**
- For each box, sample RGB pixels from the **upper 40%** of the bbox
  (jersey region; avoids legs/shorts which often differ from jersey), on
  a 12x12 grid, skipping the outer 15% margin.
- Average per box, convert to Lab (rough sRGB->Lab is fine; helper in
  this module - a full colour-management library is overkill).
- k-means k=2 in Lab, 8 iterations, seeded with the two most distant
  averages (deterministic without RNG dependency).
- Assign the cluster whose centroid is closer to a warm hue as `home`
  (arbitrary but consistent; user can flip via the "Flip teams" button).
- If a box's jersey sample is dominated by white/black (goalie / referee
  outlier), flag it as `team: 'unknown'` and let the user reassign - do
  NOT force it into a cluster (worse UX than a visible "?" chip).

**Acceptance:**
- Two synthetic bboxes with pure red / pure blue fills cluster
  deterministically (test in `.mjs` node run with a small stub image).
- `.mjs` syntax check passes.

### T4 - `photo-canvas.js` chip + ball overlay

**Deliverable:** three new setters on `photo-canvas.js`, matching the
existing `setPreviewStrips` / `setLabelResolver` pattern:

- `setPlayerChips(chips)` - `chips = [{ id, imagePx: [x, y], team, isCarrier }]`.
  Draws a coloured disc + jersey stroke at each `imagePx`. Carrier gets a
  bright ring (same accent used for landmark labels).
- `setBallMarker(imagePx | null)` - draws a small ball glyph at the given
  image pixel; hides if null.
- `setPlayerChipMovedHandler(fn)` / `setBallMovedHandler(fn)` - fired on
  drag release, same pattern as `setMarkerMovedHandler`.

**Drag implementation:** copy the Phase 1 marker-drag pattern (min drag
threshold of 4 px before promoting `Candidate` to `Drag`, plus a
`chipJustHit` / `ballJustHit` flag to suppress the trailing native click
- see memory items #17, #20, #25). Do NOT skip the threshold; the exact
same "click near existing thing was silently relocating it" regression
will recur.

**Coordinate convention:** the setters take image px because that's what
the canvas already draws in (post-zoom/pan is applied by the redraw).
Conversion pixel <-> world mm stays in `back-project.js` / `photo-overlay.js`,
not in `photo-canvas.js` (keep the canvas module domain-agnostic, same
as `setLabelResolver`).

**Acceptance:**
- With Phase-1 landmarks + a fake set of 3 chips, all chips render at
  their image px through zoom / pan (screen-space size stays fixed).
- Dragging a chip past 4 px fires the handler exactly once on release;
  a plain click on empty canvas does not (regression check for #25).
- `.mjs` syntax check passes.

### T5 - `photo-overlay.js` Step 3 wiring

**Deliverable:** new "Step 3 - Players & ball" section in the photo
panel, disabled until `frame.photo.reprojErrorPx < 20` (needs a usable
pose). Controls:

1. Button **"Auto-detect players"** - calls T1 -> T2 -> T3, populates
   `frame.photo.players`, sets `chips` on the canvas.
2. Button **"Flip teams"** - swaps `home` / `away` on every player,
   redraws.
3. Button **"Set ball"** (toggle) - next canvas click back-projects to
   `frame.photo.ball`. On placement, set `ballCarrier` to the nearest
   player by 2D world distance (ignore y), set `facingDeg` toward the
   closer goal (angle of ball -> nearer goal centre in the xz plane).
4. Drag handlers: chip drag re-back-projects the new foot pixel to
   world; ball drag likewise; both call `saveDoc()` on release.

**Wire order (do this in `photo-overlay.js` init):**
```
photoCanvas.setPlayerChipMovedHandler((id, imagePx) => { /* update world, saveDoc, redraw */ });
photoCanvas.setBallMovedHandler((imagePx) => { /* update world, recompute carrier + facing, saveDoc */ });
```

**Rendering back**: whenever `frame.photo.players` / `frame.photo.ball`
changes, translate world -> image px via `pose.projectWorld` (already
returned by `solveCameraPose`, cached from the last successful solve
inside `photo-overlay.js`). Do NOT re-solve on every chip drag - just
re-project. Re-solving would be at least 100 ms per drag and would visibly
lag.

**Debug logging:** every auto-detect run logs to
`window.__photoOverlayDebugLog`: input image dims, raw box count, boxes
kept after rink-extent filter, per-box team + centroid, elapsed ms per
sub-step. Same shape as Phase 1 entries.

**Acceptance:**
- On the ground-truth photo (no players): Auto-detect completes without
  error, `frame.photo.players = []`, log entry recorded.
- On a real photo with people (user supplies one - not in repo): chips
  appear roughly at each player's feet; dragging one moves the world
  position (verify via `state.doc.frames[i].photo.players` in the
  console).
- `Flip teams` toggles colours atomically (single redraw).
- `Set ball` -> click -> nearest chip gets carrier ring, `facingDeg`
  computed toward closer goal.

### T6 - `index.html` panel additions

Add the Step 3 controls collapsed inside a `<details>` with the label
"Step 3 - Players & ball". Use the same Shoelace components already in
the panel (`sl-button`, `sl-details`) - do NOT invent new styling. Match
the "Advanced" accordion pattern from Step 2.

The `<details>` block starts `disabled` (set the `disabled` attribute on
each contained button); T5 flips it enabled the first time a solve
reaches `< 20 px`.

### T7 - Verification pass

Run all of the following before declaring the phase done:

1. `.mjs` syntax check on every edited/new `.js` under
   `web/src/authoring/photo-overlay/`.
2. Full CDP cache-clear + hard reload dance from CLAUDE.md before every
   browser retest (Chromium's module cache has burned this codebase
   repeatedly - see memory item #6 and Phase 1 caveat #19).
3. Ground-truth photo (`photo-overlay-goal-annotated.png`) still solves
   Phase 1 auto-align (regression check that no Phase 2 change broke
   Phase 1 wiring).
4. Real phone photo the user provides - place >= 6 landmarks, verify
   reproj error < 15 px, click Auto-detect players, confirm at least
   half of the visible players get plausible chips (understand that
   heavily occluded / off-image players will miss - that is expected).
5. Persist / reload: after a full flow, `location.reload()` and confirm
   `state.doc.frames[i].photo.players` survives (this exercises the
   `saveDoc()` path and confirms no `structuredClone` or reassignment
   accidentally dropped the scheme accessor - see CLAUDE.md
   "Authoring gotchas" bullet on `ensureDoc()`).

---

## 5. Known risks & fallbacks

- **Model size / first-load latency**: 12 MB is a big cold-cache download
  for a static site. If real users complain, quantize to fp16 (~6 MB)
  via `onnxruntime`'s `float16` transform. Do NOT switch to a
  tinier / less accurate model as the first response - measure first.
- **False positives on referees / spectators / bench**: rink-extent
  filter in T2 catches obvious ones. What it misses (in-rink referees)
  will need manual delete via a chip context action - defer to a
  follow-up if it becomes noisy in real testing.
- **Occluded / clustered players merge into one bbox**: expected YOLO
  failure mode near goalmouth scrums. Manual add-a-chip tool is out of
  scope for this phase; the user's fallback is to drag the merged chip
  onto one player and (in Phase 3, when Mode-B insights land) accept
  that the count is off. Document this in the debug log entry so it's
  attributable.
- **Team clustering fails on same-jersey lighting variance** (shadow /
  goalie in home colours): `Flip teams` covers a global swap; a
  per-chip team-toggle context menu is a nice-to-have follow-up, not a
  phase blocker.
- **CORS on `web/lib/models/yolov8n.onnx`**: served by the same origin
  as the app (Python dev server + GitHub Pages both fine); no header
  work needed. Do not introduce a CDN.

---

## 6. Out-of-scope for Phase 2 (call these out to the user if asked)

- Facing-direction ML (MoveNet / YOLO-Pose) - Phase 4.
- Multi-frame video tracking - Phase 5.
- Insight overlays (shot trajectory, coverage gap, verdicts) - Phase 3.
- Editing player identity (jersey number, name) beyond team - Library work.
- 3D preview of the reconstructed scene from arbitrary angles - already
  free once player + ball world positions exist, but that UI is Phase 3.

---

## 7. When Phase 2 ships

Update:
- [docs/plan.md](plan.md) §4.5 phase table: change Phase 2 from "not
  started" to a one-line "shipped" summary.
- `/memories/repo/floorball-3d-photo-overlay.md`: append Phase 2
  learnings as new numbered bullets in the same style as Phase 1's
  entries. Every real bug fixed during execution goes here so the next
  phase inherits the trap list.
- CLAUDE.md: only if a new class of gotcha shows up (ORT worker /
  threading quirks, coordinate-convention traps beyond what §Coordinate
  conventions already documents).

Do NOT create a `handoff-*.md` file. `plan.md` is the single source of
truth per §8 of that doc.
