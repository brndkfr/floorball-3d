import { initHud } from './hud.js';
import { scene, renderer } from './scene.js';
import { state, getBallWorldCenter } from './state.js';
import { handleKeyboardMovement, clock } from './controls.js';
import { updateTrajectory } from './trajectory.js';
import { updateCoverage, updateGoalieLabel } from './coverage.js';
import { snapshotChanged, copySnapshot } from './dirty-check.js';
import { consumeRenderDirty } from './render-dirty.js';

// side-effect-only modules: each wires up its own DOM listeners and starts
// loading its OBJ/MTL assets as soon as it's imported
import './layers.js';
import './goalie.js';
import './selection.js';
import './touch-controls.js';
import './help.js';
import { updateChipAnimations, tickChoreo, tickActors } from './authoring/index.js';
import { updateDrawPreview } from './authoring/draw-tool.js';
import { tickPlayback } from './authoring/playback.js';
import { updateMoveMarkers } from './authoring/move-marker.js';
import { updateWalks } from './authoring/walk-tween.js';
import { updateFloorLabelOrientations } from './authoring/shapes.js';

initHud();

// S-BACK-011: skip the WebGL render call on a frame where nothing visible
// changed. Cheap per-frame updates (chip animations, playback, trajectory/
// coverage recompute, etc.) still run every frame as before - only the
// renderer.render() draw call itself is gated, since that's the actual
// per-frame cost the plan's perf note was about.
//
// A frame counts as needing a render if ANY of:
//  - render-dirty.js's flag was set since the last frame (the choke point
//    for doc mutations via storage.js's saveDoc(), and layer-visibility
//    toggles that aren't part of the doc - see render-dirty.js's callers).
//  - The active camera's pose/zoom differs from last frame (covers every
//    camera-movement path: WASD walk, mouse-look drag, top-down pan/zoom -
//    polled rather than hooked at each mutation site, since there are many
//    and polling can't miss one).
//  - The selection (primary + full set) differs from last frame (a fresh
//    selection ring/handles need to actually appear).
//  - Any in-flight animation subsystem reports itself active this frame
//    (chip spawn/drop, move-command flash rings, walk-tweens, choreograph
//    ghost arrows), or the draw tool has an in-progress preview, or
//    playback is currently advancing.
//
// This is a best-effort, best-understanding pass, not an exhaustive proof -
// see docs/plan.md S-BACK-011 for what's covered and what to manually
// verify (a missed case would show as a frame that doesn't visibly update
// until something else invalidates it - something no automated test here
// can catch, since Playwright's rAF is paused in an unfocused tab).
const RENDER_POLL_KEYS = [
  'camX', 'camY', 'camZ', 'camQX', 'camQY', 'camQZ', 'camQW', 'camZoom',
  'selected', 'selectedSetKey',
];
const lastRenderState = {
  camX: NaN, camY: NaN, camZ: NaN, camQX: NaN, camQY: NaN, camQZ: NaN, camQW: NaN, camZoom: NaN,
  selected: null, selectedSetKey: '',
};

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  handleKeyboardMovement(dt);
  const chipsActive = updateChipAnimations(dt);
  const markersActive = updateMoveMarkers(dt);
  const walksActive = updateWalks(dt);
  updateDrawPreview();
  tickPlayback(dt * 1000);
  const choreoActive = tickChoreo();
  const actorsActive = tickActors();
  const ballCenter = getBallWorldCenter(); // computed once, shared by both calls below
  updateTrajectory(ballCenter);
  updateCoverage(ballCenter);
  updateGoalieLabel();
  const labelsChanged = updateFloorLabelOrientations(state.activeCamera);

  const cam = state.activeCamera;
  const nextRenderState = {
    camX: cam.position.x, camY: cam.position.y, camZ: cam.position.z,
    camQX: cam.quaternion.x, camQY: cam.quaternion.y, camQZ: cam.quaternion.z, camQW: cam.quaternion.w,
    camZoom: cam.zoom,
    selected: state.selected,
    selectedSetKey: state.selectedSet.map((o) => o.uuid).join(','),
  };
  const pollChanged = snapshotChanged(lastRenderState, nextRenderState, RENDER_POLL_KEYS);
  if (pollChanged) copySnapshot(lastRenderState, nextRenderState, RENDER_POLL_KEYS);

  // consumeRenderDirty() must run every frame (it's edge-triggered) - keep
  // it first so `||` short-circuiting never skips clearing it.
  const needsRender = consumeRenderDirty() || pollChanged || chipsActive || markersActive
    || walksActive || choreoActive || actorsActive || labelsChanged || !!state.drawState || !!state.playback?.playing;
  if (needsRender) renderer.render(scene, state.activeCamera);
}
animate();
