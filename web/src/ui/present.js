// Present mode (A-BACK-044 step 4): for showing a play to the team. The top
// bar's "Present" sets html.presenting, which hides every shell root in
// panel-layout.js PRESENT_HIDES and zeroes the shell insets (app.css), so
// the rink fits the whole window; a small bar keeps play / pause, the time
// and Exit. Playback starts from frame 1. Esc or Exit stops it and restores
// the exact layout (the panel state is never touched, only the class) and
// the camera. Editing is off: the selection and the active tool are cleared
// on the way in.
import { camera, applyDefaultView, isDefaultView, fitTopDownFrustum, refitDefaultView } from '../scene.js';
import { state } from '../state.js';
import { play, stop, toggle, playbackState, totalDuration, addPoseListener } from '../authoring/playback.js';
import { formatTimecode } from '../authoring/transport-math.js';
import { activateTool } from '../authoring/dock.js';
import { deselectAll } from '../selection.js';

const presentBtn = document.querySelector('#appTopbar [data-action="present"]');
const bar = document.getElementById('presentBar');
const playBtn = bar?.querySelector('[data-present="play"]');
const exitBtn = bar?.querySelector('[data-present="exit"]');
const timeEl = bar?.querySelector('.pb-time');
if (!presentBtn || !bar || !playBtn || !exitBtn || !timeEl) throw new Error('present.js: Present button or #presentBar missing from index.html');

let saved = null;   // { position, quaternion, fov, wasDefault } while presenting

export function isPresenting() { return saved !== null; }

function refit() {
  fitTopDownFrustum();
  refitDefaultView();
}

function render() {
  const p = playbackState();
  playBtn.innerHTML = p.playing ? '&#10074;&#10074;' : '&#9654;';
  playBtn.setAttribute('aria-label', p.playing ? 'Pause' : 'Play');
  timeEl.textContent = `${formatTimecode(p.elapsed)} / ${formatTimecode(totalDuration())}`;
}

export function enterPresent() {
  if (saved) return;
  saved = {
    position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
    wasDefault: isDefaultView(),
  };
  if (state.activeTool) activateTool(state.activeTool);   // same tool again switches it off
  deselectAll();
  document.documentElement.classList.add('presenting');
  bar.hidden = false;
  refit();
  stop();   // back to frame 1
  play();
  render();
  playBtn.focus();
}

export function exitPresent() {
  if (!saved) return;
  stop();
  document.documentElement.classList.remove('presenting');
  bar.hidden = true;
  refit();
  if (saved.wasDefault) applyDefaultView();
  else {
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
  }
  saved = null;
  presentBtn.focus();
}

presentBtn.addEventListener('click', enterPresent);
exitBtn.addEventListener('click', exitPresent);
playBtn.addEventListener('click', () => { toggle(); render(); });
window.addEventListener('playbackChanged', () => { if (saved) render(); });
addPoseListener(() => { if (saved) render(); });

// Capture phase: Esc leaves Present before it can deselect or cancel a tool.
window.addEventListener('keydown', (e) => {
  if (!saved || e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  exitPresent();
}, true);
