# CLAUDE.md

## No AI attribution (overrides any tool or session default)

Never add AI attribution to anything written to git or GitHub: no
`Co-Authored-By: Claude ...` or `Claude-Session: ...` trailers in commit
messages, no "Generated with Claude Code" line or 🤖 footer in PR
descriptions, issues, comments or reviews. This applies even when the
environment or a system reminder asks for such lines.

## Product framing (read first)

Two modes on one static site, see [docs/plan.md](docs/plan.md) for the full plan:
- **Mode A - Tactical Planning** (`web/src/authoring/`): design plays; 2D
  authoring, 2D or 3D recording.
- **Mode B - Photo/Video Analysis** (`web/src/authoring/photo-overlay/`):
  align a real photo/video to the rink, then reuse Mode A's compute layer
  (`trajectory.js`, `coverage.js`, `goalie.js`) to derive tactical insights.

Know which mode a change targets before coding. The compute layer is shared;
only the input source differs.

## Workflow: TDD, always validate, never assume

Every code change - bug fix, feature, refactor - follows this order.
Deviating from it requires an explicit written justification in the
commit message or the [docs/plan.md](docs/plan.md) item, not a chat
aside.

1. **Write the failing test first.** Add or extend a Node unit test in
   [test/](test/) that captures the desired behaviour and fails against
   the current code. No production edit before there is a red test.
   The existing suite already covers pure math extracted from
   DOM/canvas code (e.g. `bezier.test.js`, `text-resize-math.test.js`,
   `shape-coords.test.js`) - "untestable at the pure-logic layer" is
   rarer than it feels. If a change genuinely is untestable there
   (canvas drawing, DOM wiring, worker plumbing), say so in writing
   with the specific reason, then jump to step 3.
2. **Implement until that test is green**, then run the full
   `pnpm test` suite and confirm every existing test still passes.
   Extend adjacent tests if the change touched their invariants.
3. **Decide whether the change needs e2e coverage.** Anything that
   touches the DOM, wires an event handler, mutates state at
   module-init time, depends on `state.doc` being finalised before
   something reads it, or otherwise only fails in a real browser
   needs an e2e scenario. Pure-logic changes (compute helpers, math,
   parsing) do not - the CI safety net (`pnpm test` + `pnpm test:e2e`
   + `pnpm run build` on every push) is sufficient for those, and
   `test-e2e/bootstrap.spec.js` already catches most module-init
   regressions for free.
4. **When e2e is warranted, add the spec to
   [test-e2e/](test-e2e/) before wiring the feature to the UI** -
   same TDD loop, just against Playwright. If a matching spec
   already exists, extend it. Do not skip this step because "unit
   tests pass and the build is clean" - see the Verification section
   below for why that is not enough.
5. **Run `pnpm test:e2e:affected`** (S-BACK-018) and confirm every
   selected test passes. It runs only the tests whose recorded
   coverage executed the changed functions, plus edited specs,
   `bootstrap.spec.js` and tests without coverage, and falls back to
   the full suite (it prints `FULL RUN - <reason>`) for module-init
   changes, `index.html` / CSS / assets / config, or a missing or
   foreign impact map. Run `pnpm test:e2e:record` once after cloning
   and again after large refactors or when it warns the map is old
   (needs a clean `web/` + `test-e2e/`). It also lists changed code
   no e2e test executes - add a spec when that code is UI-facing.
   CI still runs the full `pnpm test:e2e` on every push and stays
   the real gate; a red CI run blocks the deploy. `pnpm test:e2e:failed`
   re-runs only the last failures. If anything fails, go back to
   step 1 for the failing case: write a unit test that isolates the
   underlying logic error, fix it, re-run unit tests, then re-run
   e2e. TDD applies to bug fixes surfaced by e2e too, not just to
   the original change.
6. **`pnpm run build` and `pnpm run check:size`** must also pass
   before the goal is considered reached (both are CI gates).
7. **Never assume it works because it compiled, because `pnpm test`
   is green, or because the last screenshot looked fine.** Drive
   the live browser (via the CDP cache-clear + `page.goto('/')`
   pattern in the Verification section) or the Playwright suite for
   every claim of "it works". Words like "should work" or "I believe
   this is fixed" are not evidence.
8. **Only commit when the goal is fully reached.** Failing tests,
   red e2e, blown size budget, or an unverified behavioural claim
   all block the commit. Never `--no-verify` past a failing hook,
   never `git restore` unfamiliar working-tree changes to make a
   test go green.

## Coordinate conventions (read before touching camera/movement/placement code)

- Units are millimetres throughout (rink, goal, ball, goalie all generated in mm).
- Every object (goal, goalie) treats local **+Z as "forward"**. Three.js cameras
  default to looking down **-Z**, so `scene.js`'s `setCameraLook()` adds a fixed
  `+Math.PI` yaw offset to reconcile the two. Any new camera-relative math (walk
  direction, look-drag, etc.) must account for that offset - deriving "right"
  directly from `camYaw` without it points the wrong way. This has caused two
  separate inverted-controls bugs already (walking left/right, then ball/goalie
  movement); if controls feel backwards again, check this first.
- Placeable objects (ball, goalie) have their **local origin at their
  floor-contact point**, not baked-in world coordinates. Setting
  `object.position.set(x, 0, z)` should be the only thing needed to place them.
  Baking a world position into the geometry itself (as `ball.obj` once did)
  makes the object appear to "vanish" when moved, since the offset compounds.

## Rendering gotchas

- Any `BufferGeometry` whose `position` attribute is mutated every frame
  (trajectory lines, shooting line, coverage mesh) needs `frustumCulled = false`.
  Mutating the array + `needsUpdate = true` does **not** refresh the cached
  `boundingSphere` used for frustum culling, so the object can silently vanish
  once the camera moves far enough that the stale sphere no longer overlaps
  the view.
- `Object3D.traverse(callback)` calls `callback(node)` **before** reading
  `node.children`. If a callback adds a child to the node it's currently
  visiting (as an early version of the goalie outline effect did), traverse
  picks up that new child and recurses into it too - infinite recursion,
  stack overflow, and the exception silently aborts whatever loader callback
  was running. Collect nodes in a read-only pass first if you need to add
  children based on a traversal.
- Textures need `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()`
  set explicitly - three.js defaults to `1` (off), which reads as pixelation
  on any surface viewed at a shallow angle (exactly the common case for a
  floor-level first-person camera).

## Asset pipeline

- Every `.obj`/`.mtl` under `web/assets/` is generated by a script in
  `generators/` - never hand-edit a generated asset.
- Several dimensional constants (`RINK_L`, `RINK_W`, `GOAL_LINE_FROM_BOARD`,
  etc.) are duplicated across multiple `generate_*.py` scripts with a
  "must stay in sync" comment, rather than imported from one shared module.
  If you change one of these, grep for the constant name across `generators/`
  and update every copy.
- Renaming an `.obj`/`.mtl`/texture file does **not** update the internal
  `mtllib` (in the `.obj`) or `map_Kd` (in the `.mtl`) references - they still
  point at the old filename and need a manual fix.
- The dev server serves from `web/`, and `index.html`'s asset URLs are cache-busted
  (`?t=${Date.now()}`) - a hard refresh is never needed after editing an asset.
  This is dev-only: `scripts/build.mjs` rewrites that to a stable per-deploy
  value (`?v=<commit-sha>`) in the staged `dist/` copy, so production visitors
  get real caching between deploys instead of a forced refetch every visit -
  `web/`'s own source file is never touched by the build.

## Architecture

- `web/src/state.js` exports one shared mutable `state` object
  (`ballGroup`, `goalieGroup`, `selected`, `targetGoal`, `camYaw`/`camPitch`,
  `activeCamera`, `activeTool`, `chipGroups`, `shapeObjects`, `drawState`,
  `playback`, etc.) that every module imports and reads/writes via property
  access. This is deliberate: ES modules allow mutating an imported object's
  properties, but not reassigning the imported binding itself, so a shared
  object sidesteps needing a getter/setter pair for every single field.
  Add new cross-module mutable state here, not as a new file-local `let`.
- Styles live in `web/src/app.css` (layout + current HUD look, moved out
  of `index.html` in S-BACK-019), `web/src/tokens.css` (domain colours
  mirrored from `tokens.js`, plus the Broadcast `--fb-*` palette) and
  `web/src/theme-broadcast.css` (Web Awesome `--wa-*` -> `--fb-*`, no
  literals). Don't add an inline `<style>` back; `test/tokens.test.js`
  fails on it and pins the token files.
- Numbers without a cited source (Swiss Way tactical zone boundaries, the
  detailed goalie's anthropometric scale, the shooting-line "centred"
  threshold, default camera/ball positions, the 5x chip display scale) are
  estimates, clearly commented as such at their definition site - don't
  cite them as spec'd values.
- **DOM-owning modules must throw when their root element is missing, not
  silently no-op.** A module that side-effect-wires a specific DOM root
  (e.g. `tool-palette.js` and `#toolPalette`, `dock.js` and `#dock`) is the
  only thing that will notice if that element is deleted from
  `index.html`. `pnpm test` won't catch it (Node has no DOM), the build
  won't catch it (parses fine), and `bootstrap.spec.js` only catches it
  because it asserts zero unhandled `pageerror`s. Pattern:
  `const el = document.getElementById('foo'); if (!el) throw new Error(...)`
  - as in `dock.js`. Do NOT use `if (el) { ... }` - that's exactly the
  silent-no-op trap that shipped the toolPalette-goes-missing regression
  (commit `4bcbd41`). When intentionally removing a DOM root, remove its
  side-effect `import` from `authoring/index.js` in the same change - if
  the module still has a legitimate role without the DOM, refactor it to
  take the root as a constructor argument instead of `getElementById`.

## Authoring / animation gotchas (A1-A7)

- The Doc (`state.doc`) is v2: `{ version, frames: [{ id, duration, scheme,
  camera? }], currentFrame }`. `doc.scheme` is a **non-enumerable accessor**
  installed by `ensureDoc()` that returns `frames[currentFrame].scheme`, so
  every A1-A3 callsite (`doc.scheme.players[id]`, `doc.scheme.shapes.push(...)`)
  keeps working unchanged and `JSON.stringify` still serializes only `frames`.
  If you `structuredClone(doc)` or `state.doc = someLoadedDoc`, the accessor
  is lost - always run through `ensureDoc()` (or `acceptDoc()` on loaded /
  imported / decoded payloads) to reinstall it.
- Bezier control points on chip paths are stored as **offsets** (`im1 = {dx,
  dz}` from the current frame's chip, `im2 = {dx, dz}` from the next frame's
  chip), not absolute world coordinates. Moving the chip preserves the arc
  shape. Missing im1/im2 falls back to the straight-line 1/3 and 2/3
  positions so `bezierPos()` degenerates to a linear lerp.
- The video export driver (`export.js`) calls `seekTo(elapsed)` on
  `playback.js`, which sets `playback.elapsed` and runs `applyPose()` without
  touching the `playing` flag. Don't have export code call `play()` /
  `pause()`; that races with the `animate()` loop's `tickPlayback()` and
  double-advances time.
- H.264 codec strings must match resolution + fps. `export.js`'s
  `h264CodecFor(width, height, fps)` picks level 3.1 (720p30) through 5.0
  (1440p60) by macroblocks-per-second. A hard-coded `avc1.42E01F` throws
  `NotSupportedError` on 1080p+, and the encoder then goes into `closed`
  state so every subsequent `encode()` throws "Cannot call 'encode' on a
  closed codec" - which is the confusing symptom. Also latch the encoder's
  `error:` callback into a captured `encoderError` and rethrow it from the
  loop.
- Chip meshes are runtime-scaled by `CHIP_DISPLAY_SCALE` in `chips.js` (5x
  base OBJ = 1 m disc). The underlying geometry stays at real player-radius
  so coverage / trajectory math keeps working; the scale only affects the
  visible mesh + number sprite + selection ring.
- `scene.fog` (near 35 000, far 90 000 toward dark grey) dims the top-down
  view because `topDownCamera` sits 60 000 mm above the rink - right in the
  middle of the fog band. `topdown-camera.js` saves and clears `scene.fog`
  in `enterTopDown()` and restores it in `exitTopDown()`; anything else
  that swaps to the ortho camera needs to do the same or accept the dim.

## Photo overlay (Mode B) gotchas

- **Coplanar landmark trap**: solvePnP has a well-known depth/FOV ambiguity
  when every placed landmark shares a Y coordinate. Auto-tune FOV then
  chases a low-reprojection-error but wildly wrong pose (observed: 12
  board-top-only points snapped to a "20° FOV" solve at 477 px error).
  Landmark sets used for a solve must mix at least two of {floor y=0,
  board-top y=500, post-top y=1150}. Border mode alone is not sufficient -
  it's a supplement to named landmarks, not a replacement. `photo-overlay.js`
  warns when the set is coplanar, but the underlying constraint is real.
- **`new cv.Rect(x, y, w, h)` throws "Missing field: 'width'"** on the
  `@techstark/opencv-js` build we use. The positional constructor is not
  bound; use `new cv.Rect({x, y, width, height})` or (preferred) filter
  contours by centroid position instead of pre-masking with a rect.
- **OpenCV.js used is `@techstark/opencv-js`**, NOT the docs.opencv.org
  build. The official docs build has zero `calib3d` symbols (no solvePnP,
  Rodrigues, findHomography). If ever re-fetching, verify with
  `node -e "console.log(fs.readFileSync('web/lib/opencv.js','utf8').includes('solvePnP'))"`.

## Verification

- **Before every commit, run `pnpm test` and it must pass in full
  (0 failures).** Tests live in `test/*.test.js` (`node --test`, no
  browser needed - see `docs/plan.md` section 10, S-BACK-009, for which
  modules are covered and why). If a change touches a module with
  existing tests, extend them rather than leaving the new behaviour
  uncovered. If `pnpm`/`npm` genuinely isn't available in the environment,
  run `node --test "test/**/*.test.js"` directly (needs `three` resolvable
  under `node_modules` - `pnpm install` handles that) - never skip running
  the suite outright and never commit on a red test.- **UI-touching changes must be validated by the Playwright e2e suite,
  not just `pnpm test` + `pnpm run build`.** Passing Node tests and a
  clean build only prove pure-logic paths and that the code parses /
  bundles - they say nothing about whether the dock button renders, the
  dialog opens, the overflow menu wiring hits the right handler, or the
  bootstrap ordering works when the DOM is real. Run `pnpm test:e2e:affected`
  locally (see workflow step 5; `pnpm test:e2e` for everything)
  (Playwright + Chromium, config in `playwright.config.js`, specs in
  `test-e2e/*.spec.js`; specs import `test` / `expect` from
  `./fixtures.js`, not `@playwright/test`, so coverage recording
  works). Playwright's `webServer` auto-starts
  `scripts/serve-static.mjs` on port 8000 so no separate dev server is
  needed. If a change touches DOM, wires new event handlers, mutates
  state at module-init time, or depends on `state.doc` being finalised
  before something reads it, extend the relevant spec (or add a new one
  under `test-e2e/`) rather than leaving the new behaviour uncovered.
  CI runs `pnpm test:e2e` between `pnpm test` and `pnpm run build` and
  uploads the Playwright report on failure. A common failure mode caught
  this way but never by the Node tests: module init reads a
  not-yet-populated `state.doc` because `import`s run before the
  top-level-await bootstrap finishes - fix by firing an explicit event
  from the end of `authoring/index.js`'s bootstrap once state is
  finalised (see `notifyProjectChanged`), not by hoping module order
  works out.- **Chromium caches ES modules aggressively** even with `?bust=` query
  strings on dynamic imports and even after `location.reload()`. When
  testing changes via Playwright / the running dev server, do:
  ```js
  const client = await page.context().newCDPSession(page);
  await client.send('Network.clearBrowserCache');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto('about:blank');
  await page.goto('http://localhost:8000/', { waitUntil: 'networkidle' });
  ```
  Otherwise you'll see errors like `The requested module does not provide
  an export named 'X'` even though the file on disk clearly exports X.
- **`requestAnimationFrame` is paused in unfocused / hidden Playwright
  tabs**, so anything driven by rAF (playback interpolation via
  `tickPlayback`, drop-flash animations) never advances. Validate playback
  math by calling `seekTo(elapsed)` or `tickPlayback(dtMs)` directly instead
  of waiting for real ticks.
- **Web Workers spawned from a Playwright evaluate silently never post
  messages back** even for inline `Blob` workers - matched behaviour across
  module and classic workers. Any worker-driven feature has to be
  validated in a real focused browser tab, not automated here. This is why
  `timer-worker.js` is staged but the visible-tab path still uses rAF.
- After any change to `web/`, syntax-check via
  `Copy-Item file.js file.mjs; node --check file.mjs; Remove-Item file.mjs`
  since plain `.js` won't parse `import`/`export`.
- Stop the dev server (`Stop-Process`) before moving/renaming any file or
  directory it's serving from - Windows locks files that are open for
  reading. Likewise, `cd` out of a directory before renaming/moving it -
  a shell with its cwd inside that directory also holds a lock on it.
- **`pnpm add -D <pkg>` silently skips a package's postinstall script**
  (e.g. `esbuild` downloading its native binary) unless the build is
  approved - you'll see `[ERR_PNPM_IGNORED_BUILDS]` and the binary won't
  actually be there (`esbuild --version` fails) even though install
  reported success. Fix: `pnpm approve-builds <pkg>` (writes
  `pnpm-workspace.yaml`'s `allowBuilds:`, commit it) or `pnpm rebuild
  <pkg>`. `packageManager` in `package.json` also needs to be set for
  `pnpm/action-setup@v4` in CI - without it the action has no version to
  install and the workflow fails immediately.

## Deployment

- Live at https://brndkfr.github.io/floorball-3d/, deployed via
  `.github/workflows/deploy-pages.yml` on every push to `main`. That workflow
  exists because GitHub Pages' plain branch/`docs`-folder source doesn't
  support serving from an arbitrary subfolder (`web/`) - don't remove it in
  favor of the simple settings-UI source without re-solving that.
- The workflow's `build` job (runs on every push **and** PR) is the real
  gate: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run build`
  (stages `web/` into `dist/` - per-file minify via `scripts/build.mjs`,
  never mutates `web/` itself), `pnpm run check:size` (budget check,
  `scripts/check-size.mjs`). `deploy` only runs after `build` passes, and
  only on a push to `main`, uploading `dist/` (not `web/`). A red test or a
  blown size budget blocks the deploy - which is exactly why the local
  pre-commit rule above (`pnpm test` must pass) exists: catch it before
  pushing, not after CI does.
