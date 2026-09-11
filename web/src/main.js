import { initHud } from './hud.js';
import { scene, renderer } from './scene.js';
import { state, getBallWorldCenter } from './state.js';
import { handleKeyboardMovement, clock } from './controls.js';
import { updateTrajectory } from './trajectory.js';
import { updateCoverage, updateGoalieLabel } from './coverage.js';

// side-effect-only modules: each wires up its own DOM listeners and starts
// loading its OBJ/MTL assets as soon as it's imported
import './layers.js';
import './goalie.js';
import './selection.js';
import './touch-controls.js';
import './help.js';
import { updateChipAnimations, tickChoreo } from './authoring/index.js';
import { updateDrawPreview } from './authoring/draw-tool.js';
import { tickPlayback } from './authoring/playback.js';
import { updateMoveMarkers } from './authoring/move-marker.js';
import { updateWalks } from './authoring/walk-tween.js';

initHud();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  handleKeyboardMovement(dt);
  updateChipAnimations(dt);
  updateMoveMarkers(dt);
  updateWalks(dt);
  updateDrawPreview();
  tickPlayback(dt * 1000);
  tickChoreo();
  const ballCenter = getBallWorldCenter(); // computed once, shared by both calls below
  updateTrajectory(ballCenter);
  updateCoverage(ballCenter);
  updateGoalieLabel();
  renderer.render(scene, state.activeCamera);
}
animate();
