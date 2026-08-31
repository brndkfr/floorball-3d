# Engineering Plan (v2): Photo Overlay & Player Auto-Detection

Adapted to the floorball-3d codebase (mm units, custom camera rig, `state.doc` v2, no OrbitControls).

## Architecture & Constraints
- Host: brndkfr.github.io/floorball-3d (Three.js + vanilla JS, ES modules).
- All libs local under `web/lib/`: `opencv.js`, `ort.min.js`, `yolov8n.onnx`. **Lazy-loaded** via dynamic import when the Photo Overlay panel is first opened, not at boot (combined ~25 MB).
- Units: **millimetres**, world axes match `web/src/constants.js` (`RINK_L=40000` along +Z, `RINK_W=20000` along X, floor at y=0).
- New module home: `web/src/authoring/photo-overlay/` (`photo-overlay.js`, `pnp.js`, `detect.js`, `photo-canvas.js`).
- No OrbitControls in the app. Photo-lock is a **new camera mode** that suspends `web/src/controls.js` input and coexists with `state.activeCamera` (perspective / topDown / photo).

## Doc Integration
Extend the v2 doc schema (see `web/src/authoring/doc.js`) so photo overlay is per-frame and round-trippable:

```js
// frame.photo (optional)
{
  imageDataUrl: '<png/jpeg>',
  imageW: 1920, imageH: 1080,
  landmarks: [ { key: 'creaseFL', px:[x,y] }, ... ],   // >=6, ideally 8
  intrinsics: { fx, fy, cx, cy },                     // guessed then refined
  camera: { position:[x,y,z], quaternion:[x,y,z,w], fov },
  reprojErrorPx: 3.7,                                  // last solve residual
  opacity: 0.7,
}
```

`ensureDoc()` gains a migrator that no-ops if `frame.photo` is absent. `acceptDoc()` keeps working for legacy docs.

---

## Phase 1: Manual N-Point Perspective Match

### Pipeline
Upload photo -> background canvas -> click >=6 landmarks -> solvePnP (planar+non-planar mix) -> write pose to `frame.photo.camera` -> engage photo camera mode.

### Steps

1. **Assets & DOM**
   - Add `#photo-canvas` (2D) behind the WebGL canvas. Renderer already supports transparency via `renderer.setClearColor(0x000000, 0)` in `web/src/scene.js` (or add it there if missing).
   - Dock button "Photo Overlay" in `web/src/authoring/dock.js`. First click triggers `await import('./photo-overlay/photo-overlay.js')` which then lazy-loads opencv.js.
   - Opacity slider (0-1, default 0.7) drives `#photo-canvas.style.opacity`.

2. **Landmark set (mm, rink coords)** - drop the meters/goal-center frame:

```js
// rink centre at origin, goals at +/- (RINK_L/2 - GOAL_LINE_FROM_BOARD).
// GL_Z = RINK_L/2 - GOAL_LINE_FROM_BOARD = 16500
const GL_Z = 16500;
const WORLD_LANDMARKS = {
  // crease front corners (2500 x 1000 mm crease, front edge 1000 mm ahead of goal line)
  creaseFL: [-1250, 0, GL_Z - 1000],
  creaseFR: [ 1250, 0, GL_Z - 1000],
  creaseBL: [-1250, 0, GL_Z],
  creaseBR: [ 1250, 0, GL_Z],
  // goal posts (mouth width 1600, top of post 1150)
  postL:    [ -800, 0,    GL_Z],
  postR:    [  800, 0,    GL_Z],
  postLTop: [ -800, 1150, GL_Z],
  postRTop: [  800, 1150, GL_Z],
  // centre spot + side face-off dots
  centre:   [0, 0, 0],
  // (add more from generate_rink.py as needed)
};
```

Two goal-post-top points are **non-coplanar** with the floor - this alone kills the planar-PnP degeneracy. Require at least 6 clicked landmarks, warn below 8. The user picks which landmarks they can see from a checklist (photo may crop some).

3. **Camera intrinsics**
   - Guess: `fx = fy = max(imgW, imgH)`, `cx = imgW/2`, `cy = imgH/2`. Store in `frame.photo.intrinsics`.
   - Add a "focal length" slider (0.5x - 2.0x of the guess) that re-runs solvePnP live. Show reprojection error in px so the user tunes until it minimises.

4. **PnP solve** (`photo-overlay/pnp.js`)
   - `cv.solvePnP(objectPoints, imagePoints, K, distCoeffs=zeros, rvec, tvec, false, cv.SOLVEPNP_ITERATIVE)`.
   - `cv.Rodrigues(rvec) -> R`. OpenCV uses **+Y down, +Z into scene**; Three.js uses **+Y up, +Z out of scene**. Flip rows 1 and 2 of `[R | t]` (multiply by `diag(1,-1,-1)` on the left) before feeding to `Matrix4`.
   - Build `Matrix4` from `[R^T | -R^T t]` (extrinsic -> world-space camera pose), decompose into `photoCamera.position` / `.quaternion`, then set `photoCamera.fov = 2*atan(imgH/(2*fy)) * 180/PI` and `.aspect = imgW/imgH`.
   - Compute reprojection error over all landmarks; write to `frame.photo.reprojErrorPx`. Red badge if > ~10 px.

5. **Camera mode & controls**
   - Add `photoCamera` (`PerspectiveCamera`) alongside `camera` and `topDownCamera` in `web/src/scene.js`.
   - New helper `enterPhoto()/exitPhoto()` mirrors `web/src/authoring/topdown-camera.js` (save fog, save perspective pose, `setActiveCamera(photoCamera)`).
   - In `web/src/controls.js`: guard walk/look input on `state.activeCamera !== photoCamera`. Photo mode is view-only.
   - Because `web/src/scene.js` applies a `+PI` yaw offset in `setCameraLook()`, the PnP path bypasses that entirely: it sets the quaternion directly. **Do not** route the PnP result through `setCameraLook`.

---

## Phase 2: Auto-Detect Players

### Pipeline
Photo canvas -> YOLO ONNX -> person bboxes -> feet pixel -> unproject through photo camera -> intersect y=0 plane -> instantiate chips. **No separate homography.**

### Steps

1. **Engine setup** (`photo-overlay/detect.js`)
   - `await import('../../lib/ort.min.js')`.
   - `ort.InferenceSession.create('./lib/yolov8n.onnx', { executionProviders: ['webgpu', 'wasm'] })`.
   - Cache the session on the module; first inference warm-up runs on a blank 640x640 tensor so the user click has zero perceived latency.

2. **Detection & filtering**
   - Letterbox photo to 640x640 float32 CHW.
   - Filter `class === 0` (person), `conf > 0.45`, IoU-NMS at 0.5.
   - Reject boxes whose bottom edge is off-image (feet cropped -> wrong anchor).
   - Reject boxes whose `y_max` unprojects to outside the rink polygon (bench, refs, coaches).

3. **Feet -> world (ground-plane ray-cast, no homography)**

```js
const ndc = new THREE.Vector2(
  (feetPx.x / imgW) * 2 - 1,
  -(feetPx.y / imgH) * 2 + 1,
);
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(ndc, photoCamera);
const hit = new THREE.Vector3();
raycaster.ray.intersectPlane(FLOOR_PLANE, hit); // Plane(normal=+Y, const=0)
// hit.x, hit.z are the chip position in mm.
```

One solver (PnP) as source of truth. No `cv.findHomography` call.

4. **Team assignment**
   - Sample the middle third of each bbox (torso), convert to Lab, k-means k=2 across all detections in the photo.
   - Cluster centroids get mapped to team 1 / team 2 by a "swap teams" button. Goalie is picked by hand (single click).

5. **Instantiation**
   - For each accepted detection, push a chip into `state.doc.frames[currentFrame].scheme.players` via existing chip creation in `web/src/authoring/chips.js`. Reuse `state.currentTeam` per detection.
   - Add per-chip "flag as bad" and drag-in-top-down fine-tune. The dock already switches to top-down for chip tools - repurpose that flow.
   - Log per-chip 2D->3D residual (`|photoCamera.project(hit) - feetPx|`) so users see which chips likely have occluded feet.

---

## File Layout

```
web/
  lib/
    opencv.js          # lazy-loaded
    ort.min.js         # lazy-loaded
    yolov8n.onnx       # lazy-loaded
  src/
    authoring/
      photo-overlay/
        photo-overlay.js   # panel entry, dock wiring, opacity slider
        photo-canvas.js    # 2D canvas, image load, landmark click UI
        pnp.js             # cv.solvePnP wrapper, mm world points, Y/Z flip
        detect.js          # ORT session, YOLO pre/post, team k-means
      doc.js               # +frame.photo migrator
      dock.js              # +Photo Overlay button
    scene.js               # +photoCamera, transparent clear
    controls.js            # gate input on activeCamera !== photoCamera
```

## Verification Notes (per CLAUDE.md)
- Chromium caches ES modules aggressively - reload with the CDP cache-disable dance when validating in Playwright.
- Web Workers don't post back in headless Playwright; run ORT on the main thread for now, or test the worker path in a real focused tab only.
- Syntax-check new modules via the `.mjs` copy + `node --check` trick.

## Cut-line for a v1 ship
- Phase 1 alone (manual align, no AI) is independently useful. Ship it, gather real match photos, then decide if YOLOv8n's floorball accuracy justifies the 13 MB download. A cheaper alt for Phase 2: run detection on the user's laptop via a tiny CLI and paste the bbox JSON into the panel - skips the in-browser ORT entirely.
