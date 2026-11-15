# A-BACK-040 - 3D camera: orbit, presets, follow

Status: open. Review of 2026-11-14. Extends
[decisions/003](../decisions/003-rts-input-model.md) (one verb per
mouse button); it does not replace it. Top-down 2D navigation is
already good and stays as it is.

Step tags: `[small]` / `[lead]` as in
[S-BACK-030](S-BACK-030-3d-look.md). Every step is one PR and follows
the TDD workflow in [CLAUDE.md](../../CLAUDE.md): failing test first,
then the code, then `pnpm test`, the affected e2e specs, build and
size check.

## What is wrong with 3D navigation now

- The 3D camera is a first-person walker: WASD walks at 2.5 m/s (16 s
  to cross the rink), left-drag turns the head, eye height is fixed.
  There is no way to circle around a situation, which is the one thing
  a coach wants ("look at this from behind the goal").
- The wheel changes the FOV (20 to 90 degrees) instead of moving the
  camera. Zoomed out it distorts, zoomed in it flattens.
- Default pose (`DEFAULT_CAMERA_POSITION` 3.2 m up at the side board,
  FOV 70) shows the rink as a thin band; the far half is tiny.
- Only two shortcuts exist ("View from ball", "Reset view"), both
  buried at the bottom of the View panel.
- Touch: an on-screen D-pad (`touch-controls.js`) that walks the
  camera. Nobody expects a D-pad in a 3D viewer on a tablet.
- 2D and 3D pan differently (right / middle drag in 2D, nothing in 3D).

## Design

An **orbit rig** replaces walking as the default 3D control:

```
rig = { tx, tz, yaw, pitch, dist }   // target on the floor, mm and rad
```

The perspective camera is derived from it every time it changes:
`position = target - forward(yaw, pitch) * dist`, then
`setCameraLook(yaw, pitch)`. `yaw` uses the project convention (0 looks
along +Z; `setCameraLook` adds the +PI offset, see CLAUDE.md
"Coordinate conventions"). Never derive "right" from `camYaw` without
that offset: copy the vectors from `handleKeyboardMovement()`.

Gestures in 3D (no tool active):

| Input | Action |
| --- | --- |
| Left-drag on empty floor | orbit (yaw / pitch around the target) |
| Right- or middle-drag, Shift + left-drag | pan the target on the floor |
| Wheel, pinch | dolly `dist` toward the floor point under the cursor |
| WASD / arrows | pan the target, relative to yaw |
| Double-click floor or object | move the target there (animated) |
| F | frame the selection, or the whole rink when nothing is selected |
| One finger / two fingers (touch) | orbit / pan + pinch |

Left-click still selects, left-drag on an object is unchanged, Q / E
still rotate a selected goalie or goal. Limits (estimates): `dist` 2 to
60 m, `pitch` -85 to -5 degrees (never below the floor), target inside
the rink plus 5 m. FOV becomes a constant (~45 degrees, estimate).

**Presets** (top bar, next to 2D / 3D; keys are free because `1..4`
are playback speeds, so use a small menu plus `Shift+1..6`):
Stand (default, whole rink fitted to the stage), Behind goal A,
Behind goal B, Corner, Bench side, Player eye (selected chip's head
height and facing; this is the old walker's use case). "View from
ball" moves here. Switching animates over ~400 ms, instantly when
`reduced-motion.js` says so.

**Follow ball** (playback only): the target follows the ball. To keep
`seekTo()` and the MP4 export deterministic the target is a pure
function of the doc and the time: the mean of the ball position over
the last 600 ms (estimate), not a per-frame low-pass.

## Progress

- 2026-11-14, branch `look-and-motion`: step 1 done
  (`web/src/orbit-math.js`, `test/orbit-math.test.js`).
- 2026-11-14: step 2 done, see "as built" under the step
  (`test-e2e/camera-orbit.spec.js`).
- 2026-11-14: step 3 done (fitted default view, FOV 45).
- 2026-11-14: step 8 done (zoom about the cursor in 2D, one rate for
  wheel, touchpad and pinch; `test/zoom-math.test.js`,
  `test-e2e/zoom.spec.js`).
- 2026-11-15: step 4 done (presets: Views menu and Shift+1..6).
- 2026-11-15: step 5 done (F frames the selection, double-click
  re-targets).
- 2026-11-15: step 7 done (Follow ball in the recorder). Left: step 6
  (touch), which needs a real tablet check by the user.

## Steps

1. `[done]` **Orbit math, no UI change.** Three-free
   `web/src/orbit-math.js`, as built:
   - `rigToCamera(rig)` -> `{ x, y, z, yaw, pitch }`
   - `cameraToRig({ x, y, z, yaw, pitch })`: the rig whose camera sits
     exactly there. Looking at or above the horizon, the pitch is
     pulled to `ORBIT_LIMITS.maxPitch`; the position never changes.
   - `orbitBy(rig, dxPx, dyPx)` (clamps pitch only),
     `panBy(rig, dxPx, dyPx, { viewportH, fovDeg })`,
     `panKeys(rig, forward, right, stepMm)`,
     `dollyBy(rig, wheelDelta, pivot)`, `clampRig(rig)`
   - `lerpRig(a, b, k)` (yaw the short way round)
   - `projectToScreen(rig, point, { vw, vh, fovDeg })`
   - `fitRigToRink({ vw, vh, fovDeg, insets })`: same insets as
     `ui/stage-frustum.js`; landscape stages look across from the long
     side, portrait ones along the rink from behind goal A.
   **Design change from the first draft:** there is no stored
   `state.camRig`. The camera stays the source of truth; each gesture
   does `cameraToRig(camera)` at its start, changes the rig and writes
   `rigToCamera()` back through `camera.position` + `setCameraLook()`.
   So frame camera keyframes, "View from ball", `exitTopDown()` and
   `playback.js`'s `savedCamera` need no changes.
2. `[done 2026-11-14]` **Wire the gestures.** As built, where it
   differs from the text below:
   - `getCameraRig()` reads yaw / pitch from `camera.rotation`, not
     from `state.camYaw` / `camPitch`: playback and `exitTopDown()`
     restore the camera through its quaternion and leave those stale.
   - Pan is `panGrab()` (new): the floor point grabbed anywhere on
     screen stays under the cursor. `panBy()` is exact at the window
     centre only and is the fallback near the horizon.
   - Wheel pivot is `screenToFloor()` (new), null over the horizon or
     outside the rink margin. `applyZoomDelta` is gone; pinch calls
     `dollyCamera()` too (not checked on a real tablet, see step 6).
   - `ORBIT_LIMITS.minPitch` is -80 degrees, inside `setCameraLook`'s
     1.4 rad clamp.
   - The FOV no longer changes by gesture but stays at 70 until
     step 3 moves it to 45 together with the fitted default view.
   - Not covered by the spec: a frame camera recorded earlier playing
     back the same (that code path was not touched).
   Original text: Add `getCameraRig()` /
   `applyCameraRig(rig)` to `scene.js` (read `camera.position`,
   `state.camYaw`, `state.camPitch`; write position +
   `setCameraLook`). `selection.js`: on entering `lmb.mode === 'look'`
   store `lmb.rig = getCameraRig()`, then per move
   `lmb.rig = orbitBy(lmb.rig, dx, dy); applyCameraRig(lmb.rig)`;
   Shift + left-drag pans instead. Right / middle drag in 3D pans
   (new handler next to the top-down one in `topdown-camera.js`, or in
   `selection.js` using the existing `rmb` click-vs-drag tracking;
   right-click without a drag keeps its meaning). `scene.js` wheel
   handler: `dollyBy(getCameraRig(), event.deltaY, pointerFloorPoint)`
   instead of `applyZoomDelta` (keep `applyZoomDelta` only if pinch
   still needs it until step 6). `controls.js` WASD in 3D:
   `panKeys(rig, f, r, rig.dist * 0.8 * dt)` (speed scales with
   distance, estimate) instead of the walker. `camera.fov` becomes a
   constant; "Reset view" and playback must restore that constant.
   Saved docs keep working because frame cameras still store
   position + quaternion + fov.
   e2e first, `test-e2e/camera-orbit.spec.js`: drag on empty floor
   changes yaw and keeps the target; wheel changes `dist`; a click
   still selects a chip; entering and leaving 2D restores the pose;
   a frame camera recorded before this change plays back the same.
3. `[done 2026-11-14]` **Default view and FOV.** As built:
   `applyDefaultView()` in `scene.js` (boot, "Reset view"), FOV 45.
   `refitDefaultView()` re-fits on resize and when the recorder inset
   changes, but only while `isDefaultView()` holds (camera still where
   the last fit put it); `exitTopDown()` fits again when the view was
   untouched on the way in. `DEFAULT_CAMERA_POSITION` / `_YAW` /
   `_PITCH` and `EYE_HEIGHT` are gone. The fog did not need a change
   at the fitted distance. Original text: `DEFAULT_*` in `scene.js`
   replaced by `applyCameraRig(fitRigToRink({ vw, vh, fovDeg, insets:
   readShellInsets() }))` on boot and on resize while the user has not
   moved the camera. `fitRigToRink` may return a distance above
   `ORBIT_LIMITS.maxDist` on narrow stages; check the fog (far 90 000)
   does not hide the rink there, see S-BACK-030 step 2. Update the specs that assert the old
   default pose.
4. `[done 2026-11-15]` **Presets.** As built: presets are camera poses
   `{ x, y, z, yaw, pitch }`, not rigs ("Player eye" and "From the
   ball" are not orbit poses); `presetPose(id, { fit, chip })`,
   `presetForKey` (reads `code`, so Shift+digit works on any layout),
   `lerpPose`, `easeInOut` in `web/src/camera-presets.js`. Menu
   "Views" in the top bar (`web/src/ui/camera-menu.js`, own module next
   to `topbar.js`), 400 ms blend in `animate()` via `tickCameraTween`,
   instant with reduced motion, stopped by a click or wheel on the
   stage; a preset chosen in 2D switches to 3D; "Stand" ends in
   `applyDefaultView()`; "Player eye" is disabled without a selected
   chip; "From the ball" in the menu reuses the View panel button, which
   stays for now. Distances and heights are estimates checked in
   screenshots (bench side 4 m up, 2.5 m outside the board). Tests:
   `test/camera-presets.test.js`, `test-e2e/camera-presets.spec.js`.
   Original text: Pure table `web/src/camera-presets.js`
   (`presetRig(name, { selectedChip, ball, targetGoal })`) with a
   test per preset (camera is outside the boards for the goal views,
   looks at the goal mouth, and so on). Menu in the top bar
   (`web/src/ui/topbar.js`); throw if the root element is missing
   (CLAUDE.md, DOM-owning modules). Tween via `lerpRig` in the
   `animate()` loop; report "active" so the render gate draws.
   e2e: choosing a preset moves the camera; `Shift+2` does the same.
5. `[done 2026-11-15]` **Focus.** Double-click and `F` in 3D (`F` already
   resets the 2D view in `controls.js`; keep that). As built:
   `orbit-math.js` `focusRigOn` (double-click: the target moves, look
   and distance stay) and `frameRig` (F: the selection's centre from the
   current direction, closest distance where every selected object's
   feet and head sit inside the view with 10 % margin, at least 4.5 m;
   estimates); `web/src/camera-focus.js` wires both and blends through
   `camera-menu.js` `blendCameraTo`. F with nothing selected goes to
   Stand. A double-click within 60 px of a selected object focuses the
   object, else the floor under the cursor; ignored while a tool is
   active (zone / curved arrow use double-click to finish). Tests in
   `test/orbit-math.test.js`, `test-e2e/camera-focus.spec.js`.
6. `[lead]` **Touch.** One finger orbits, two fingers pan and pinch,
   in 3D; remove the D-pad buttons from the 3D view (keep Q / E
   rotate, cycle and deselect). Needs a real tablet check by the
   user: Playwright touch emulation is not enough.
7. `[done 2026-11-15]` **Follow ball.** As built: `web/src/authoring/
   follow-ball.js` `ballAtTime` / `followTargetAt` (mean of 13 samples
   over the last 600 ms, window cut at 0); `playback.js` `applyFollow`
   runs where no camera keyframe applied (`applyCamera` now returns
   whether it did), replaces only the target and reads direction and
   distance from the camera each time, so an orbit drag still works
   while following; a scrub snapshots the camera so Stop restores it.
   "Follow" button next to Loop in the recorder, `state.followBall`,
   remembered per browser (`floorball3d.followBall`), not in the doc. Tests:
   `test/follow-ball.test.js`, `test-e2e/follow-ball.spec.js`.
   Original text: `followTargetAt(frames, elapsedMs)` in
   `orbit-math.js` or next to `ball-pose.js`, test with a two-frame
   pass; a "Follow ball" toggle in the recorder; a frame with its own
   camera keyframe wins over follow.
8. `[done 2026-11-14]` **Zoom that feels the same everywhere** (added
   2026-11-14, done before step 4). As built: `zoomTopDownAt(factor,
   clientX, clientY)` in `topdown-camera.js` serves the 2D wheel and 2D
   pinch; `dollyBy` takes its rate from `zoomFactor`, so 2D and 3D zoom
   at the same speed (estimates: 0.0015 per wheel px, 16 px per line,
   10x for a touchpad pinch). The touch pinch is emulated with
   synthetic `TouchEvent`s in the spec; a real tablet check is still
   part of step 6. Problems found in review: the 2D wheel zooms
   to the window centre, not the cursor; 2D zooms a fixed 15 % per
   wheel event, so a touchpad (many small events) races; a touchpad
   pinch (wheel + `ctrlKey`, small deltas) barely moves the 3D camera;
   touch pinch zooms to the centre and adds a fixed amount per px of
   finger travel; wheel `deltaMode` lines / pages are read as pixels.
   Fix: pure `web/src/zoom-math.js` (`wheelDeltaPx`, `zoomFactor`,
   `pinchWheelDelta`, `zoomOrthoAt`) used by the 2D wheel, the 3D wheel
   and both pinch paths; 2D zooms about the cursor or the finger
   midpoint along the camera's own axes (the 2D view can be rotated).
   Tests first: `test/zoom-math.test.js`, `test-e2e/zoom.spec.js`.
   Later, separate: eased zoom (~120 ms, instant with reduced motion),
   `+` / `-` keys, pushing the target forward at the minimum distance.

## Done when

A new user can circle a goal-mouth situation with one drag, jump
behind either goal with one click, and the first 3D view after "New
play" shows the whole rink filling the stage.
