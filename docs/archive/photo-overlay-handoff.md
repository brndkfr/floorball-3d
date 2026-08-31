# Photo Overlay - Session Handoff

Status of `docs/photo-overlay-plan.md` Phase 1 as of end of this session.

## Where we are

**Phase 1 (manual PnP photo alignment) is functionally complete.** All the pieces work; last remaining issue is UX polish. Phase 2 (YOLO auto-detection) has not been touched.

Files owned by this feature (all under `web/src/authoring/photo-overlay/`):
- `landmarks.js` - rink landmark world coords (mm) for both goals + centre line
- `pnp.js` - lazy loads OpenCV.js, wraps `cv.solvePnP`, exposes `pose.projectWorld()`
- `photo-canvas.js` - 2D canvas showing the photo, landmark click UI, zoom/pan, preview line strips
- `view.js` - photo-lock camera mode (enter/exit), scene background/fog handling, `fitToPhotoRect()`
- `photo-overlay.js` - panel glue, FOV slider handling, live-preview strip generation

Cross-cutting edits also live in:
- `web/src/scene.js` - `photoCamera` export, `alpha:true` on renderer
- `web/src/controls.js` - skip WASD walk when non-perspective camera active
- `web/src/authoring/index.js` - side-effect import of `photo-overlay/photo-overlay.js`
- `web/index.html` - `#photo-canvas`, `#photoPanel` HUD panel, FOV slider markup
- `web/lib/opencv.js` - the @techstark/opencv-js dist bundle (13 MB, includes solvePnP)

Reference doc: `docs/photo-overlay-landmarks.svg` (schematic showing what each landmark means) and `docs/photo-overlay-goal-annotated.png` (real 3D goal with landmarks marked).

## What works

- Load a photo, place >=6 landmarks with click-to-arm workflow.
- Scroll wheel zoom (up to 12x), right-click-drag pan, double-click reset - all in the photo canvas during calibration.
- Live orange/yellow/blue reference wireframes drawn on the photo as landmarks are placed, updated after every solve. Shows goal frame + crease + rink boards + centre line at the solved pose.
- Camera FOV slider (20-100 degrees, default 65) so user can tune focal length interactively - low reprojection error alone does NOT nail intrinsics.
- `Enter Photo View` locks the 3D perspective camera to the solved pose. Renderer is transparent so only actual 3D objects overlay the photo. Opacity slider blends 3D overlay strength.
- Chips, arrows, zones, text, ball movement, trajectory lines all work while photo-locked (verified end-to-end).
- Landmarks + intrinsics + camera pose + reprojection error persist to `state.doc.frames[currentFrame].photo`. Photo image itself is NOT persisted (deliberately - would bloat localStorage/share URL).

## What's known bumpy

- Alignment precision on real match photos is mediocre-to-poor without careful landmark placement. Small clicks translate to big pose errors when the goal is a small feature in the frame.
- Photo canvas zoom+pan state needs to be reset on `Enter Photo View` for the two canvases (2D photo canvas and WebGL renderer canvas) to line up - fix is in place (`photoCanvas.resetView()` at start of enterBtn handler) but was the last thing shipped and hasn't been re-tested by the user after a hard refresh. **First thing to verify next session: does the "zoomed canvas offsets the overlay" bug stay fixed after a hard-refresh test?**
- `web/lib/opencv.js` is 13 MB and NOT in git-ignored territory; whether we ship it in the repo needs a decision.
- Photo overlay panel is a plain HUD panel with no visual signal that a solve is stale vs current. Reprojection error updates but user has to read the text.

## Bugs found + resolved this session (chronological)

1. WebGL canvas z-index above `#photo-canvas` swallowed landmark clicks - fixed by toggling `pointer-events: none` while calibrating.
2. WebGL canvas also fully opaque, painting over the photo - fixed by toggling `display: none` while calibrating too (later revised to keep visible in Photo View mode).
3. `docs.opencv.org/4.x` build ships without `calib3d` module (no `solvePnP`). Swapped in `@techstark/opencv-js` npm dist which includes it.
4. Loader hung indefinitely because `@techstark/opencv-js` resolves `window.cv` as a Promise (Emscripten MODULARIZE), NOT via `Module.onRuntimeInitialized` callback. Fixed by awaiting `window.cv` directly.
5. solvePnP race: fast clicking triggered overlapping solves, stale ones overwrote fresh results. Fixed with a `solveSeq` sequence counter.
6. Renderer background was solid, blanketing the photo. Fixed with `alpha: true` on WebGLRenderer + `scene.background = null` while photo-locked.
7. Guessed intrinsics `fx = fy = max(imgW, imgH)` are useless on real photos: FOV sweep showed the solver silently trades focal length for camera distance while reprojection error barely changes. Added interactive FOV slider.
8. **CRITICAL alignment bug (last thing shipped):** photo canvas has zoom/pan state, WebGL renderer canvas doesn't. When user entered Photo View while photo canvas was zoomed, the same world point projected to different screen pixels on each canvas -> "3D goal not aligned with real goal" symptom, even though the pose is correct. Fixed by resetting photo canvas view before entering Photo View.

## What to pick up next

Priority order:

1. **Verify the alignment fix.** Load a real match photo, place landmarks carefully, hit Enter Photo View. Confirm the 3D goal wireframe sits on the real goal in the photo. If yes -> Phase 1 is done. If no -> keep investigating.
2. **Decide on `web/lib/opencv.js`.** Options: commit it (13 MB), download-on-first-use via a small loader script, or bundle only the calib3d subset if a smaller build exists.
3. **UX polish (in priority order):**
   - Reset FOV slider to a smart default per photo (e.g. from EXIF if available, otherwise 65).
   - "Solve stale" indicator when landmarks have moved since last solve.
   - Make landmark checklist scroll-position remember where user was.
   - Show reprojection error per-landmark (which one is worst) not just the mean.
4. **Start Phase 2 (YOLO auto-detect):**
   - Bundle `ort.min.js` and `yolov8n.onnx` under `web/lib/`.
   - Add a "Detect players" button that runs inference on the photo, gets bounding boxes, computes feet positions.
   - For each feet position, ray-cast through `photoCamera` against the floor plane to place a chip. Reuses the existing `photoCamera` pose - no separate homography needed.
   - Add team-color detection (k-means on jersey samples) to auto-assign team 1/2.
   - See `docs/photo-overlay-plan.md` Phase 2 for the full plan.

## How to run + test

```powershell
cd C:\Users\BerndKiefer\source\repos\floorball-3d\web
python -m http.server 8000
```

Open `http://localhost:8000/`, expand the Photo Overlay panel (top-right), upload a photo.

**Chromium caches ES modules aggressively.** Every code edit requires either Ctrl+Shift+R in the user's browser or the CDP cache-clear dance in Playwright (see `CLAUDE.md`). This bit us at least three times this session - always verify with a `fetch('/src/.../foo.js', {cache: 'no-store'}).text().includes('known-new-string')` check before concluding a code fix "didn't work".

## Testing landmark placement in Playwright

Use `page.$('#photoFileInput').setInputFiles(absolutePath)` to load a photo. Directly call `canvasMod.placeLandmark(key, [x, y])` in image pixel coords rather than simulating clicks - HUD panels intercept clicks in the upper corners of the viewport. Collapse `#info` / `#coords` first if using real click simulation.

Ground truth test template (proves solver correctness without depending on user click precision):
1. Render a 3D goal from a known camera pose.
2. Screenshot the render as if it were a "photo".
3. Project the landmark world points to that photo's pixel coords using `THREE.Vector3.project(camera)` (with `camera.updateMatrixWorld(true)` first - otherwise cached inverse gives wrong result).
4. Feed those exact pixel positions into `placeLandmark` calls.
5. Compare solved camera pose to the ground-truth pose - should match to floating-point precision.
