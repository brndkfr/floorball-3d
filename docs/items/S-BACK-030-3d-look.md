# S-BACK-030 - 3D look: arena, light, shadows, materials

Status: in progress (steps 0 to 3 and 6 done, 8 half done, all on
2026-11-14, branch `look-and-motion`). Review of 2026-11-14 (screenshots of the 3D view at
1440 x 900, figures on, six chips, both goalies).

Step tags: `[small]` = a smaller model can do it from this text alone.
`[lead]` = needs a strong model that can look at screenshots, or the
user's eye. Every step is one PR and follows the TDD workflow in
[CLAUDE.md](../../CLAUDE.md): failing test first, then the code, then
`pnpm test`, the affected e2e specs, build and size check.

## What the 3D view looked like before (2026-11-14)

- **Empty hall.** `scene.background` and the fog are the same dark grey
  (`0x1b1b1f`), so everything above the boards is a black void. At the
  default camera the rink is a thin blue band and about 40 % of the
  stage is empty.
- **No grounding.** No shadows of any kind: figures, goalie and ball
  float on the floor.
- **Flat floor.** One `MeshStandardMaterial` colour (`0x1a59ad`,
  roughness 0.85), no texture, no reflection.
- **Black boards.** `rink.mtl` `Board` is `Kd 0.03`. Real boards are
  mostly white; black reads as a hole next to the dark background.
- **Glossy goalie.** `goalie_02.mtl` has `Ns 250`, `Ks 0.5`: the goalie
  looks like wet plastic. (Replaced for good by A-BACK-042.)
- **Board-game figures.** Each figure stands on a 1 m team-coloured
  disc (the chip at `CHIP_DISPLAY_SCALE` 5) with a number sprite
  floating above it that grows huge when the camera is close.
- **No tone mapping**, default lights (hemisphere 1.15, key 1.1, fill
  0.35), no environment map.

## Rules for every step

- Top-down 2D and Mode B photo-lock must look exactly as before. New
  3D-only objects follow the `surroundFloor` pattern: hidden in
  `enterTopDown()` and in `photo-overlay/view.js` while photo-locked.
- The render gate (S-BACK-011, `main.js`) must keep working: nothing
  new may need a render every frame while the scene is still.
- Low tier (`pickRendererQuality()` returns `tier: 'low'`) gets the
  cheap variant named in each step.
- New constants are look-based estimates: comment them as such.
- MP4 export renders the same scene, so check one exported frame too.

## Steps

0. `[done 2026-11-14, branch look-and-motion]`
   **Look-shots script.** `pnpm run look` (`scripts/look-shots.mjs`)
   opens the app in Playwright Chromium, clicks "New play", spawns six
   chips, switches figures on and saves six views (`default`,
   `players`, `goalie-a`, `shooter`, `behind-goal-b`, `top-down`) to
   `test-results/look/`. `-- --out <name>` writes to a subfolder,
   `-- --at <ms>` calls `seekTo()` first. Reuses a dev server on port
   8000 or starts one. Not a test and not in CI (no unit test: it is
   Playwright plumbing only). The state before any look change is in
   `test-results/look/before/` (local, git-ignored). Still open: a
   `--doc <file.json>` option to load a saved play, needed for the
   A-BACK-041 moves.
1. `[done 2026-11-14]` **Tone mapping and light.** As built: ACES
   with `TONE_EXPOSURE` 1.15 (estimate), switched in
   `setActiveCamera()` so it is on only for the perspective camera;
   top-down and photo-lock keep `NoToneMapping` and their old colours.
   `LIGHTING_3D` not retuned yet. Pinned by `look-3d.spec.js`.
   Original text: In `scene.js`:
   `renderer.toneMapping = THREE.ACESFilmicToneMapping`, exposure as a
   named constant; retune `LIGHTING_3D` so white markings do not clip
   and team colours stay recognisable. `LIGHTING_2D` must still give
   flat diagram colours: tone mapping changes them, so either compare
   top-down look-shots before / after and retune, or switch tone
   mapping off in `setFlatLighting(true)`. Unit test: none (renderer
   state); say so in the PR. e2e: `bootstrap.spec.js` stays green.
2. `[done 2026-11-14]` **Background and fog.** As built, different
   from the text below: a flat slate background (`HALL_BACKGROUND`
   `0x2b313d`) with fog in the same colour (45 to 140 m) and a large
   `hallFloor` plane around the rink, perspective camera only. No
   gradient: a `scene.background` texture is screen-fixed and does not
   follow the camera pitch, and a gradient dome gave no clear gain.
   The ceiling comes with step 7. Flat lighting swaps back to
   `0x1b1b1f`. Original text: Replace the flat background with
   a vertical gradient (small `CanvasTexture` on `scene.background`,
   dark top, lighter near the horizon) and retune the fog so the far
   boards stay readable from a goal-end camera. Keep the
   `topdown-camera.js` fog save / restore.
3. `[done 2026-11-14]` **Blob shadows.** As built: math in
   `web/src/blob-shadow-math.js` (`blobRadiusFor`, `blobAt`: a ball in
   the air gets a wider, fainter shadow), scene part in
   `blob-shadow.js`. Pooled quads in their own group `blobShadows`,
   not parented to the actors (coverage raycasts the goalie mesh,
   selection boxes every selectable), `raycast` switched off, moved by
   `tickBlobShadows()` from `main.js`, which reports a change to the
   render gate. Tests: `blob-shadow.test.js`, `blob-shadow.spec.js`.
   Original text: A shared radial-gradient texture on a
   flat quad (y = 2 mm, `depthWrite: false`) under every figure, both
   goalies and every ball. One helper `web/src/blob-shadow.js`
   (`makeBlobShadow(radiusMm)`), pure sizing math in the same file so
   it is Node-testable (`blobRadiusFor(kind)`). Hidden in top-down.
   This is the low-tier shadow and the fallback for everyone.
4. `[lead]` **Real shadow map (high tier only).** One
   `DirectionalLight` shadow, 2048 px, orthographic shadow camera fitted
   to the rink (40 x 20 m plus margin), `PCFSoftShadowMap`. Set
   `renderer.shadowMap.autoUpdate = false` and set
   `shadowMap.needsUpdate = true` only on frames `main.js` decides to
   render. Floor receives, figures / goalies / goals / ball cast.
   When this is on, fade the blob shadows from step 3 to ~40 %.
   Check frame time before / after with 12 figures on an integrated
   GPU; if it costs more than ~3 ms, leave it off by default.
5. `[small]` **Floor.** Procedural `CanvasTexture` for the playing
   surface (subtle tile seams and noise, no image file), roughness
   ~0.6, plus a `RoomEnvironment` PMREM as `scene.environment` on the
   high tier for a soft sheen on floor, ball and helmet. Set
   `texture.anisotropy` (CLAUDE.md, rendering gotchas).
6. `[done 2026-11-14]` **Boards.** As built: `Board` `Kd 0.90 0.90
   0.88`, new material `BoardRail` (top 60 mm, `Kd 0.10 0.10 0.12`),
   `layers.js` sets both double-sided. Tests: `rink-asset.test.js`,
   `look-3d.spec.js`. Original text: White boards with a darker top rail: change
   the `Board` colour in `generators/generate_rink.py` (never edit
   `rink.mtl` by hand) and re-run it. Board colour is an estimate.
7. `[lead]` **Arena shell.** New `generators/generate_arena.py` ->
   `web/assets/arena.obj/.mtl` (or GLB once S-BACK-026 has the
   packer): hall floor around the rink, four walls ~8 m, a stepped
   stand on one long side, substitution benches on the other, ceiling
   with light panels. Under 3,000 triangles, vertex or flat colours,
   no textures. Loaded after first paint, own "Arena" checkbox in the
   View panel, hidden in top-down and photo-lock. Coordinate with
   A-BACK-028 to 030 (board slots, floor logo): the arena must not
   occupy the board faces or the floor area those items use.
8. `[half done 2026-11-14]` **Figures off the game pieces.** Done:
   `CHIP_DISPLAY_SCALE` 5 to 3.5, so the disc is 0.7 m everywhere (2D
   too; user decision); with figures on, `figures.js` `setFootprint()`
   hides the disc meshes and shows a team-coloured ring (radius
   300 mm, 40 mm wide, `figureRingRadii()` in `figure-math.js`). The
   hidden disc stays the click and drag target. Everything sized from
   the display radius shrank with it (selection ring, pass arrow trim,
   photo footprint). Open, `[small]`: the number sprite clamp
   (`spriteScaleFor`, below). Original text: When figures show in 3D:
   replace the visible 1 m disc with a thin team-coloured floor ring
   (~600 mm, estimate); keep the disc geometry as an invisible
   hit-test collider so selection and drag are unchanged
   (`chipUnderCursor` in `selection.js`). Number sprite: clamp its
   on-screen size (pure helper `spriteScaleFor(distanceMm, fov,
   viewportH)` with a test) so it no longer balloons near the camera.
   The number on the jersey itself is A-BACK-033.
9. `[small]` **Goalie gloss (interim).** In `goalie.js` after
   `materials.preload()`: `specular` to black-ish and `shininess` low
   on the detailed goalie's material. Skip if A-BACK-042 lands first.

Order of what is left: 8 (sprite clamp), 5, 4, 7, 9.

## Open points from the first round

- **Dark band at the top of headless screenshots.** The look-shots
  (1440 x 900) show the top ~170 px darker than the rest. It is also
  in the pictures from before any look change, `readPixels` on the
  WebGL canvas shows a uniform picture, and no DOM element covers that
  area. Cause not found. Check in a real browser first; if it is not
  there, it is a screenshot artefact and this point closes.
- **Shadows are faint from a low camera.** `FLOOR_OPACITY` 0.55 is an
  estimate; judge it by eye before step 4.
- **Pinch dolly** (A-BACK-040) is untested on a real tablet.

## Done when

The five look-shots show: no black void, every actor grounded by a
shadow, white boards, a floor with some depth, and the 2D and
photo-lock views unchanged pixel-for-pixel apart from intended colour
retunes.
