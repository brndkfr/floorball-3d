import { initHud } from './hud.js';
import { scene, camera, renderer } from './scene.js';
import { getBallWorldCenter } from './state.js';
import { handleKeyboardMovement, clock } from './controls.js';
import { updateTrajectory } from './trajectory.js';
import { updateCoverage, updateGoalieLabel } from './coverage.js';

// side-effect-only modules: each wires up its own DOM listeners and starts
// loading its OBJ/MTL assets as soon as it's imported
import './layers.js';
import './goalie.js';
import './selection.js';
import './touch-controls.js';
import { updateChipAnimations } from './authoring/index.js';

initHud();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  handleKeyboardMovement(dt);
  updateChipAnimations(dt);
  const ballCenter = getBallWorldCenter(); // computed once, shared by both calls below
  updateTrajectory(ballCenter);
  updateCoverage(ballCenter);
  updateGoalieLabel();
  renderer.render(scene, camera);
}
animate();
