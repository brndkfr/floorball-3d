# S-BACK-029 - Security and performance audit (2026-10)

Status: in-progress. External audit of `main` at `064e49a` (7 Oct 2026),
read-only: nothing was run in a browser, so performance figures are
estimates from code paths, not profiles. Line numbers refer to that
commit. Each fix starts by confirming the finding with a failing test
(CLAUDE.md workflow); a finding that does not reproduce is marked
`[dropped]` here with the reason.

Finding IDs (H1, M1, L1, ...) are the audit's own and stay stable;
commits and PRs cite them as `S-BACK-029 H1`.

Overall: no critical findings, 4 high, 9 medium, 10 low. Attack
surface is share links, imported JSON, uploaded photos and the CI /
Pages pipeline (no server, no multiplayer). XSS hygiene was rated good
(user strings via `textContent`, ids regex-validated, no `eval`).

## High - shipped 2026-10-15

- **H1** [shipped, PR #13] **Preview artifact poisoning.** `pages.yml` resolves a
  preview's `site` artifact with `gh run list --branch "$branch"`, which
  matches the head branch name only. A fork PR with a colliding branch
  name can get its build published at `/preview/<slug>/` on the
  production origin. Fix: carry `headRefOid` from `gh pr list`, resolve
  the run by `--commit "$sha"`, and check the run's
  `head_repository.full_name` equals `$GITHUB_REPOSITORY`. Pin in
  `test/deploy-workflow.test.js`.
- **H2** [shipped, PR #14] **Poisoned share link bricks the app.**
  `sanitizeDoc()` (`doc.js`) checks only id strings; types, array
  shapes, enums and string lengths are trusted. A crafted `#doc=` link
  passes `acceptDoc()`, is saved as the current project, then throws in
  `rebuildShapesFromDoc()` during the top-level-await boot, on every
  reload. Examples: a zone without `points`, `"layer":"x"`,
  `"label":5`, a player value of `null`. Also `inflateRaw()`
  (`share.js`) has no output cap (deflate ~1000:1), and a long text
  label gives an unbounded canvas width in `makeTextSprite()`.
  Fix: (a) cap inflated size, (b) structural validation in
  `sanitizeDoc()` (drop invalid entries, reject a doc without a frames
  array), (c) a boot-time try around the rebuilds that sets the bad
  project aside and starts a fresh one. Unit tests for (a) and (b), an
  e2e that a poisoned link still boots for (c).
- **H3** [shipped, PR #15] **CanvasTexture leak on label meshes.**
  `disposeObject()` (`shapes.js`) frees `material.map` only for
  sprites; arrow and zone labels are meshes with a CanvasTexture.
  Leaks on every `updateShape()`, undo / redo, frame switch and each
  opacity-slider input event. Fix: one shared `disposeMaterial()` that
  frees maps on any material (reuse in `draw-tool.js` `clearPreview()`
  and `selection.js`), and coalesce slider input to one update per
  animation frame.
- **H4** [shipped, PR #17] **Ungated per-frame goalie raycast.** With trajectories
  on, `updateTrajectory()` runs `shotVerdict()` every frame: a recursive
  raycast against the ~10k-triangle goalie, plus a new Vector3, a
  `clone()` and a hit array per call. Fix: dirty-check the inputs like
  `coverage.js` `coverageInputsChanged`, reuse scratch objects, return
  whether anything changed so `main.js` can gate the render.

## Medium

- **M1** [shipped, PR #18] **Pass-lane tunnelling** (`ball-pose.js`). 16 point
  samples with a 400 mm radius miss a defender standing on the lane once
  the pass is longer than ~12.8 m; Mode B's `passOptions()` uses an
  exact perpendicular distance, so the modes can disagree. Fix: swept
  closest-approach per sub-interval. Test first: a 20 m pass with a
  stationary defender on the lane at s = 1.5/16 must be blocked.
  Ranked with B-BACK-011 because passing alternatives lead the demo.
- **M2** [open] Draw preview rebuilt every frame while drawing
  (`draw-tool.js` `updateDrawPreview()`): new geometries and one
  material per corner dot at 60 Hz. Update in place.
- **M3** [open] `tickPassOverlay()` (`pass-overlay.js`) runs
  `liveScheme()`, `passPlan()` and a `JSON.stringify` key every idle
  frame; `updateTrail()` builds a new arrow geometry per playback frame.
  Key off doc revision + drag state; index chips by id in a Map.
- **M4** [open] `updateGoalieLabel()` (`coverage.js`) projects with the
  perspective camera, not `state.activeCamera` (wrong position in 2D),
  and writes `style.left/top/textContent` every frame. Use the active
  camera; skip unchanged writes.
- **M5** -> folded into **S-BACK-024** (tickActors writes render state
  back into the doc).
- **M6** [open] Every labelled preview is published on the production
  origin, so preview code can read and modify production localStorage
  and IndexedDB (and all `brndkfr.github.io/*` project pages share that
  origin). Fix: previews on a separate origin. Until then: label PRs
  `preview` only when needed.
- **M7** [shipped 2026-10-16] Actions pinned to mutable major tags, including
  third-party `pnpm/action-setup` in the job with `pages: write` and
  `id-token: write`. Pin to full commit SHAs; add `dependabot.yml` for
  `github-actions` and `npm`.
- **M8** [open] 2D export stretched: `applyRendererSize()`
  (`export.js`) updates only the perspective camera aspect; the
  top-down frustum keeps the window aspect. Fit the frustum to the
  export aspect and restore afterwards.
- **M9** [open] The last analysed match photo stays in IndexedDB
  (`photo-cache.js`) with no expiry; for a U14 team that is a photo of
  minors, readable by any page on the origin (see M6). Add a visible
  "Forget photo" control (`clearCachedPhoto()` exists) and an expiry.

- **C1** [open] **Coverage can stay one move stale** (found while fixing
  H4, not in the audit). `coverage.js` skips its 221-ray pass when no
  input changed, but raycasts the goalie's cached `matrixWorld`, which
  is only refreshed on render. If the frame that moves the goalie is
  the one that computes, the result uses the old pose and then sticks.
  Fix as in `trajectory.js`: `updateMatrixWorld(true)` on goal and
  goalie before the pass; e2e as in `trajectory.spec.js`.

## Low

- **L1** [open] `history.apply()` deselects via `import().then()` after
  the synchronous rebuild; use a static import.
- **L2** [open] Per-frame allocations in `main.js` (render-state object,
  `map().join()`) and in coverage updates. Overlaps S-BACK-027.
- **L3** -> folded into the B-BACK-011 follow-ups: insights raycast the
  rendered goalie mesh, so results depend on which model is loaded; use
  an analytic proxy like Mode B's `goalie-proxy.js`.
- **L4** -> folded into **S-BACK-023** (`@ts-check` + JSDoc doc schema).
  Also: pointer-to-NDC uses `window.innerWidth` in `selection.js` but
  `getBoundingClientRect()` in `pass-overlay.js`.
- **L5** [open] `web/lib/` vendored libraries have no version / hash
  manifest (three r160, ONNX Runtime Web 1.19.2, opencv.js unrecorded,
  mp4-muxer). Add `web/lib/VENDORED.md` with SHA-256 checked in CI;
  plan a three.js upgrade.
- **L6** [shipped 2026-10-16, `web/lib/` ignored as vendored] No `dependabot.yml`; CodeQL default suite (use
  `security-extended`) with a stale ignore path (`web/lib/webawesome`);
  CI checkout keeps the read-only token (`persist-credentials: false`).
- **L7** [open] `photo-overlay/detect.js` frees OpenCV Mats manually
  with no try/finally; an exception leaks ~12 MB working images into
  WASM memory. Wrap in a `withMats()` scope as `pnp.js` does.
- **L8** [open] No `webglcontextlost` / `webglcontextrestored` handler
  in `scene.js`; the canvas stays black after a context loss.
- **L9** [open] `exportMp4()` has no try/finally; an error leaves the
  renderer at export size and the encoder open.
- **L10** [open] Two copies of `loadOrt()` (`detect-players.js`,
  `detect-pose.js`) can inject `ort.min.js` twice. Share one loader.
  Overlaps S-BACK-026.
- **EXIF** [open] `exif.js` accepts a focal length of 0, giving a 180°
  FOV and a degenerate camera. Reject non-positive focal lengths.
- **CSP** [open] No Content-Security-Policy. Add a `<meta>` CSP
  (`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src
  'self' blob: data:`), verified against the ONNX and OpenCV loaders.

## Order for what is left

1. Privacy: M9, M6 (M6 needs a hosting decision).
2. Pipeline: L5 (M7, L6 shipped).
3. C1 (coverage staleness).
4. Robustness: M8 + L9 (export), L7, L10, L8, EXIF.
5. Frame time: M4, M2, M3, L2 (with S-BACK-027).
6. Hardening: CSP, L1.

## Not reviewed by the audit

`timer-worker.js` (since removed, unused), most of `photo-overlay.js` UI wiring, known CVEs in
the vendored library versions, the asset generators.
