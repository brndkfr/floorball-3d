// Photo Overlay panel: upload a match photo, click rink landmarks on it,
// solve for the camera pose (pnp.js) and lock the 3D view to it so a
// scheme can be checked/aligned against the real photo. See
// docs/photo-overlay-plan.md Phase 1.
import { state } from '../../state.js';
import { photoCamera, renderer } from '../../scene.js';
import { ensureDoc } from '../doc.js';
import { saveDoc } from '../storage.js';
import { WORLD_LANDMARKS, LANDMARK_LABELS, MIN_LANDMARKS } from './landmarks.js';
import { isHistoryCommitAction } from './photo-history.js';
import { solveCameraPose } from './pnp.js';
import { assessPlanarity, findLeverageOutliers, isAmbiguousChoice } from './pose-diagnostics.js';
import * as photoCanvas from './photo-canvas.js';
import { enterPhoto, exitPhoto, isPhoto, fitToPhotoRect, setOverlayOpacity } from './view.js';
import { enableWireframeOverlay, disableWireframeOverlay } from './wireframe.js';
import { detectGoal, computeEdgeOverlay } from './detect.js';
import { detectPlayers } from './detect-players.js';
import { detectPose, matchPoseToPlayers, detectPoseInBoxes } from './detect-pose.js';
import { facingFromKeypoints } from './facing-from-pose.js';
import { isLowConfidenceFacing } from './facing-confidence.js';
import { detectGoalieForEnd } from './detect-goalie.js';
import { segmentPlayer } from './segment-player.js';
import { backProjectPlayers, backProjectFoot } from './back-project.js';
import { assignTeams } from './team-cluster.js';
import { readFocalLength35mm, focal35mmToHFovDeg } from './exif.js';
import * as borderMode from './border-mode.js';
import { RINK_L, HALF_W, GOAL_LINE_FROM_BOARD } from '../../constants.js';
import { CHIP_RADIUS, CHIP_DISPLAY_SCALE } from '../chips.js';
import * as photoCache from './photo-cache.js';
import { recomputeInsights } from './insights-overlay.js';
import { enterPhotoPreview3D, exitPhotoPreview3D, isPhotoPreview3D } from './preview-3d.js';
import {
  currentStep as computeCurrentStep,
  stepStatuses as computeStepStatuses,
  guidedHint as computeGuidedHint,
  STEP_PHOTO,
  STEP_ALIGN,
  STEP_PLAYERS,
  STEP_INSIGHTS,
} from './photo-step-tracker.js';

// Structured, in-page debug log (capped) so calibration state can be
// inspected from devtools/automation at any later point in the session,
// not just at the moment console.log happened to print it.
function debugLog(event, data) {
  console.log(`[photo-overlay] ${event}`, data);
  const log = (window.__photoOverlayDebugLog ??= []);
  log.push({ t: Date.now(), event, data });
  if (log.length > 200) log.shift();
}

// S-BACK-012 (remainder): push an undo entry for a discrete photo-overlay
// edit. `action` is checked against photo-history.js's commit list so a
// stray call from a continuous-input path (sliders, drag-in-progress) is
// a silent no-op instead of spamming the stack. Late import to avoid a
// circular dep, same pattern as chips.js/shapes.js's own pushHistory calls.
function commitPhotoAction(action) {
  if (!isHistoryCommitAction(action)) return;
  import('../history.js').then((h) => h.pushHistory());
}

const fileInput = document.getElementById('photoFileInput');
const restoreRow = document.getElementById('photoRestoreRow');
const restoreLabel = document.getElementById('photoRestoreLabel');
const restoreLandmarksBtn = document.getElementById('photoRestoreLandmarksBtn');
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
const wireframeToggle = document.getElementById('photoWireframeToggle');
const hintPanel = document.getElementById('photoHintPanel');
const hintText = document.getElementById('photoHintText');
const hintDiagram = document.getElementById('photoHintDiagram');
const hintSkipBtn = document.getElementById('photoHintSkipBtn');
const landmarksDetails = document.getElementById('photoLandmarksDetails');

const step3Details = document.getElementById('photoStep3Details');
const autoDetectPlayersBtn = document.getElementById('photoAutoDetectPlayersBtn');
const flipTeamsBtn = document.getElementById('photoFlipTeamsBtn');
const setBallBtn = document.getElementById('photoSetBallBtn');
const bodyOutlineToggle = document.getElementById('photoBodyOutlineToggle');
const step3Status = document.getElementById('photoStep3Status');
const STEP3_MAX_REPROJ_ERROR_PX = 20;
const step3Cta = document.getElementById('photoStep3Cta');
const step3Hint = document.getElementById('photoStep3Hint');
const step3PrimaryBtn = document.getElementById('photoStep3PrimaryBtn');
const step4Cta = document.getElementById('photoStep4Cta');
const step4Hint = document.getElementById('photoStep4Hint');
const step4PrimaryBtn = document.getElementById('photoStep4PrimaryBtn');
const stepperEl = document.getElementById('photoStepper');
const setTeamHomeBtn = document.getElementById('photoSetTeamHomeBtn');
const setTeamAwayBtn = document.getElementById('photoSetTeamAwayBtn');
const deletePlayerBtn = document.getElementById('photoDeletePlayerBtn');
const clearSelFacingBtn = document.getElementById('photoClearSelFacingBtn');
const addPlayerHomeBtn = document.getElementById('photoAddPlayerHomeBtn');
const addPlayerAwayBtn = document.getElementById('photoAddPlayerAwayBtn');
const estimateFacingsBtn = document.getElementById('photoEstimateFacingsBtn');
const feedbackToggle = document.getElementById('photoFeedbackToggle');
const feedbackControls = document.getElementById('photoFeedbackControls');
const copyFeedbackBtn = document.getElementById('photoCopyFeedbackBtn');
const clearFeedbackBtn = document.getElementById('photoClearFeedbackBtn');
const feedbackStatus = document.getElementById('photoFeedbackStatus');
const step4Details = document.getElementById('photoStep4Details');
const targetGoalFieldset = document.getElementById('photoTargetGoalFieldset');
const targetGoalARadio = document.getElementById('photoTargetGoalA');
const targetGoalBRadio = document.getElementById('photoTargetGoalB');
const goalieHomeSelect = document.getElementById('photoGoalieHome');
const goalieAwaySelect = document.getElementById('photoGoalieAway');
const autoAssignGoaliesBtn = document.getElementById('photoAutoAssignGoaliesBtn');
const resetFacingBtn = document.getElementById('photoResetFacingBtn');
const insightsReadout = document.getElementById('photoInsightsReadout');
const view3dBtn = document.getElementById('photoView3dBtn');

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
        trySolve('landmark-delete');
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
  trySolve('landmark-place');
});

// Dragging an already-placed marker (photo-canvas.js) nudges its stored
// pixel position live; only re-solve once the drag ends, not every frame.
photoCanvas.setMarkerMovedHandler(() => { trySolve('landmark-move'); });
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
    trySolve('landmark-delete');
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
  trySolve('landmark-place');
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
// Last successful pose (with its projectWorld closure) - cached so Step 3
// can re-project frame.photo.players/ball to image px on every chip/ball
// drag WITHOUT re-running solvePnP (which would visibly lag, see T5 notes
// in docs/phase-2-plan.md).
let lastPose = null;
export function getLastPose() { return lastPose; }

async function trySolve(historyAction = null) {
  const seq = ++solveSeq;
  const placed = photoCanvas.getPlacedPoints();
  if (placed.length < MIN_LANDMARKS) {
    if (seq === solveSeq) {
      errorEl.textContent = `${placed.length}/${MIN_LANDMARKS} landmarks placed`;
      errorEl.classList.remove('bad', 'ok');
      photoCanvas.setPreviewStrips([]);
      updatePerPointErrors([], []);
      borderMode.setCoplanarWarning(false);
      lastPose = null;
      updateStep3Enabled();
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
    // Warn if the point set is (near-)coplanar - solvePnP has a depth/FOV
    // ambiguity on planar sets that Auto-tune FOV can drive to nonsense.
    // assessPlanarity checks the actual 3D spread (via covariance
    // determinant) rather than assuming Y is the missing axis, so it also
    // catches degenerate sets that aren't the "all floor" / "all board-top"
    // cases this app's landmark set usually produces.
    const coplanar = assessPlanarity(points.map((p) => p.world)).degenerate;
    borderMode.setCoplanarWarning(coplanar);
    // B-BUG-003: a far-away point (board/centre-line, ~16-20m from the goal
    // cluster) has outsized leverage on the solve - a small pixel slip there
    // can drag the whole pose off while an equally-sloppy near-goal point
    // barely moves it. Flag it by name so the user knows WHICH point to
    // re-check instead of guessing from the aggregate error alone.
    const leveragePoints = findLeverageOutliers(
      placed.map((p) => ({ key: p.key, world: WORLD_LANDMARKS[p.key] })),
      pose.perPointErrorPx,
    );
    errorEl.textContent = `reprojection error: ${pose.reprojErrorPx.toFixed(1)} px (${placed.length} pts)`
      + (coplanar ? ' - warning: all points coplanar, add crease/post landmarks' : '')
      + (leveragePoints.length
        ? ` - warning: ${leveragePoints.map((k) => LANDMARK_LABELS[k] || k).join(', ')} far from the other points and may be destabilizing the pose - re-check its placement`
        : '');
    errorEl.classList.toggle('bad', pose.reprojErrorPx > 10 || coplanar || leveragePoints.length > 0);
    errorEl.classList.toggle('ok', pose.reprojErrorPx <= 10 && !coplanar && leveragePoints.length === 0);
    updatePerPointErrors(placed, pose.perPointErrorPx, leveragePoints);
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
    // aspect otherwise only gets synced to the photo in fitToPhotoRect(),
    // which is gated on isPhoto() (post "Enter Photo View") - Step 3's
    // back-projection runs during calibration too and needs photoCamera's
    // projection matrix to already match the photo's aspect ratio, or its
    // THREE-based unproject() disagrees with pose.projectWorld()'s OpenCV
    // math and chips/ball render far from where they were clicked.
    photoCamera.aspect = size.w / size.h;
    photoCamera.updateProjectionMatrix();
    // photoCamera isn't part of the actively-rendered scene graph during
    // calibration (it only becomes the active camera after "Enter Photo
    // View"), so THREE never auto-updates its matrixWorld/matrixWorldInverse
    // from the position/quaternion just set above - unproject()/project()
    // would silently keep using a stale (identity) matrix without this.
    photoCamera.updateMatrixWorld(true);
    lastPose = pose;

    const frame = ensureDoc().frames[state.doc.currentFrame];
    const prevPhoto = frame.photo || {};
    frame.photo = {
      landmarks: placed.map((p) => ({ key: p.key, px: p.image })),
      imageWH: [size.w, size.h], // "is this the same photo" fingerprint, see restoreSavedOverlay()
      intrinsics,
      camera: { position: pose.position.toArray(), quaternion: pose.quaternion.toArray(), fov: pose.fov },
      reprojErrorPx: pose.reprojErrorPx,
      // Preserve Step 3 data across re-solves (FOV/k1 tweaks, marker drags) -
      // trySolve used to overwrite the whole frame.photo object, which would
      // silently wipe out already-detected players/ball.
      players: prevPhoto.players,
      ball: prevPhoto.ball,
      ballCarrier: prevPhoto.ballCarrier,
      facingDeg: prevPhoto.facingDeg,
      targetGoal: prevPhoto.targetGoal ?? null,
      goalies: prevPhoto.goalies ?? { home: null, away: null },
    };
    saveDoc();
    commitPhotoAction(historyAction);
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
    updateStep3Enabled();
    renderPlayersAndBall();
    return pose;
  } catch (err) {
    if (seq !== solveSeq) return null;
    errorEl.textContent = err.message || 'solve failed';
    errorEl.classList.add('bad');
    errorEl.classList.remove('ok');
    lastPose = null;
    updateStep3Enabled();
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
  photoCache.saveCachedPhoto(file);
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
  lastPose = null;
  photoCanvas.setBallPlacementMode(false);
  setBallBtn.textContent = 'Set ball';
  step3Status.textContent = '';
  updateStep3Enabled();
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
  checkRestoreAvailable();
});

// Testing/iteration convenience (kept separate from the doc/localStorage
// saveDoc() path, see photo-cache.js): frame.photo.landmarks/intrinsics are
// already saved on every solve, but nothing replayed them onto a freshly
// (re)loaded photo. imageWH is a lightweight "is this the same photo"
// fingerprint - if it doesn't match the just-loaded image, skip silently
// rather than risk applying stale pixel coordinates to a different photo.
function checkRestoreAvailable() {
  const saved = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  const size = photoCanvas.getImageSize();
  const match = !!(saved?.landmarks?.length && saved.imageWH && size
    && saved.imageWH[0] === size.w && saved.imageWH[1] === size.h);
  restoreRow.style.display = match ? 'block' : 'none';
  if (match) restoreLabel.textContent = `${saved.landmarks.length} saved landmarks available`;
  return match;
}

function restoreSavedOverlay() {
  const saved = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  if (!saved?.landmarks?.length) return;
  endGuidedHints();
  if (saved.intrinsics) {
    const size = photoCanvas.getImageSize();
    const hfovDeg = Math.round(2 * Math.atan(size.w / (2 * saved.intrinsics.fx)) * 180 / Math.PI);
    if (hfovDeg >= Number(fovSlider.min) && hfovDeg <= Number(fovSlider.max)) {
      fovSlider.value = hfovDeg;
      fovValue.textContent = hfovDeg + '°';
    }
    k1Slider.value = Math.round((saved.intrinsics.k1 || 0) / K1_SCALE);
    k1Value.textContent = currentK1().toFixed(2);
  }
  for (const { key, px } of saved.landmarks) {
    if (!(key in WORLD_LANDMARKS)) continue; // dynamic boardTop_ keys aren't restorable (world coord lives only in that session's border-mode state)
    photoCanvas.placeLandmark(key, px);
    const row = listEl.querySelector(`[data-key="${key}"]`);
    if (row) {
      row.classList.add('placed');
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = true;
    }
  }
  trySolve();
  restoreRow.style.display = 'none';
}

restoreLandmarksBtn.addEventListener('click', restoreSavedOverlay);

// Auto-load of the last cached photo was removed - it hijacked Plan mode
// on every reload. The cache is still populated on solve, and the "Load
// saved overlay" button (Step 2) still replays saved landmarks + pose
// once the user re-picks the same photo file in Step 1.

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

function updatePerPointErrors(placed, perPoint, leverageKeys = []) {
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
  const leverageSet = new Set(leverageKeys);
  const byKey = new Map();
  placed.forEach((p, i) => byKey.set(p.key, i));
  listEl.querySelectorAll('.photo-landmark-row').forEach((row) => {
    const idx = byKey.get(row.dataset.key);
    const errEl = row.querySelector('.err');
    if (idx === undefined) { errEl.textContent = ''; errEl.classList.remove('worst', 'leverage'); return; }
    errEl.textContent = perPoint[idx].toFixed(1) + ' px';
    errEl.classList.toggle('worst', flagWorst && idx === worstIdx);
    const isLeverage = leverageSet.has(row.dataset.key);
    errEl.classList.toggle('leverage', isLeverage);
    errEl.title = isLeverage
      ? 'Far from the other placed points - a small placement error here has outsized effect on the solved pose (B-BUG-003)'
      : '';
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
  const candidateKeys = new Set(buildKeyed(false).map(([key]) => key));
  // B-BACK-006: a goal viewed near head-on is close to bilaterally
  // symmetric, so deciding L/R from JUST these 4 points can be a near-exact
  // tie (observed: reprojection errors differing in the 6th decimal place).
  // Any landmark already placed elsewhere on the rink (other end, crease,
  // board, face-off) almost always breaks that local symmetry, since a real
  // camera is rarely dead-centered on the rink's mirror axis - so fold in
  // whatever's already placed before comparing the two hypotheses.
  const otherPlaced = toSolveInput(
    photoCanvas.getPlacedPoints()
      .filter((p) => !candidateKeys.has(p.key))
      .map((p) => [p.key, p.image]),
  );
  let chosenKp, ambiguous;
  try {
    const kpA = buildKeyed(false), kpB = buildKeyed(true);
    const [poseA, poseB] = await Promise.all([
      solveCameraPose([...toSolveInput(kpA), ...otherPlaced], intr, size.w, size.h),
      solveCameraPose([...toSolveInput(kpB), ...otherPlaced], intr, size.w, size.h),
    ]);
    chosenKp = poseB.reprojErrorPx < poseA.reprojErrorPx ? kpB : kpA;
    ambiguous = isAmbiguousChoice(poseA.reprojErrorPx, poseB.reprojErrorPx);
  } catch {
    // Fall back to non-swapped if one of the trial solves fails (rare -
    // happens on very degenerate landmark layouts). Can't tell L from R
    // here, so treat it as unresolved rather than silently guessing.
    chosenKp = buildKeyed(false);
    ambiguous = true;
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
    ambiguous,
    message: ambiguous
      ? 'auto-detect: goal placed, but left/right could not be confidently resolved (near head-on view) - check the overlay and use "Flip left/right" if it looks mirrored'
      : 'auto-detect: goal placed - review + nudge, then place crease/board/face-off landmarks manually',
  };
}

// Runs auto-detect + solve, then either shows the "aligned for you" banner
// or falls back to guided hints - shared by whichever call site currently
// triggers auto-align (docs/plan.md 4.3 Step 2: only once the user has
// zoomed into the goal area, not on file load).
async function tryAutoAlign(end) {
  let ambiguous = false;
  try {
    ambiguous = !!(await detectAndPlace(end)).ambiguous;
  } catch (err) {
    console.error('auto-align failed', err);
  }
  const pose = await trySolve('auto-detect-goal');
  // B-BACK-006: a good reprojection error alone doesn't mean the pose is
  // right - a near head-on goal can solve cleanly in EITHER L/R mirror, so
  // don't claim "aligned for you" when detectAndPlace couldn't confidently
  // pick a side. Route to guided hints instead, with an explicit nudge to
  // check the flip.
  if (pose && pose.reprojErrorPx < 10 && photoCanvas.getPlacedPoints().length >= MIN_LANDMARKS && !ambiguous) {
    autoBanner.style.display = 'block';
  } else {
    if (ambiguous) {
      errorEl.textContent += ' - left/right unresolved, check "Flip left/right" if the overlay looks mirrored';
      errorEl.classList.add('bad');
      errorEl.classList.remove('ok');
    }
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
    errorEl.classList.toggle('bad', !result.ok || !!result.ambiguous);
    errorEl.classList.remove('ok');
    // trySolve() below overwrites errorEl with the reprojection-error line
    // once it resolves - await it here (instead of the previous fire-and-
    // forget) so the ambiguous warning above isn't silently clobbered a
    // moment later; re-append it once trySolve is done.
    await trySolve('auto-detect-goal');
    if (result.ambiguous) {
      errorEl.textContent += ' - left/right unresolved, verify with "Flip left/right" if mirrored';
      errorEl.classList.add('bad');
      errorEl.classList.remove('ok');
    }
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
  trySolve('landmark-flip-lr');
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
    trySolve('auto-tune-fov');
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
  if (wireframeToggle.checked) enableWireframeOverlay();
  setCalibrating(false); // locked in: let clicks reach the 3D scene again (chips etc.)
  photoCanvas.setShowMarkers(false); // clean comparison view, not cluttered with calibration crosshairs
});

exitBtn.addEventListener('click', () => {
  disableWireframeOverlay();
  exitPhoto();
  setCalibrating(photoCanvas.hasPhoto()); // still have a photo loaded - resume landmark picking
  photoCanvas.setShowMarkers(true);
});

wireframeToggle.addEventListener('change', () => {
  if (!isPhoto()) return; // takes effect on the next Enter Photo View
  if (wireframeToggle.checked) enableWireframeOverlay();
  else disableWireframeOverlay();
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
  trySolve('landmark-place');
});

rinkFitCancelBtn.addEventListener('click', leaveRinkFit);

window.addEventListener('resize', () => {
  if (isPhoto() && photoCanvas.hasPhoto()) fitToPhotoRect(photoCanvas.getPhotoRect());
});

// Step 3 - Players & ball (Phase 2, docs/phase-2-plan.md T5). Disabled until
// a usable pose exists (reprojErrorPx below threshold); only re-projects
// world -> image px on every render (does NOT re-run solvePnP).
function updateStep3Enabled() {
  const enabled = !!(lastPose && lastPose.reprojErrorPx < STEP3_MAX_REPROJ_ERROR_PX);
  autoDetectPlayersBtn.disabled = !enabled;
  flipTeamsBtn.disabled = !enabled;
  setBallBtn.disabled = !enabled;
  addPlayerHomeBtn.disabled = !enabled;
  addPlayerAwayBtn.disabled = !enabled;
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  const hasPlayers = !!(photo?.players && photo.players.length);
  estimateFacingsBtn.disabled = !enabled || !hasPlayers;
  updateStepper();
}

// Snapshot of the current calibration + scene state used by the guided
// stepper (B-BUG-002). Kept intentionally minimal - matches the input
// shape of photo-step-tracker.currentStep().
function stepperSnapshot() {
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  const placedCount = photoCanvas.getPlacedPoints?.().length || 0;
  return {
    hasPhoto: photoCanvas.hasPhoto?.() || false,
    landmarkCount: placedCount,
    reprojErrorPx: lastPose?.reprojErrorPx ?? null,
    playerCount: photo?.players?.length || 0,
    hasBall: !!(photo?.ball),
    minLandmarks: MIN_LANDMARKS,
    maxReprojErrorPx: STEP3_MAX_REPROJ_ERROR_PX,
  };
}

let lastStepperStep = null;
function updateStepper() {
  if (!stepperEl) return;
  const snap = stepperSnapshot();
  const step = computeCurrentStep(snap);
  const statuses = computeStepStatuses(snap);
  const hint = computeGuidedHint(snap);
  for (const el of stepperEl.querySelectorAll('.ps-step')) {
    const n = Number(el.dataset.step);
    el.classList.remove('active', 'complete', 'pending');
    el.classList.add(statuses[n]);
    el.setAttribute('aria-current', n === step ? 'step' : 'false');
  }
  // Steps 3/4 hint banner text + primary CTA state.
  if (step3Hint) step3Hint.textContent = step >= STEP_PLAYERS ? hint : 'Solve the camera pose first.';
  if (step4Hint) step4Hint.textContent = step === STEP_INSIGHTS ? hint : 'Needs players + a placed ball first.';
  if (step3PrimaryBtn) step3PrimaryBtn.disabled = autoDetectPlayersBtn.disabled;
  if (step4PrimaryBtn) {
    step4PrimaryBtn.disabled = step !== STEP_INSIGHTS;
    step4PrimaryBtn.textContent = snap.playerCount && !snap.hasBall ? 'Set ball' : 'Pick target goal';
  }
  // Auto-open the details block for the current step so the user doesn't
  // have to hunt for it - only on a transition into that step so a manual
  // collapse the user made isn't fought.
  if (lastStepperStep !== step) {
    if (step === STEP_PLAYERS && step3Details) step3Details.open = true;
    if (step === STEP_INSIGHTS && step4Details) step4Details.open = true;
    lastStepperStep = step;
  }
}

// Stepper pill click: force-open the matching details block and scroll
// it into view. Steps 1/2 scroll to the top of the panel (their controls
// aren't in a details wrapper).
if (stepperEl) {
  stepperEl.addEventListener('click', (e) => {
    const target = e.target.closest('.ps-step');
    if (!target) return;
    const n = Number(target.dataset.step);
    if (n === STEP_PLAYERS && step3Details) {
      step3Details.open = true;
      step3Details.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (n === STEP_INSIGHTS && step4Details) {
      step4Details.open = true;
      step4Details.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (fileInput) {
      fileInput.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
}

// The Step 3/4 primary CTAs are shortcuts to the existing controls the
// stepper is guiding the user toward - reuse the wired buttons instead
// of duplicating handlers.
if (step3PrimaryBtn) {
  step3PrimaryBtn.addEventListener('click', () => {
    if (!autoDetectPlayersBtn.disabled) autoDetectPlayersBtn.click();
  });
}
if (step4PrimaryBtn) {
  step4PrimaryBtn.addEventListener('click', () => {
    const snap = stepperSnapshot();
    if (snap.playerCount && !snap.hasBall && !setBallBtn.disabled) {
      setBallBtn.click();
      return;
    }
    const active = targetGoalARadio.checked || targetGoalBRadio.checked
      ? (targetGoalARadio.checked ? targetGoalARadio : targetGoalBRadio)
      : targetGoalARadio;
    active?.focus();
  });
}

// Ring of image-px points tracing a real-world-radius circle around a floor
// point (y=0), for the same visual language as the rink chip discs
// (chips.js's CHIP_RADIUS * CHIP_DISPLAY_SCALE) - drawn as an outline
// instead of just a fixed-screen-px dot so it foreshortens like a real
// object on the floor would (bigger/rounder near the camera, a thinner
// ellipse far away). Returns null if any sample point is behind the camera.
const FOOTPRINT_RADIUS_MM = CHIP_RADIUS * CHIP_DISPLAY_SCALE;
const FOOTPRINT_SEGMENTS = 20;
function footprintRing(worldX, worldZ) {
  const points = [];
  for (let i = 0; i < FOOTPRINT_SEGMENTS; i++) {
    const a = (i / FOOTPRINT_SEGMENTS) * Math.PI * 2;
    const x = worldX + Math.cos(a) * FOOTPRINT_RADIUS_MM;
    const z = worldZ + Math.sin(a) * FOOTPRINT_RADIUS_MM;
    const px = lastPose.projectWorld(x, 0, z);
    if (!px) return null;
    points.push(px);
  }
  return points;
}

function renderPlayersAndBall() {
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  if (!lastPose || !photo) {
    photoCanvas.setPlayerChips([]);
    photoCanvas.setBallMarker(null);
    return;
  }
  const chips = [];
  const selectedId = photoCanvas.getSelectedChipId();
  const labels = computePlayerLabels(photo.players || []);
  for (const p of photo.players || []) {
    const px = lastPose.projectWorld(p.world[0], p.world[1], p.world[2]);
    if (!px) continue; // behind camera - shouldn't normally happen post-solve
    const ring = footprintRing(p.world[0], p.world[2]);
    const showOutline = bodyOutlineToggle.checked && p.id === selectedId;
    const facingDeg = effectiveFacingDeg(p, photo);
    let facingImagePx = null;
    if (facingDeg != null) {
      const tip = facingTipWorld(p.world, facingDeg);
      facingImagePx = lastPose.projectWorld(tip[0], tip[1], tip[2]);
    }
    const facingLowConfidence = facingImagePx ? isLowConfidenceFacing(p) : false;
    let ghost = null;
    if (p.feedback) {
      ghost = {};
      if (p.feedback.origWorld) {
        const gpx = lastPose.projectWorld(p.feedback.origWorld[0], p.feedback.origWorld[1], p.feedback.origWorld[2]);
        if (gpx) ghost.imagePx = gpx;
      }
      if (p.feedback.origFacingDeg != null) {
        const origPos = p.feedback.origWorld || p.world;
        const tip = facingTipWorld(origPos, p.feedback.origFacingDeg);
        const gtx = lastPose.projectWorld(tip[0], tip[1], tip[2]);
        if (gtx) ghost.facingImagePx = gtx;
      }
    }
    chips.push({ id: p.id, imagePx: px, team: p.team, isCarrier: p.id === photo.ballCarrier, ring, outline: showOutline ? p.outline : null, label: labels.get(p.id), facingImagePx, facingLowConfidence, ghost, corrected: !!p.feedback });
  }
  photoCanvas.setPlayerChips(chips);
  photoCanvas.setBallMarker(photo.ball ? lastPose.projectWorld(photo.ball[0], photo.ball[1], photo.ball[2]) : null);
  const ballGhostWorld = photo.ballFeedback?.origWorld;
  photoCanvas.setBallGhost(ballGhostWorld ? lastPose.projectWorld(ballGhostWorld[0], ballGhostWorld[1], ballGhostWorld[2]) : null);
  updateStep4();
  updateFeedbackStatus();
}

// Draggable facing "nose" (Phase 3.5 polish, docs/plan.md 9 Deferred).
// Originally shown only for the ball carrier + designated goalies (no
// meaningful default existed for anyone else); Phase 5's "Estimate facings
// (pose)" now seeds player.facingDeg for every detected chip, so the arrow
// renders for any chip effectiveFacingDeg() resolves - see B-BACK-003.
// Convention matches updateBallCarrierAndFacing(): facingDeg = atan2(dx, dz),
// 0° points down +z, 90° points down +x.
const FACING_TIP_DISTANCE_MM = 1200;
function facingTipWorld(playerWorld, facingDeg) {
  const rad = facingDeg * Math.PI / 180;
  return [
    playerWorld[0] + Math.sin(rad) * FACING_TIP_DISTANCE_MM,
    0,
    playerWorld[2] + Math.cos(rad) * FACING_TIP_DISTANCE_MM,
  ];
}
export function effectiveFacingDeg(player, photo) {
  if (player.facingDeg != null) return player.facingDeg;
  if (player.role === 'goalie') {
    if (photo?.ball) {
      return Math.atan2(photo.ball[0] - player.world[0], photo.ball[2] - player.world[2]) * 180 / Math.PI;
    }
    // No ball placed yet: face out from own goal toward rink centre.
    // Home defends goal A (low z), away defends goal B (high z) - see the
    // auto-assign goalies comment for the convention.
    const targetZ = player.team === 'home' ? RINK_L : 0;
    return Math.atan2(-player.world[0], targetZ - player.world[2]) * 180 / Math.PI;
  }
  if (player.id === photo?.ballCarrier && photo?.facingDeg != null) return photo.facingDeg;
  return null;
}

// Compute display labels per player, recomputed on every render so team
// changes / role changes / manual placements re-number immediately without
// touching the persisted `frame.photo.players`.
function computePlayerLabels(players) {
  const labels = new Map();
  const teamCounters = { home: 0, away: 0 };
  const sorted = [...players].sort((a, b) => a.id - b.id);
  for (const p of sorted) {
    if (p.role === 'goalie') {
      const end = Math.abs(p.world[2] - GOAL_LINE_FROM_BOARD) <= Math.abs(p.world[2] - (RINK_L - GOAL_LINE_FROM_BOARD)) ? 'A' : 'B';
      labels.set(p.id, `Goalie ${end}`);
      continue;
    }
    const teamKey = p.team === 'home' ? 'A' : p.team === 'away' ? 'B' : '?';
    if (teamKey === '?') { labels.set(p.id, `#${p.id}`); continue; }
    teamCounters[p.team] += 1;
    labels.set(p.id, `Team ${teamKey} #${teamCounters[p.team]}`);
  }
  return labels;
}

// Body-silhouette outline (segment-player.js) is expensive (iterative
// GrabCut), so it only ever runs for the one currently-selected player,
// on demand, and only while the toggle is on - not automatically for
// every detection. Cached on the player record once computed so
// reselecting the same player (or a reload, since it's saved with the
// rest of frame.photo) doesn't recompute it.
let segSeq = 0;
async function handleChipSelected(id) {
  const seq = ++segSeq;
  setTeamHomeBtn.disabled = id == null;
  setTeamAwayBtn.disabled = id == null;
  deletePlayerBtn.disabled = id == null;
  const selForFacing = id == null ? null
    : state.doc?.frames?.[state.doc.currentFrame]?.photo?.players?.find((p) => p.id === id);
  clearSelFacingBtn.disabled = selForFacing?.facingDeg == null;
  if (id == null || !bodyOutlineToggle.checked) { renderPlayersAndBall(); return; }
  const frame = state.doc?.frames?.[state.doc.currentFrame];
  const player = frame?.photo?.players?.find((p) => p.id === id);
  if (!player?.bbox) { renderPlayersAndBall(); return; }
  renderPlayersAndBall(); // show the selection ring immediately, outline follows once computed
  if (player.outline) return; // already cached - renderPlayersAndBall above already picked it up
  const image = photoCanvas.getImage();
  if (!image) return;
  step3Status.textContent = 'computing body outline...';
  try {
    const outline = await segmentPlayer(image, player.bbox);
    if (seq !== segSeq) return; // selection changed again while computing - drop this stale result
    player.outline = outline || [];
    saveDoc();
    step3Status.textContent = outline ? '' : 'could not separate this player from the background';
    renderPlayersAndBall();
  } catch (err) {
    if (seq !== segSeq) return;
    console.error('[photo-overlay] segmentPlayer failed', err);
    step3Status.textContent = 'outline failed: ' + (err.message || err);
  }
}
photoCanvas.setChipSelectedHandler(handleChipSelected);
bodyOutlineToggle.addEventListener('change', () => {
  if (!bodyOutlineToggle.checked) { renderPlayersAndBall(); return; }
  handleChipSelected(photoCanvas.getSelectedChipId());
});

// Per-player team override - "Flip teams" above swaps everyone at once;
// this fixes one mis-clustered chip (team-cluster.js's jersey-colour guess
// is not always right) without touching the rest.
function setSelectedChipTeam(team) {
  const id = photoCanvas.getSelectedChipId();
  if (id == null) return;
  const frame = state.doc?.frames?.[state.doc.currentFrame];
  const player = frame?.photo?.players?.find((p) => p.id === id);
  if (!player) return;
  player.team = team;
  saveDoc();
  commitPhotoAction('player-team-override');
  renderPlayersAndBall();
}
setTeamHomeBtn.addEventListener('click', () => setSelectedChipTeam('home'));
setTeamAwayBtn.addEventListener('click', () => setSelectedChipTeam('away'));

function deleteSelectedChip() {
  const id = photoCanvas.getSelectedChipId();
  if (id == null) return;
  const frame = state.doc?.frames?.[state.doc.currentFrame];
  const photo = frame?.photo;
  if (!photo?.players) return;
  photo.players = photo.players.filter((p) => p.id !== id);
  if (photo.ballCarrier === id) photo.ballCarrier = null;
  if (photo.goalies) {
    if (photo.goalies.home === id) photo.goalies.home = null;
    if (photo.goalies.away === id) photo.goalies.away = null;
  }
  photoCanvas.setChipSelectedHandler && photoCanvas.setChipSelectedHandler(handleChipSelected);
  saveDoc();
  commitPhotoAction('player-delete');
  handleChipSelected(null);
  renderPlayersAndBall();
}
deletePlayerBtn.addEventListener('click', deleteSelectedChip);

// Per-chip facing reset - the "Reset facing" button in Step 4 only clears
// the ball carrier + designated goalies; this clears whichever single chip
// is selected (handy for undoing one bad pose-seeded arrow among many).
function clearSelectedChipFacing() {
  const id = photoCanvas.getSelectedChipId();
  if (id == null) return;
  const frame = state.doc?.frames?.[state.doc.currentFrame];
  const player = frame?.photo?.players?.find((p) => p.id === id);
  if (!player || player.facingDeg == null) return;
  delete player.facingDeg;
  delete player.facingSource;
  delete player.facingCue;
  delete player.facingQuality;
  saveDoc();
  commitPhotoAction('facing-clear-one');
  clearSelFacingBtn.disabled = true;
  renderPlayersAndBall();
  updateStep4(); // recompute insights + refresh the Step-4 "Reset facing" button
}
clearSelFacingBtn.addEventListener('click', clearSelectedChipFacing);

function beginAddPlayer(team) {
  const current = photoCanvas.isAddPlayerMode();
  const already = current && addPlayerHomeBtn.textContent.startsWith('Click') && team === 'home'
    || current && addPlayerAwayBtn.textContent.startsWith('Click') && team === 'away';
  photoCanvas.setAddPlayerMode(already ? null : team);
  updateAddPlayerButtonLabels(already ? null : team);
}
function updateAddPlayerButtonLabels(activeTeam = null) {
  addPlayerHomeBtn.textContent = activeTeam === 'home' ? 'Click photo to place home player...' : 'Add home player';
  addPlayerAwayBtn.textContent = activeTeam === 'away' ? 'Click photo to place away player...' : 'Add away player';
}
addPlayerHomeBtn.addEventListener('click', () => beginAddPlayer('home'));
addPlayerAwayBtn.addEventListener('click', () => beginAddPlayer('away'));

photoCanvas.setAddPlayerClickHandler((team, imgX, imgY) => {
  photoCanvas.setAddPlayerMode(null);
  updateAddPlayerButtonLabels(null);
  const size = photoCanvas.getImageSize();
  if (!size) return;
  const world = backProjectFoot(imgX, imgY, photoCamera, [size.w, size.h]);
  if (!world) { step3Status.textContent = 'clicked above the horizon - try a point lower in the photo'; return; }
  const frame = ensureDoc().frames[state.doc.currentFrame];
  const photo = frame.photo || (frame.photo = { landmarks: [], players: [] });
  const players = photo.players || (photo.players = []);
  const nextId = players.reduce((m, p) => Math.max(m, p.id), -1) + 1;
  players.push({ id: nextId, world, team, bbox: null });
  saveDoc();
  commitPhotoAction('player-add');
  renderPlayersAndBall();
});

function goalCenterNearestZ(z) {
  const goalAZ = GOAL_LINE_FROM_BOARD, goalBZ = RINK_L - GOAL_LINE_FROM_BOARD;
  return Math.abs(z - goalAZ) <= Math.abs(z - goalBZ) ? [0, goalAZ] : [0, goalBZ];
}

// Which goal end ('A'|'B') is nearest a given Z - used both for the
// carrier's default facing (Phase 2) and Step 4's default targetGoal.
function nearestGoalLetter(z) {
  const goalAZ = GOAL_LINE_FROM_BOARD, goalBZ = RINK_L - GOAL_LINE_FROM_BOARD;
  return Math.abs(z - goalAZ) <= Math.abs(z - goalBZ) ? 'A' : 'B';
}

// v1 facing = "point toward the closer goal" (docs/phase-2-plan.md non-goals -
// real facing-direction ML is Phase 4). ballCarrier = nearest player in xz.
function updateBallCarrierAndFacing(photo) {
  const players = photo.players || [];
  let bestId = null, bestDistSq = Infinity;
  for (const p of players) {
    const dx = p.world[0] - photo.ball[0], dz = p.world[2] - photo.ball[2];
    const d = dx * dx + dz * dz;
    if (d < bestDistSq) { bestDistSq = d; bestId = p.id; }
  }
  photo.ballCarrier = bestId;
  const [gx, gz] = goalCenterNearestZ(photo.ball[2]);
  photo.facingDeg = Math.atan2(gx - photo.ball[0], gz - photo.ball[2]) * 180 / Math.PI;
}

// Bounding box (original image px) of the currently placed landmarks for
// whichever goal end is selected in "detect as" - players cluster around
// that goal in a typical shot, so it's used as the search-area seed for
// detectPlayers' ROI crop (see its own comment for why cropping first
// matters). Returns null if none of that end's landmarks are placed yet.
function goalAreaRoi() {
  const prefix = `goal${autoDetectEnd.value}_`;
  const points = photoCanvas.getPlacedPoints().filter((p) => p.key.startsWith(prefix));
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { image: [x, y] } of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

autoDetectPlayersBtn.addEventListener('click', async () => {
  if (!lastPose) return;
  const image = photoCanvas.getImage();
  const size = photoCanvas.getImageSize();
  if (!image || !size) return;
  const prevLabel = autoDetectPlayersBtn.textContent;
  autoDetectPlayersBtn.disabled = true;
  autoDetectPlayersBtn.textContent = 'Detecting...';
  const t0 = performance.now();
  try {
    const roi = goalAreaRoi();
    const rawBoxes = await detectPlayers(image, { roi });
    const teamed = assignTeams(image, rawBoxes);
    const players = backProjectPlayers(teamed, photoCamera, [size.w, size.h]);
    const frame = ensureDoc().frames[state.doc.currentFrame];
    frame.photo.players = players;
    saveDoc();
    commitPhotoAction('player-auto-detect');
    renderPlayersAndBall();
    updateStep3Enabled();
    step3Status.textContent = `${players.length} player(s) detected`;
    debugLog('detectPlayers:step3', {
      imageWH: [size.w, size.h],
      roi,
      rawBoxCount: rawBoxes.length,
      keptAfterRinkFilter: players.length,
      teams: players.map((p) => ({ id: p.id, team: p.team })),
      elapsedMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    console.error('[photo-overlay] auto-detect players failed', err);
    step3Status.textContent = 'auto-detect failed: ' + (err.message || err);
  } finally {
    autoDetectPlayersBtn.disabled = !lastPose;
    autoDetectPlayersBtn.textContent = prevLabel;
  }
});

flipTeamsBtn.addEventListener('click', () => {
  const frame = ensureDoc().frames[state.doc.currentFrame];
  const players = frame.photo?.players;
  if (!players || players.length === 0) return;
  frame.photo.players = players.map((p) => ({
    ...p,
    team: p.team === 'home' ? 'away' : p.team === 'away' ? 'home' : p.team,
  }));
  saveDoc();
  commitPhotoAction('player-flip-teams');
  renderPlayersAndBall();
});

estimateFacingsBtn.addEventListener('click', async () => {
  if (!lastPose) return;
  const image = photoCanvas.getImage();
  const size = photoCanvas.getImageSize();
  if (!image || !size) return;
  const frame = ensureDoc().frames[state.doc.currentFrame];
  const players = frame.photo?.players;
  if (!players?.length) return;

  const prevLabel = estimateFacingsBtn.textContent;
  estimateFacingsBtn.disabled = true;
  estimateFacingsBtn.textContent = 'Estimating...';
  const t0 = performance.now();
  try {
    // Top-down pose: one inference per existing player bbox so each
    // player fills the 640x640 tensor, instead of a single whole-image
    // pass that shrinks distant players below the model's usable
    // keypoint scale (same crop-first pattern as detect.js / memory #16).
    const matches = await detectPoseInBoxes(image, players);
    const seeded = [], skipped = [];
    for (const p of players) {
      // A pose-seeded value from a prior click is refreshable; a true
      // manual drag (facingSource unset by the drag handler) is locked.
      if (p.facingDeg != null && p.facingSource !== 'pose') { skipped.push({ id: p.id, reason: 'manual override' }); continue; }
      const detection = matches.get(p.id);
      if (!detection) { skipped.push({ id: p.id, reason: 'no pose match' }); continue; }
      const result = facingFromKeypoints(detection.keypoints, photoCamera, [size.w, size.h]);
      if (!result) { skipped.push({ id: p.id, reason: 'low-confidence pose' }); continue; }
      p.facingDeg = result.facingDeg;
      p.facingSource = 'pose';
      p.facingQuality = result.quality;
      p.facingCue = result.cue;
      seeded.push({ id: p.id, facingDeg: Math.round(result.facingDeg), quality: +result.quality.toFixed(2), cue: result.cue });
    }
    saveDoc();
    commitPhotoAction('facing-estimate-pose');
    renderPlayersAndBall();
    updateStep4();
    step3Status.textContent = `pose: seeded ${seeded.length}, skipped ${skipped.length}`;
    debugLog('estimateFacings', {
      imageWH: [size.w, size.h],
      matched: matches.size,
      seeded,
      skipped,
      elapsedMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    console.error('[photo-overlay] estimate facings failed', err);
    step3Status.textContent = 'estimate facings failed: ' + (err.message || err);
  } finally {
    estimateFacingsBtn.disabled = false;
    estimateFacingsBtn.textContent = prevLabel;
    updateStep3Enabled();
  }
});

setBallBtn.addEventListener('click', () => {
  const on = !photoCanvas.isBallPlacementMode();
  photoCanvas.setBallPlacementMode(on);
  setBallBtn.textContent = on ? 'Click photo to place ball...' : 'Set ball';
});

photoCanvas.setBallPlacementClickHandler((imgX, imgY) => {
  photoCanvas.setBallPlacementMode(false);
  setBallBtn.textContent = 'Set ball';
  const size = photoCanvas.getImageSize();
  if (!size) return;
  const world = backProjectFoot(imgX, imgY, photoCamera, [size.w, size.h]);
  if (!world) { step3Status.textContent = 'clicked above the horizon - try a point lower in the photo'; return; }
  const frame = ensureDoc().frames[state.doc.currentFrame];
  frame.photo.ball = world;
  updateBallCarrierAndFacing(frame.photo);
  saveDoc();
  commitPhotoAction('ball-place');
  renderPlayersAndBall();
});

// Feedback mode (validation aid): when on, dragging a chip / facing arrow /
// ball snapshots the pre-correction value into the persistent doc so it
// can be exported as JSON later. The pre-correction position renders as a
// grey ghost on the photo, the corrected value gets a green marker.
let feedbackMode = false;
function snapshotPlayerPos(player) {
  if (!feedbackMode) return;
  player.feedback = player.feedback || {};
  if (!('origWorld' in player.feedback)) {
    player.feedback.origWorld = player.world.slice();
    player.feedback.correctedAt = player.feedback.correctedAt || new Date().toISOString();
  }
}
function snapshotPlayerFacing(player, photo) {
  if (!feedbackMode) return;
  player.feedback = player.feedback || {};
  if (!('origFacingDeg' in player.feedback)) {
    player.feedback.origFacingDeg = effectiveFacingDeg(player, photo);
    player.feedback.origFacingSource = player.facingSource || (player.facingDeg != null ? 'manual' : 'auto');
    if (player.facingCue != null) player.feedback.origFacingCue = player.facingCue;
    if (player.facingQuality != null) player.feedback.origFacingQuality = player.facingQuality;
    player.feedback.correctedAt = player.feedback.correctedAt || new Date().toISOString();
  }
}
function snapshotBall(photo) {
  if (!feedbackMode) return;
  if (!photo.ballFeedback) {
    photo.ballFeedback = { origWorld: photo.ball ? photo.ball.slice() : null, correctedAt: new Date().toISOString() };
  }
}
function updateFeedbackStatus() {
  if (!feedbackStatus) return;
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  if (!photo) { feedbackStatus.textContent = 'no photo loaded'; return; }
  const n = (photo.players || []).filter((p) => p.feedback).length + (photo.ballFeedback ? 1 : 0);
  feedbackStatus.textContent = n ? `${n} correction(s) captured` : 'no corrections yet';
}
feedbackToggle.addEventListener('change', () => {
  feedbackMode = feedbackToggle.checked;
  feedbackControls.style.display = feedbackMode ? 'flex' : 'none';
  updateFeedbackStatus();
});
copyFeedbackBtn.addEventListener('click', async () => {
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  if (!photo) return;
  const size = photoCanvas.getImageSize();
  const corrections = (photo.players || []).filter((p) => p.feedback).map((p) => ({
    playerId: p.id,
    team: p.team,
    role: p.role || null,
    position: p.feedback.origWorld ? { orig: p.feedback.origWorld, corrected: p.world } : null,
    facing: 'origFacingDeg' in p.feedback ? {
      orig: p.feedback.origFacingDeg,
      origSource: p.feedback.origFacingSource,
      origCue: p.feedback.origFacingCue ?? null,
      origQuality: p.feedback.origFacingQuality != null ? +p.feedback.origFacingQuality.toFixed(2) : null,
      corrected: effectiveFacingDeg(p, photo),
      correctedSource: p.facingSource || (p.facingDeg != null ? 'manual' : 'auto'),
    } : null,
    correctedAt: p.feedback.correctedAt,
  }));
  const ball = photo.ballFeedback ? {
    orig: photo.ballFeedback.origWorld,
    corrected: photo.ball || null,
    correctedAt: photo.ballFeedback.correctedAt,
  } : null;
  const payload = {
    frame: state.doc.currentFrame,
    imageSize: size ? [size.w, size.h] : null,
    reprojErrorPx: photo.reprojErrorPx ?? null,
    corrections,
    ball,
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    feedbackStatus.textContent = `copied ${corrections.length + (ball ? 1 : 0)} correction(s) to clipboard`;
  } catch (err) {
    console.log('[photo-overlay] feedback JSON (clipboard failed):\n' + text);
    feedbackStatus.textContent = 'clipboard failed - JSON logged to console';
  }
});
clearFeedbackBtn.addEventListener('click', () => {
  const photo = state.doc?.frames?.[state.doc.currentFrame]?.photo;
  if (!photo) return;
  // Restore pre-correction values so pose re-runs cleanly and the diagnostic
  // fields (facingCue/facingQuality) don't get stranded on manual overrides.
  for (const p of photo.players || []) {
    if (!p.feedback) continue;
    if (p.feedback.origWorld) p.world = p.feedback.origWorld.slice();
    if ('origFacingDeg' in p.feedback) {
      if (p.feedback.origFacingSource === 'auto' || p.feedback.origFacingDeg == null) {
        delete p.facingDeg;
        delete p.facingSource;
      } else {
        p.facingDeg = p.feedback.origFacingDeg;
        p.facingSource = p.feedback.origFacingSource;
      }
      if (p.feedback.origFacingCue != null) p.facingCue = p.feedback.origFacingCue; else delete p.facingCue;
      if (p.feedback.origFacingQuality != null) p.facingQuality = p.feedback.origFacingQuality; else delete p.facingQuality;
    }
    delete p.feedback;
  }
  if (photo.ballFeedback) {
    if (photo.ballFeedback.origWorld) photo.ball = photo.ballFeedback.origWorld.slice();
    else delete photo.ball;
    delete photo.ballFeedback;
  }
  saveDoc();
  commitPhotoAction('feedback-clear');
  renderPlayersAndBall();
});

photoCanvas.setPlayerChipMovedHandler((id, imagePx) => {
  const size = photoCanvas.getImageSize();
  const world = size ? backProjectFoot(imagePx[0], imagePx[1], photoCamera, [size.w, size.h]) : null;
  if (!world) { renderPlayersAndBall(); return; } // dragged above the horizon - snap back to last valid position
  const frame = ensureDoc().frames[state.doc.currentFrame];
  const player = frame.photo?.players?.find((p) => p.id === id);
  if (player) {
    snapshotPlayerPos(player);
    player.world = world;
  }
  saveDoc();
  commitPhotoAction('player-move');
  renderPlayersAndBall();
});

photoCanvas.setChipFacingMovedHandler((id, tipImgXY) => {
  const size = photoCanvas.getImageSize();
  const tipWorld = size ? backProjectFoot(tipImgXY[0], tipImgXY[1], photoCamera, [size.w, size.h]) : null;
  if (!tipWorld) { renderPlayersAndBall(); return; }
  const frame = ensureDoc().frames[state.doc.currentFrame];
  const player = frame.photo?.players?.find((p) => p.id === id);
  if (!player) return;
  const dx = tipWorld[0] - player.world[0];
  const dz = tipWorld[2] - player.world[2];
  if (dx * dx + dz * dz < 1) { renderPlayersAndBall(); return; } // dropped on top of the chip: keep prior angle
  snapshotPlayerFacing(player, frame.photo);
  player.facingDeg = Math.atan2(dx, dz) * 180 / Math.PI;
  player.facingSource = 'manual';
  delete player.facingCue;
  delete player.facingQuality;
  saveDoc();
  commitPhotoAction('facing-drag');
  if (photoCanvas.getSelectedChipId() === id) clearSelFacingBtn.disabled = false;
  renderPlayersAndBall();
});

photoCanvas.setBallMovedHandler((imagePx) => {
  const size = photoCanvas.getImageSize();
  const world = size ? backProjectFoot(imagePx[0], imagePx[1], photoCamera, [size.w, size.h]) : null;
  if (!world) { renderPlayersAndBall(); return; }
  const frame = ensureDoc().frames[state.doc.currentFrame];
  if (!frame.photo) return;
  snapshotBall(frame.photo);
  frame.photo.ball = world;
  updateBallCarrierAndFacing(frame.photo);
  saveDoc();
  commitPhotoAction('ball-move');
  renderPlayersAndBall();
});

// Step 4 - Insights (Phase 3, docs/phase-3-plan.md T5). Disabled until a
// usable pose exists AND the ball is placed (Phase-2 prerequisites).
// ids are validated at doc-ingestion time (doc.js's sanitizeDoc), but this
// builds the <select> via DOM nodes rather than an HTML template string
// as a second, independent line of defense against a crafted id reaching
// innerHTML.
function goalieOptionsHtml(players, team, selectedId) {
  const frag = document.createDocumentFragment();
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '-';
  frag.appendChild(blank);
  for (const p of players) {
    if (p.team !== team) continue;
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `#${p.id}`;
    if (p.id === selectedId) opt.selected = true;
    frag.appendChild(opt);
  }
  return frag;
}

function updateStep4() {
  const frame = state.doc?.frames?.[state.doc.currentFrame];
  const photo = frame?.photo;
  const enabled = !!(lastPose && lastPose.reprojErrorPx < STEP3_MAX_REPROJ_ERROR_PX && photo?.ball);
  targetGoalFieldset.disabled = !enabled;
  goalieHomeSelect.disabled = !enabled;
  goalieAwaySelect.disabled = !enabled;
  autoAssignGoaliesBtn.disabled = !enabled;
  view3dBtn.disabled = !enabled;
  if (!enabled) {
    resetFacingBtn.disabled = true;
    insightsReadout.textContent = '-';
    updateStepper();
    return;
  }

  if (photo.targetGoal == null) {
    photo.targetGoal = nearestGoalLetter(photo.ball[2]);
    saveDoc();
  }
  targetGoalARadio.checked = photo.targetGoal === 'A';
  targetGoalBRadio.checked = photo.targetGoal === 'B';

  const players = photo.players || [];
  const goalies = photo.goalies || (photo.goalies = { home: null, away: null });
  goalieHomeSelect.replaceChildren(goalieOptionsHtml(players, 'home', goalies.home));
  goalieAwaySelect.replaceChildren(goalieOptionsHtml(players, 'away', goalies.away));

  const overrideIds = new Set([photo.ballCarrier, goalies.home, goalies.away].filter((v) => v != null));
  const hasOverride = players.some((p) => overrideIds.has(p.id) && p.facingDeg != null);
  resetFacingBtn.disabled = !hasOverride;

  const result = recomputeInsights();
  if (!result) { insightsReadout.textContent = 'place a ball and pick a target goal to see insights'; return; }
  const { shot, coveragePct, passes } = result;
  const clearCount = passes.filter((p) => p.clear).length;
  insightsReadout.textContent = `angle: ${Math.round(shot.angleDeg)}° · dist: ${Math.round(shot.distance)}mm · `
    + `coverage: ${coveragePct != null ? Math.round(coveragePct) + '%' : '-'} · `
    + `clear passes: ${clearCount}/${passes.length}`;
  updateStepper();
}

function setTargetGoal(letter) {
  const frame = ensureDoc().frames[state.doc.currentFrame];
  if (!frame.photo) return;
  frame.photo.targetGoal = letter;
  saveDoc();
  commitPhotoAction('target-goal-select');
  updateStep4();
}
targetGoalARadio.addEventListener('change', () => { if (targetGoalARadio.checked) setTargetGoal('A'); });
targetGoalBRadio.addEventListener('change', () => { if (targetGoalBRadio.checked) setTargetGoal('B'); });

function setGoalie(team, idText) {
  const frame = ensureDoc().frames[state.doc.currentFrame];
  if (!frame.photo) return;
  const id = idText === '' ? null : Number(idText);
  frame.photo.goalies = { ...(frame.photo.goalies || { home: null, away: null }), [team]: id };
  saveDoc();
  commitPhotoAction('goalie-assign');
  updateStep4();
}
goalieHomeSelect.addEventListener('change', () => setGoalie('home', goalieHomeSelect.value));
goalieAwaySelect.addEventListener('change', () => setGoalie('away', goalieAwaySelect.value));

// Layer 1: run YOLO a second time scoped to each goal's crease box at a
// lower threshold (goalies are heavily occluded by the frame/net/pads and
// the Step 3 pass often misses them). Layer 2 (classical-CV blob-in-mouth
// fallback) is deferred; if Layer 1 finds nothing at a goal end we fall
// back to the previous "nearest own-team chip to that goal" heuristic so
// this button never regresses on frames where the general pass already
// caught the goalie.
autoAssignGoaliesBtn.addEventListener('click', async () => {
  const frame = ensureDoc().frames[state.doc.currentFrame];
  const photo = frame.photo;
  if (!photo || !lastPose) return;
  const image = photoCanvas.getImage();
  const size = photoCanvas.getImageSize();
  if (!image || !size) return;

  const prevLabel = autoAssignGoaliesBtn.textContent;
  autoAssignGoaliesBtn.disabled = true;
  autoAssignGoaliesBtn.textContent = 'Detecting goalies...';
  const t0 = performance.now();
  try {
    const players = photo.players || (photo.players = []);
    const nextId = () => players.reduce((m, p) => Math.max(m, p.id), -1) + 1;

    const goalies = { home: null, away: null };
    const autoDetected = { home: null, away: null };
    // Convention: home defends goal A, away defends goal B. The user can
    // flip via the existing "Flip teams" button or the per-team dropdowns.
    for (const [end, team] of [['A', 'home'], ['B', 'away']]) {
      // eslint-disable-next-line no-await-in-loop -- one ORT WASM run at a time
      const detected = await detectGoalieForEnd(image, lastPose, photoCamera, [size.w, size.h], end, {
        existingPlayers: players,
      });
      if (detected) {
        let chipId = detected.existingPlayerId;
        if (chipId == null) {
          chipId = nextId();
          players.push({
            id: chipId,
            world: detected.foot,
            team,
            role: 'goalie',
            bbox: detected.bbox,
          });
        } else {
          const p = players.find((pl) => pl.id === chipId);
          if (p) { p.team = team; p.role = 'goalie'; }
        }
        goalies[team] = chipId;
        autoDetected[team] = { chipId, source: detected.source, confidence: detected.score };
        continue;
      }
      // Layer 1 (+ Layer 1b pose fallback, B-BACK-005) both missed - fall
      // back to nearest own-team chip to this goal.
      const gz = end === 'A' ? GOAL_LINE_FROM_BOARD : RINK_L - GOAL_LINE_FROM_BOARD;
      let bestId = null, bestDistSq = Infinity;
      for (const p of players) {
        if (p.team !== team) continue;
        const dx = p.world[0], dz = p.world[2] - gz;
        const d = dx * dx + dz * dz;
        if (d < bestDistSq) { bestDistSq = d; bestId = p.id; }
      }
      goalies[team] = bestId;
      autoDetected[team] = bestId != null ? { chipId: bestId, source: 'nearest', confidence: null } : null;
    }
    photo.goalies = { ...goalies, autoDetected };
    saveDoc();
    commitPhotoAction('goalie-auto-detect');
    renderPlayersAndBall();
    updateStep4();
    // updateStep4 has already rewritten insightsReadout with the shot/coverage
    // line; append a compact goalie status so the user sees what happened.
    const parts = ['home', 'away'].map((t) => {
      const a = autoDetected[t];
      if (!a) return `${t}: none`;
      if (a.source === 'yolo') return `${t}: #${a.chipId} (yolo ${a.confidence.toFixed(2)})`;
      if (a.source === 'pose') return `${t}: #${a.chipId} (pose ${a.confidence.toFixed(2)})`;
      return `${t}: #${a.chipId} (nearest chip)`;
    });
    insightsReadout.textContent = `goalies · ${parts.join(' · ')}`;
    debugLog('autoAssignGoalies', {
      autoDetected,
      goalies,
      playerCount: players.length,
      elapsedMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    console.error('[photo-overlay] auto-detect goalies failed', err);
    insightsReadout.textContent = 'auto-detect goalies failed: ' + (err.message || err);
  } finally {
    autoAssignGoaliesBtn.disabled = false;
    autoAssignGoaliesBtn.textContent = prevLabel;
  }
});

view3dBtn.addEventListener('click', () => {
  if (isPhotoPreview3D()) {
    exitPhotoPreview3D();
    view3dBtn.textContent = 'View in 2D';
    return;
  }
  const frame = state.doc?.frames?.[state.doc.currentFrame];
  if (!frame?.photo) return;
  enterPhotoPreview3D(frame);
  view3dBtn.textContent = isPhotoPreview3D() ? 'Exit 2D preview' : 'View in 2D';
});

resetFacingBtn.addEventListener('click', () => {
  const frame = ensureDoc().frames[state.doc.currentFrame];
  const photo = frame?.photo;
  if (!photo?.players) return;
  const goalies = photo.goalies || {};
  const overrideIds = new Set([photo.ballCarrier, goalies.home, goalies.away].filter((v) => v != null));
  let changed = false;
  for (const p of photo.players) {
    if (overrideIds.has(p.id) && p.facingDeg != null) {
      delete p.facingDeg;
      delete p.facingSource;
      changed = true;
    }
  }
  if (!changed) return;
  saveDoc();
  commitPhotoAction('facing-reset');
  renderPlayersAndBall();
  updateStep4();
});

updateStep3Enabled();
updateStep4();
buildList();
