// Photo Overlay panel: upload a match photo, click rink landmarks on it,
// solve for the camera pose (pnp.js) and lock the 3D view to it so a
// scheme can be checked/aligned against the real photo. See
// docs/photo-overlay-plan.md Phase 1.
import { state } from '../../state.js';
import { photoCamera, renderer } from '../../scene.js';
import { ensureDoc } from '../doc.js';
import { saveDoc } from '../storage.js';
import { WORLD_LANDMARKS, LANDMARK_LABELS, MIN_LANDMARKS } from './landmarks.js';
import { solveCameraPose } from './pnp.js';
import * as photoCanvas from './photo-canvas.js';
import { enterPhoto, exitPhoto, isPhoto, fitToPhotoRect, setOverlayOpacity } from './view.js';
import { detectGoal, computeEdgeOverlay } from './detect.js';
import { readFocalLength35mm, focal35mmToHFovDeg } from './exif.js';
import * as borderMode from './border-mode.js';
import { RINK_L, HALF_W, GOAL_LINE_FROM_BOARD } from '../../constants.js';

// Structured, in-page debug log (capped) so calibration state can be
// inspected from devtools/automation at any later point in the session,
// not just at the moment console.log happened to print it.
function debugLog(event, data) {
  console.log(`[photo-overlay] ${event}`, data);
  const log = (window.__photoOverlayDebugLog ??= []);
  log.push({ t: Date.now(), event, data });
  if (log.length > 200) log.shift();
}

const fileInput = document.getElementById('photoFileInput');
const listEl = document.getElementById('photoLandmarkList');
const errorEl = document.getElementById('photoReprojError');
const opacitySlider = document.getElementById('photoOpacity');
const enterBtn = document.getElementById('photoEnterBtn');
const exitBtn = document.getElementById('photoExitBtn');
const rinkFitBtn = document.getElementById('photoRinkFitBtn');
const rinkFitPanel = document.getElementById('photoRinkFitPanel');
const rinkFitMirror = document.getElementById('photoRinkFitMirror');
const rinkFitUseTop = document.getElementById('photoRinkFitUseTop');
const rinkFitConfirmBtn = document.getElementById('photoRinkFitConfirmBtn');
const rinkFitCancelBtn = document.getElementById('photoRinkFitCancelBtn');
const autoDetectBtn = document.getElementById('photoAutoDetectBtn');
const flipLRBtn = document.getElementById('photoFlipLRBtn');
const autoDetectEnd = document.getElementById('photoAutoDetectEnd');
const roiBtn = document.getElementById('photoRoiBtn');
const autoFovBtn = document.getElementById('photoAutoFovBtn');
const edgesToggle = document.getElementById('photoEdgesToggle');
const borderModeBtn = document.getElementById('photoBorderModeBtn');
const borderModeMount = document.getElementById('photoBorderModeMount');
const advancedToggle = document.getElementById('photoAdvancedToggle');
const advancedPanel = document.getElementById('photoAdvanced');
const autoBanner = document.getElementById('photoAutoBanner');
const refineBtn = document.getElementById('photoRefineBtn');
const alignSlider = document.getElementById('photoAlignSlider');
const hintPanel = document.getElementById('photoHintPanel');
const hintText = document.getElementById('photoHintText');
const hintDiagram = document.getElementById('photoHintDiagram');
const hintSkipBtn = document.getElementById('photoHintSkipBtn');
const landmarksDetails = document.getElementById('photoLandmarksDetails');

const fovSlider = document.getElementById('photoFovSlider');
const fovValue = document.getElementById('photoFovValue');
const k1Slider = document.getElementById('photoK1Slider');
const k1Value = document.getElementById('photoK1Value');

// k1 slider is integer -40..+40 mapped to ~[-0.4, +0.4] which covers the
// practical range for phone/broadcast lenses (barrel: negative, pincushion: positive).
const K1_SCALE = 0.01;
function currentK1() { return Number(k1Slider.value) * K1_SCALE; }

// Preview line-strips (both goal frames + creases + boards + centre line) in
// world (mm), projected each solve so the user sees whether their landmarks
// produce a plausible fit BEFORE clicking Enter Photo View. Each strip is
// tagged with which landmark group actually constrains it out there - a
// pose solved only from a handful of near-goal points has essentially no
// rotational precision left over 40m, so showing the OTHER goal / far
// boards regardless just draws noise that never looks right no matter
// what's adjusted. Only draw what's actually backed by placed landmarks.
function buildReferenceStrips() {
  const strips = [];
  for (const [prefix, boardZ, sign] of [['A', 0, +1], ['B', RINK_L, -1]]) {
    const gl = boardZ + sign * GOAL_LINE_FROM_BOARD;
    const netBackZ = boardZ + sign * 2850;
    // goal frame: mouth rectangle + back-of-net rectangle + verticals connecting
    const mouth = [[-800,0,gl], [800,0,gl], [800,1150,gl], [-800,1150,gl], [-800,0,gl]];
    const back = [[-800,0,netBackZ], [800,0,netBackZ], [800,1150,netBackZ], [-800,1150,netBackZ], [-800,0,netBackZ]];
    const group = `goal${prefix}`;
    strips.push({ color: '#ff8c1a', points: mouth, group });
    strips.push({ color: '#ff8c1a', points: back, group });
    strips.push({ color: '#ff8c1a', points: [mouth[0], back[0]], group });
    strips.push({ color: '#ff8c1a', points: [mouth[1], back[1]], group });
    strips.push({ color: '#ff8c1a', points: [mouth[2], back[2]], group });
    strips.push({ color: '#ff8c1a', points: [mouth[3], back[3]], group });
    const cn = boardZ + sign * 2850, cf = boardZ + sign * 6850;
    strips.push({ color: '#e8d34a', points: [[-2500,0,cn], [2500,0,cn], [2500,0,cf], [-2500,0,cf], [-2500,0,cn]], group });
  }
  strips.push({ color: '#5fb4ff', points: buildRinkOutline(), group: 'board' });
  strips.push({ color: '#5fb4ff', points: [[-HALF_W,0,RINK_L/2], [HALF_W,0,RINK_L/2]], group: 'board' });
  return strips;
}

// Rink outline with 2000mm rounded corners (matches generate_rink.py's
// BOARD_R). Straight segments join tangent points that users can click as
// landmarks (boardTangent* / boardCentre*).
function buildRinkOutline() {
  const R = 2000, N = 10;
  const pts = [];
  const arc = (cx, cz, a0, a1) => {
    for (let i = 0; i <= N; i++) {
      const t = a0 + (a1 - a0) * (i / N);
      pts.push([cx + R * Math.cos(t), 0, cz + R * Math.sin(t)]);
    }
  };
  pts.push([-HALF_W, 0, R]);
  pts.push([-HALF_W, 0, RINK_L - R]);
  arc(-HALF_W + R, RINK_L - R, Math.PI, Math.PI / 2);
  pts.push([HALF_W - R, 0, RINK_L]);
  arc(HALF_W - R, RINK_L - R, Math.PI / 2, 0);
  pts.push([HALF_W, 0, R]);
  arc(HALF_W - R, R, 0, -Math.PI / 2);
  pts.push([-HALF_W + R, 0, 0]);
  arc(-HALF_W + R, R, -Math.PI / 2, -Math.PI);
  pts.push([-HALF_W, 0, R]);
  return pts;
}

const REFERENCE_STRIPS = buildReferenceStrips();

function projectStrips(strips, projectWorld, imgW, imgH, allowedGroups) {
  const out = [];
  for (const strip of strips) {
    if (allowedGroups && !allowedGroups.has(strip.group)) continue;
    const points = [];
    for (const [x, y, z] of strip.points) {
      const p = projectWorld(x, y, z);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      // clip loosely so tiny FOVs projecting distant points off to infinity don't blow up canvas
      if (Math.abs(p[0]) > imgW * 5 || Math.abs(p[1]) > imgH * 5) continue;
      points.push(p);
    }
    if (points.length >= 2) out.push({ color: strip.color, points });
  }
  return out;
}

const LANDMARK_KEYS = Object.keys(WORLD_LANDMARKS);
let armedKey = null;

function currentIntrinsics(size) {
  // Guessing intrinsics from image alone always fails when the photo has been
  // cropped, zoomed, or shot with a non-typical lens. Expose the horizontal
  // FOV as a slider so the user can visibly tune the overlay - a low
  // reprojection error doesn't guarantee the pose is right if intrinsics
  // are wrong, so the user needs to eyeball the actual overlay result.
  const hfovDeg = Number(fovSlider.value);
  const fx = size.w / (2 * Math.tan((hfovDeg * Math.PI / 180) / 2));
  return { fx, fy: fx, cx: size.w / 2, cy: size.h / 2, k1: currentK1() };
}

function buildList() {
  listEl.innerHTML = '';
  for (const key of LANDMARK_KEYS) {
    const row = document.createElement('label');
    row.className = 'photo-landmark-row';
    row.dataset.key = key;
    const left = document.createElement('span');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => {
      if (cb.checked) armLandmark(key);
      else {
        armedKey = armedKey === key ? null : armedKey;
        photoCanvas.removeLandmark(key);
        row.classList.remove('placed');
        row.querySelector('.err').textContent = '';
        trySolve();
      }
    });
    left.appendChild(cb);
    left.appendChild(document.createTextNode(' ' + (LANDMARK_LABELS[key] || key)));
    const err = document.createElement('span');
    err.className = 'err';
    row.appendChild(left);
    row.appendChild(err);
    listEl.appendChild(row);
  }
}

function armLandmark(key) {
  armedKey = key;
  listEl.querySelectorAll('.photo-landmark-row').forEach((r) => r.classList.toggle('armed', r.dataset.key === key));
  if (guidedActive) updateHintDisplay(key);
}

// Guided Step 2 manual fallback (docs/plan.md 4.3): one hint at a time
// instead of the full 30+ row checklist. A curated 8-point sequence per
// goal end - mixes floor (crease/post base) and post-top landmarks so the
// coplanar-set trap (4.2) never happens even if the user only ever
// follows the hints. The full list stays reachable via the <details>
// disclosure for anyone who wants to add/adjust further.
let guidedActive = false;
let guidedQueue = [];
let guidedCurrent = null;

function guidedSequence(end) {
  return [
    `${end}_creaseNearL`, `${end}_creaseNearR`,
    `${end}_postL`, `${end}_postR`,
    `${end}_postTopL`, `${end}_postTopR`,
    `${end}_boardTangentL`, `${end}_boardTangentR`,
  ];
}

// Small top-down rink sketch (world mm mapped to an SVG viewBox) with a
// highlighted dot at the hinted landmark - cheaper to build correctly than
// wire up a whole diagram asset, and it's generic over any landmark key.
function renderHintDiagram(key) {
  const world = WORLD_LANDMARKS[key];
  if (!world) { hintDiagram.innerHTML = ''; return; }
  const [x, , z] = world;
  const margin = 1500;
  const vbW = HALF_W * 2 + margin * 2, vbH = RINK_L + margin * 2;
  const sx = x + HALF_W + margin, sy = z + margin;
  const goalW = 1600, goalD = 600;
  hintDiagram.innerHTML = `
    <svg viewBox="0 0 ${vbW} ${vbH}">
      <rect x="${margin}" y="${margin}" width="${HALF_W * 2}" height="${RINK_L}" rx="600" ry="600"
            fill="none" stroke="#4fe0ff" stroke-width="80" opacity="0.6"/>
      <rect x="${HALF_W + margin - goalW / 2}" y="${margin - goalD / 2}" width="${goalW}" height="${goalD}"
            fill="none" stroke="#ff8c1a" stroke-width="60"/>
      <rect x="${HALF_W + margin - goalW / 2}" y="${RINK_L + margin - goalD / 2}" width="${goalW}" height="${goalD}"
            fill="none" stroke="#ff8c1a" stroke-width="60"/>
      <circle cx="${sx}" cy="${sy}" r="500" fill="#ffe14f" stroke="#1a120a" stroke-width="60"/>
    </svg>`;
}

function updateHintDisplay(key) {
  hintText.textContent = `Click: ${LANDMARK_LABELS[key] || key}`;
  renderHintDiagram(key);
}

function advanceGuided() {
  guidedCurrent = null;
  while (guidedQueue.length) {
    const key = guidedQueue.shift();
    if (photoCanvas.getPlacedPoints().some((p) => p.key === key)) continue;
    guidedCurrent = key;
    const row = listEl.querySelector(`[data-key="${key}"]`);
    const cb = row?.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = true;
    armLandmark(key);
    return;
  }
  endGuidedHints();
}

function startGuidedHints(end) {
  guidedQueue = guidedSequence(end).filter(
    (key) => !photoCanvas.getPlacedPoints().some((p) => p.key === key)
  );
  guidedActive = true;
  if (landmarksDetails) landmarksDetails.open = false;
  hintPanel.style.display = 'block';
  advanceGuided();
}

function endGuidedHints() {
  guidedActive = false;
  guidedQueue = [];
  guidedCurrent = null;
  hintPanel.style.display = 'none';
}

hintSkipBtn.addEventListener('click', () => { if (guidedActive) advanceGuided(); });

// Opening the full list is the escape hatch to manual/power-user mode -
// stop steering once the user has taken the wheel themselves.
landmarksDetails?.addEventListener('toggle', () => {
  if (landmarksDetails.open && guidedActive) endGuidedHints();
});

function firstUncheckedUnplaced() {
  const placedKeys = new Set(photoCanvas.getPlacedPoints().map((p) => p.key));
  for (const row of listEl.querySelectorAll('.photo-landmark-row')) {
    const cb = row.querySelector('input');
    if (cb.checked && !placedKeys.has(row.dataset.key)) return row.dataset.key;
  }
  return null;
}

photoCanvas.setLandmarkClickHandler((imgX, imgY) => {
  if (borderMode.isEnabled()) {
    borderMode.setPending([imgX, imgY]);
    photoCanvas.setPendingMarker([imgX, imgY]);
    return;
  }
  if (!armedKey) return;
  photoCanvas.placeLandmark(armedKey, [imgX, imgY]);
  const row = listEl.querySelector(`[data-key="${armedKey}"]`);
  row.classList.add('placed');
  row.classList.remove('armed');
  armedKey = null;
  if (guidedActive) {
    advanceGuided();
  } else {
    const next = firstUncheckedUnplaced();
    if (next) armLandmark(next);
  }
  trySolve();
});

// Dragging an already-placed marker (photo-canvas.js) nudges its stored
// pixel position live; only re-solve once the drag ends, not every frame.
photoCanvas.setMarkerMovedHandler(() => { trySolve(); });
photoCanvas.setLabelResolver((key) => LANDMARK_LABELS[key] || key);

// Border-mode landmarks are added at runtime (dynamic keys boardTop_N) so
// they need a bespoke row: no checkbox, just "labelled dot + remove" - and
// their world coord goes into WORLD_LANDMARKS so trySolve()'s lookup keeps
// working uniformly.
function addBorderRow(key, world) {
  const row = document.createElement('label');
  row.className = 'photo-landmark-row placed';
  row.dataset.key = key;
  const left = document.createElement('span');
  left.textContent = `● board-top (${(world[0] / 1000).toFixed(1)}, ${(world[2] / 1000).toFixed(1)}) m`;
  left.style.color = '#7ee27a';
  const del = document.createElement('button');
  del.textContent = '×';
  del.title = 'remove this board-top point';
  del.style.cssText = 'margin-left:6px; padding:0 4px; background:transparent; color:#c88; border:1px solid #533; border-radius:3px; cursor:pointer;';
  del.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    delete WORLD_LANDMARKS[key];
    photoCanvas.removeLandmark(key);
    borderMode.unregisterCommitted(key);
    row.remove();
    trySolve();
  });
  const err = document.createElement('span');
  err.className = 'err';
  left.appendChild(del);
  row.appendChild(left);
  row.appendChild(err);
  listEl.appendChild(row);
}

borderMode.init(borderModeMount);
borderMode.setOnCommit((key, world, photoXY) => {
  WORLD_LANDMARKS[key] = world;
  photoCanvas.placeLandmark(key, photoXY);
  photoCanvas.setPendingMarker(null);
  borderMode.registerCommitted(key, world);
  addBorderRow(key, world);
  trySolve();
});

borderModeBtn.addEventListener('click', () => {
  const on = !borderMode.isEnabled();
  if (on) { syncBorderFocus(); endGuidedHints(); }
  borderMode.setEnabled(on);
  borderModeBtn.textContent = on ? 'Border mode: ON' : 'Border mode: off';
  borderModeBtn.classList.toggle('active', on);
  if (!on) photoCanvas.setPendingMarker(null);
});

// "detect as" tells us which goal end the photo frames - reuse it to zoom
// the border-mode minimap to that end instead of the whole 40m rink, and
// to keep the rink-outline tool's top/bottom labelling consistent with it
// (whichever goal you tag as "A" here is Goal A everywhere in this panel).
function syncBorderFocus() {
  const end = autoDetectEnd.value === 'B' ? 'B' : 'A';
  borderMode.setFocusEnd(end);
  photoCanvas.setRinkFitSwapEnds(end === 'B');
}
autoDetectEnd.addEventListener('change', syncBorderFocus);

advancedToggle.addEventListener('click', () => {
  const open = advancedPanel.style.display !== 'none';
  advancedPanel.style.display = open ? 'none' : 'block';
  advancedToggle.textContent = open ? 'Advanced ▶' : 'Advanced ▼';
});

refineBtn.addEventListener('click', () => {
  autoBanner.style.display = 'none';
  advancedPanel.style.display = 'block';
  advancedToggle.textContent = 'Advanced ▼';
});

// Landmark clicks can fire faster than solveCameraPose resolves (OpenCV's
// first load in particular can take a while) - without a sequence guard, an
// older call finishing after a newer one silently overwrites its result
// with stale data (observed: UI stuck at "5/6 placed" after all 6 were
// actually placed). Only the most recently STARTED call is allowed to
// touch the DOM/doc.
let solveSeq = 0;

async function trySolve() {
  const seq = ++solveSeq;
  const placed = photoCanvas.getPlacedPoints();
  if (placed.length < MIN_LANDMARKS) {
    if (seq === solveSeq) {
      errorEl.textContent = `${placed.length}/${MIN_LANDMARKS} landmarks placed`;
      errorEl.classList.remove('bad', 'ok');
      photoCanvas.setPreviewStrips([]);
      updatePerPointErrors([], []);
      borderMode.setCoplanarWarning(false);
      debugLog('trySolve:tooFewPoints', { placed: placed.length, min: MIN_LANDMARKS, keys: placed.map((p) => p.key) });
    }
    return null;
  }
  const size = photoCanvas.getImageSize();
  if (!size) return null;
  const points = placed.map((p) => ({ world: WORLD_LANDMARKS[p.key], image: p.image }));
  const intrinsics = currentIntrinsics(size);
  try {
    const pose = await solveCameraPose(points, intrinsics, size.w, size.h);
    if (seq !== solveSeq) return null; // a newer call has since started - drop this stale result
    // Warn if the point set is dominated by coplanar landmarks (all at
    // y=500 board-top OR all at y=0 floor). solvePnP has a depth/FOV
    // ambiguity on planar sets that Auto-tune FOV can drive to nonsense.
    const ys = points.map((p) => p.world[1]);
    const distinctY = new Set(ys).size;
    const coplanar = distinctY <= 1;
    borderMode.setCoplanarWarning(coplanar);
    errorEl.textContent = `reprojection error: ${pose.reprojErrorPx.toFixed(1)} px (${placed.length} pts)`
      + (coplanar ? ' - warning: all points coplanar, add crease/post landmarks' : '');
    errorEl.classList.toggle('bad', pose.reprojErrorPx > 10 || coplanar);
    errorEl.classList.toggle('ok', pose.reprojErrorPx <= 10 && !coplanar);
    updatePerPointErrors(placed, pose.perPointErrorPx);
    debugLog('trySolve:result', {
      reprojErrorPx: Number(pose.reprojErrorPx.toFixed(2)),
      pointCount: placed.length,
      coplanar,
      cameraPosition: pose.position.toArray(),
      cameraFov: pose.fov,
      points: placed.map((p, i) => ({
        key: p.key,
        image: [Number(p.image[0].toFixed(1)), Number(p.image[1].toFixed(1))],
        worldY: WORLD_LANDMARKS[p.key][1],
        errorPx: Number(pose.perPointErrorPx[i].toFixed(2)),
      })),
    });
    photoCamera.position.copy(pose.position);
    photoCamera.quaternion.copy(pose.quaternion);
    photoCamera.fov = pose.fov;
    photoCamera.updateProjectionMatrix();

    const frame = ensureDoc().frames[state.doc.currentFrame];
    frame.photo = {
      landmarks: placed.map((p) => ({ key: p.key, px: p.image })),
      intrinsics,
      camera: { position: pose.position.toArray(), quaternion: pose.quaternion.toArray(), fov: pose.fov },
      reprojErrorPx: pose.reprojErrorPx,
    };
    saveDoc();
    if (isPhoto()) fitToPhotoRect(photoCanvas.getPhotoRect());
    // Only show reference geometry that's actually backed by a placed
    // landmark out there - an unconstrained extrapolation 40m away just
    // looks like broken/non-reacting lines, not a helpful preview.
    const allowedGroups = new Set();
    for (const p of placed) {
      if (p.key.startsWith('goalA_')) allowedGroups.add('goalA');
      else if (p.key.startsWith('goalB_')) allowedGroups.add('goalB');
      else allowedGroups.add('board'); // centre*/board* landmarks
    }
    photoCanvas.setPreviewStrips(projectStrips(REFERENCE_STRIPS, pose.projectWorld, size.w, size.h, allowedGroups));
    return pose;
  } catch (err) {
    if (seq !== solveSeq) return null;
    errorEl.textContent = err.message || 'solve failed';
    errorEl.classList.add('bad');
    errorEl.classList.remove('ok');
    console.error('[photo-overlay] trySolve failed', err, placed.map((p) => p.key));
    debugLog('trySolve:error', { message: err.message || String(err), keys: placed.map((p) => p.key) });
    return null;
  }
}


// The WebGL canvas is stacked on top of #photo-canvas (so the 3D scene can
// render over the photo once locked - see scene.js/view.js). While
// calibrating it's fully opaque and full-viewport, so it would otherwise
// both hide the photo entirely and swallow every landmark click - hide it
// and let clicks pass through until Enter Photo View resizes/dims it into
// an actual overlay.
function setCalibrating(on) {
  renderer.domElement.style.pointerEvents = on ? 'none' : 'auto';
  renderer.domElement.style.display = on ? 'none' : '';
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  await photoCanvas.loadPhoto(file);
  listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
  listEl.querySelectorAll('.photo-landmark-row').forEach((r) => r.classList.remove('placed', 'armed'));
  // Drop any dynamic board-top landmarks and their rows - they were tied
  // to the previous photo and their world coords still live in WORLD_LANDMARKS.
  for (const row of [...listEl.querySelectorAll('.photo-landmark-row')]) {
    const key = row.dataset.key;
    if (key && key.startsWith('boardTop_')) {
      delete WORLD_LANDMARKS[key];
      row.remove();
    }
  }
  borderMode.clearAll();
  syncBorderFocus();
  photoCanvas.setRinkFitEnabled(false);
  photoCanvas.resetRinkFit();
  rinkFitPanel.style.display = 'none';
  photoCanvas.setPendingMarker(null);
  armedKey = null;
  endGuidedHints();
  alignSlider.value = 100;
  photoCanvas.setPreviewOpacity(1);
  edgesComputed = false;
  edgesToggle.checked = false;
  photoCanvas.setEdgeOverlayEnabled(false);
  setCalibrating(true);
  // Seed FOV slider from EXIF if the file has it - phone photos usually
  // do, WhatsApp / broadcast stills usually don't. Silent fallback keeps
  // whatever the user last had if we can't read it.
  const focal35 = await readFocalLength35mm(file);
  const size = photoCanvas.getImageSize();
  if (focal35 && size) {
    const hfov = focal35mmToHFovDeg(focal35, size.w, size.h);
    if (hfov >= Number(fovSlider.min) && hfov <= Number(fovSlider.max)) {
      fovSlider.value = Math.round(hfov);
      fovValue.textContent = fovSlider.value + '° (EXIF ' + focal35 + 'mm equiv)';
    }
  }
  autoBanner.style.display = 'none';
  advancedPanel.style.display = 'none';
  advancedToggle.textContent = 'Advanced ▶';

  // Whole-image auto-detect on load turned out unreliable in practice -
  // real photos often have other large red objects (sponsor banners,
  // spectator chairs) competing with the actual goal for the red-mask
  // detector, with nothing yet narrowing the search. Go straight to
  // guided hints instead; auto-detect only runs once the user zooms into
  // the goal themselves via the ROI tool (docs/plan.md 4.3 Step 2 -
  // see setRoiChangeHandler below), which is the one point we can
  // actually trust the search is scoped to the right area.
  startGuidedHints(autoDetectEnd.value === 'B' ? 'goalB' : 'goalA');
});

opacitySlider.addEventListener('input', () => {
  if (isPhoto()) setOverlayOpacity(Number(opacitySlider.value) / 100);
});

alignSlider.addEventListener('input', () => {
  photoCanvas.setPreviewOpacity(Number(alignSlider.value) / 100);
});

fovSlider.addEventListener('input', () => {
  fovValue.textContent = fovSlider.value + '°';
  trySolve();
});

k1Slider.addEventListener('input', () => {
  k1Value.textContent = currentK1().toFixed(2);
  trySolve();
});

// Compute edges lazily the first time the user turns the toggle on -
// keeps photo-load fast for users who never use this feature.
let edgesComputed = false;
edgesToggle.addEventListener('change', async () => {
  photoCanvas.setEdgeOverlayEnabled(edgesToggle.checked);
  if (!edgesToggle.checked || edgesComputed || !photoCanvas.hasPhoto()) return;
  edgesToggle.disabled = true;
  const prevText = errorEl.textContent;
  errorEl.textContent = 'computing edges...';
  try {
    const canvas = await computeEdgeOverlay(photoCanvas.getImage());
    photoCanvas.setEdgeOverlay(canvas);
    edgesComputed = true;
    errorEl.textContent = prevText;
  } catch (err) {
    errorEl.textContent = 'edge overlay failed: ' + (err.message || err);
    edgesToggle.checked = false;
    photoCanvas.setEdgeOverlayEnabled(false);
  } finally {
    edgesToggle.disabled = false;
  }
});

function updatePerPointErrors(placed, perPoint) {
  if (!perPoint) return;
  let worstIdx = -1, worst = -1;
  for (let i = 0; i < perPoint.length; i++) {
    if (perPoint[i] > worst) { worst = perPoint[i]; worstIdx = i; }
  }
  // Only flag as "worst" if it's meaningfully bad AND meaningfully worse than
  // the average - avoids yelling about a 0.4 px "worst" when every point is
  // already sub-pixel accurate.
  const mean = perPoint.reduce((a, b) => a + b, 0) / perPoint.length;
  const flagWorst = worst > 5 && worst > mean * 1.5;
  const byKey = new Map();
  placed.forEach((p, i) => byKey.set(p.key, i));
  listEl.querySelectorAll('.photo-landmark-row').forEach((row) => {
    const idx = byKey.get(row.dataset.key);
    const errEl = row.querySelector('.err');
    if (idx === undefined) { errEl.textContent = ''; errEl.classList.remove('worst'); return; }
    errEl.textContent = perPoint[idx].toFixed(1) + ' px';
    errEl.classList.toggle('worst', flagWorst && idx === worstIdx);
  });
}

async function autoPlace(key, imgXY) {
  photoCanvas.placeLandmark(key, imgXY);
  const row = listEl.querySelector(`[data-key="${key}"]`);
  if (row) {
    row.classList.add('placed');
    row.classList.remove('armed');
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = true;
  }
}

// Core of "Auto-detect goal": finds the goal in the image, solves both
// L/R screen-to-world mappings, keeps the better one, and places the 4
// resulting corner landmarks. Deliberately goal-only - crease auto-detect
// proved unreliable across every real-photo test this session (banner
// text, goalie occlusion, spectator chairs all confuse it) while the goal
// frame, once properly ROI-scoped, has been solid. Crease/board/face-off
// landmarks are left for manual placement. Shared by the manual button
// and the automatic run after zooming into an ROI (docs/plan.md 4.3).
async function detectAndPlace(end) {
  if (!photoCanvas.hasPhoto()) return { ok: false, message: 'load a photo first' };
  const image = photoCanvas.getImage();
  // Explicit ROI-drag wins if set; otherwise scope to whatever's currently
  // on screen if the user has scroll-zoomed in, so "zoom onto the goal,
  // then Auto-detect" narrows the search without a separate ROI gesture.
  const roi = photoCanvas.getRoi() || photoCanvas.getViewRoi();
  const g = await detectGoal(image, roi);
  if (!g) return { ok: false, message: 'auto-detect: no red goal found (place manually)' };

  // Screen L/R doesn't determine world L/R (depends on camera side of
  // the rink). Try both mappings and keep whichever gives lower
  // reprojection error - solvePnP is fast enough that a double-solve
  // is unnoticeable.
  const buildKeyed = (swap) => {
    const L = swap ? 'R' : 'L', R = swap ? 'L' : 'R';
    const [tl, tr, br, bl] = g.corners;
    return [
      [`${end}_postTop${L}`, tl], [`${end}_postTop${R}`, tr],
      [`${end}_post${R}`, br],    [`${end}_post${L}`, bl],
    ];
  };
  const size = photoCanvas.getImageSize();
  const intr = currentIntrinsics(size);
  const toSolveInput = (kp) => kp.map(([key, image]) => ({ world: WORLD_LANDMARKS[key], image }));
  let chosenKp;
  try {
    const kpA = buildKeyed(false), kpB = buildKeyed(true);
    const [poseA, poseB] = await Promise.all([
      solveCameraPose(toSolveInput(kpA), intr, size.w, size.h),
      solveCameraPose(toSolveInput(kpB), intr, size.w, size.h),
    ]);
    chosenKp = poseB.reprojErrorPx < poseA.reprojErrorPx ? kpB : kpA;
  } catch {
    // Fall back to non-swapped if one of the trial solves fails (rare -
    // happens on very degenerate landmark layouts).
    chosenKp = buildKeyed(false);
  }
  for (const [key, xy] of chosenKp) await autoPlace(key, xy);
  // Safety net: only reset zoom if a placed point would actually be
  // off-screen (e.g. a very tight ROI) - not expected in the normal case
  // now that only the 4 goal points get auto-placed.
  if (!photoCanvas.arePointsVisible(chosenKp.map(([key]) => key))) {
    photoCanvas.resetView();
  }
  return {
    ok: true,
    count: chosenKp.length,
    message: 'auto-detect: goal placed - review + nudge, then place crease/board/face-off landmarks manually',
  };
}

// Runs auto-detect + solve, then either shows the "aligned for you" banner
// or falls back to guided hints - shared by whichever call site currently
// triggers auto-align (docs/plan.md 4.3 Step 2: only once the user has
// zoomed into the goal area, not on file load).
async function tryAutoAlign(end) {
  try {
    await detectAndPlace(end);
  } catch (err) {
    console.error('auto-align failed', err);
  }
  const pose = await trySolve();
  if (pose && pose.reprojErrorPx < 10 && photoCanvas.getPlacedPoints().length >= MIN_LANDMARKS) {
    autoBanner.style.display = 'block';
  } else {
    startGuidedHints(end);
  }
}

autoDetectBtn.addEventListener('click', async () => {
  if (!photoCanvas.hasPhoto()) { errorEl.textContent = 'load a photo first'; return; }
  endGuidedHints();
  const end = autoDetectEnd.value === 'B' ? 'goalB' : 'goalA';
  const prev = autoDetectBtn.textContent;
  autoDetectBtn.disabled = true;
  autoDetectBtn.textContent = 'Detecting...';
  try {
    const result = await detectAndPlace(end);
    errorEl.textContent = result.message;
    errorEl.classList.toggle('bad', !result.ok);
    errorEl.classList.remove('ok');
    trySolve();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'auto-detect failed: ' + (err.message || err);
    errorEl.classList.add('bad');
  } finally {
    autoDetectBtn.disabled = false;
    autoDetectBtn.textContent = prev;
  }
});

// A goal viewed near head-on is close to bilaterally symmetric, so the L/R
// swap trial in detectAndPlace can end up choosing near-tied reprojection
// errors (observed: differing in the 6th decimal place) - no amount of
// "pick the lower error" reliably resolves that. Swap the KEYS of the 4
// goal points (pixel positions stay put) so the user can fix a mirrored
// result in one click instead of re-placing everything by hand.
flipLRBtn.addEventListener('click', () => {
  const end = autoDetectEnd.value === 'B' ? 'goalB' : 'goalA';
  const placedByKey = new Map(photoCanvas.getPlacedPoints().map((p) => [p.key, p.image]));
  const pairs = [
    [`${end}_postTopL`, `${end}_postTopR`],
    [`${end}_postL`, `${end}_postR`],
  ];
  let swapped = 0;
  for (const [a, b] of pairs) {
    const xyA = placedByKey.get(a), xyB = placedByKey.get(b);
    if (xyA && xyB) {
      photoCanvas.placeLandmark(a, xyB);
      photoCanvas.placeLandmark(b, xyA);
      swapped++;
    }
  }
  if (swapped === 0) {
    errorEl.textContent = 'no goal post landmarks placed yet - nothing to flip';
    errorEl.classList.add('bad');
    errorEl.classList.remove('ok');
    return;
  }
  trySolve();
});

autoFovBtn.addEventListener('click', async () => {
  const placed = photoCanvas.getPlacedPoints();
  if (placed.length < MIN_LANDMARKS) {
    errorEl.textContent = `place ${MIN_LANDMARKS} landmarks first, then auto-tune`;
    return;
  }
  const size = photoCanvas.getImageSize();
  if (!size) return;
  const k1 = currentK1();
  const points = placed.map((p) => ({ world: WORLD_LANDMARKS[p.key], image: p.image }));
  const prev = autoFovBtn.textContent;
  autoFovBtn.disabled = true;
  autoFovBtn.textContent = 'Sweeping...';
  try {
    // Coarse sweep 20..90 in 2° steps, then fine sweep +/- 3° around best in 0.5° steps.
    const solveAt = async (deg) => {
      const fx = size.w / (2 * Math.tan((deg * Math.PI / 180) / 2));
      const intr = { fx, fy: fx, cx: size.w / 2, cy: size.h / 2, k1 };
      try {
        const pose = await solveCameraPose(points, intr, size.w, size.h);
        return pose.reprojErrorPx;
      } catch { return Infinity; }
    };
    let best = { deg: Number(fovSlider.value), err: Infinity };
    for (let d = 20; d <= 90; d += 2) {
      const err = await solveAt(d);
      if (err < best.err) best = { deg: d, err };
    }
    for (let d = best.deg - 3; d <= best.deg + 3; d += 0.5) {
      if (d < 20 || d > 90) continue;
      const err = await solveAt(d);
      if (err < best.err) best = { deg: d, err };
    }
    fovSlider.value = Math.round(best.deg * 2) / 2;
    fovValue.textContent = fovSlider.value + '° (auto)';
    trySolve();
    errorEl.textContent = `auto FOV: ${fovSlider.value}° (reproj ${best.err.toFixed(1)} px)`;
    errorEl.classList.toggle('bad', best.err > 10);
    errorEl.classList.toggle('ok', best.err <= 10);
  } finally {
    autoFovBtn.disabled = false;
    autoFovBtn.textContent = prev;
  }
});

roiBtn.addEventListener('click', () => {
  if (!photoCanvas.hasPhoto()) { errorEl.textContent = 'load a photo first'; return; }
  if (photoCanvas.getRoi()) {
    photoCanvas.clearRoi();
    photoCanvas.resetView();
    roiBtn.textContent = 'Draw + zoom to goal region';
    errorEl.textContent = 'ROI cleared';
    return;
  }
  photoCanvas.setRoiMode(true);
  roiBtn.textContent = 'Drag on photo to set ROI...';
  errorEl.textContent = 'left-click-drag around the goal';
});
photoCanvas.setRoiChangeHandler((r) => {
  roiBtn.textContent = r ? 'Clear ROI + reset zoom' : 'Draw + zoom to goal region';
  if (r) {
    photoCanvas.zoomToRoi(r);
    errorEl.textContent = 'zoomed in - detecting...';
    // This IS "zoomed into the goal area" (docs/plan.md 4.3 Step 2) - the
    // one point auto-detect's search window can actually be trusted, so
    // this is where auto-align now runs (not on file load - see the
    // fileInput handler above).
    tryAutoAlign(autoDetectEnd.value === 'B' ? 'goalB' : 'goalA');
  }
});

enterBtn.addEventListener('click', async () => {
  if (!photoCanvas.hasPhoto()) { errorEl.textContent = 'load a photo first'; return; }
  // The photo canvas may be zoomed/panned from calibration - reset to fit
  // BEFORE solving so preview strips get drawn at baseRect coords, which is
  // the same rect the WebGL renderer is sized to (fitToPhotoRect). Otherwise
  // the two canvases end up at different scales and the preview drifts off
  // the 3D mesh even though both use the same camera pose.
  photoCanvas.resetView();
  const pose = await trySolve();
  if (!pose) return;
  enterPhoto();
  fitToPhotoRect(photoCanvas.getPhotoRect());
  setOverlayOpacity(Number(opacitySlider.value) / 100);
  setCalibrating(false); // locked in: let clicks reach the 3D scene again (chips etc.)
  photoCanvas.setShowMarkers(false); // clean comparison view, not cluttered with calibration crosshairs
});

exitBtn.addEventListener('click', () => {
  exitPhoto();
  setCalibrating(photoCanvas.hasPhoto()); // still have a photo loaded - resume landmark picking
  photoCanvas.setShowMarkers(true);
});

function leaveRinkFit() {
  photoCanvas.setRinkFitEnabled(false);
  rinkFitPanel.style.display = 'none';
}

rinkFitBtn.addEventListener('click', () => {
  if (!photoCanvas.hasPhoto()) { errorEl.textContent = 'load a photo first'; return; }
  endGuidedHints();
  syncBorderFocus();
  photoCanvas.setRinkFitEnabled(true);
  rinkFitPanel.style.display = 'block';
  errorEl.textContent = 'drag the outline onto the boards in the photo, then "Use this fit"';
  errorEl.classList.remove('bad', 'ok');
});

rinkFitMirror.addEventListener('change', () => photoCanvas.setRinkFitMirror(rinkFitMirror.checked));
rinkFitUseTop.addEventListener('change', () => photoCanvas.setRinkFitUseTop(rinkFitUseTop.checked));

rinkFitConfirmBtn.addEventListener('click', async () => {
  const landmarks = photoCanvas.getRinkFitLandmarks();
  const entries = landmarks ? Object.entries(landmarks) : [];
  console.log('[photo-overlay] rink-outline confirm:', entries.length, 'of 6 in bounds', entries.map(([k]) => k));
  debugLog('rinkFit:confirm', { inBoundsCount: entries.length, keys: entries.map(([k]) => k) });
  if (entries.length === 0) {
    errorEl.textContent = 'every corner/mid handle is outside the photo - drag at least one onto the visible boards';
    errorEl.classList.add('bad');
    errorEl.classList.remove('ok');
    return;
  }
  for (const [key, imgXY] of entries) {
    await autoPlace(key, imgXY);
  }
  leaveRinkFit();
  trySolve();
});

rinkFitCancelBtn.addEventListener('click', leaveRinkFit);

window.addEventListener('resize', () => {
  if (isPhoto() && photoCanvas.hasPhoto()) fitToPhotoRect(photoCanvas.getPhotoRect());
});

buildList();
