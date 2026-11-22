// Director switch and "Free camera" pill (A-BACK-049, director.js and
// playback.js applyDirector hold the camera): the Director button in the
// recorder next to Hold and Follow, shown when the open play names shots
// (`cam`) and has a live goalie, and a pill over the stage while the
// viewer has the camera. The recorder belongs to Plan (Train shows no
// recorder), so in Train the pill and the lesson cards are the controls.
//
// Any orbit, pan or zoom of the viewer's (user-camera.js) turns the
// director off and shows "Free camera - Back to director"; the pill or the
// switch turns it on again, easing the camera back. Nothing else snaps it
// back (a new lesson and a restart do, see train-mode.js / playback.js).

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { hasDirector } from '../director.js';
import { playbackState, directorPoseFor, playheadMs } from './playback.js';
import { camera } from '../scene.js';
import { onUserCamera } from '../user-camera.js';
import { blendCameraTo, currentPose } from '../ui/camera-menu.js';
import { setDirector } from './director-state.js';
import { t } from '../lang-state.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const btn = document.querySelector('#timeline [data-tl="director"]');
if (!btn) throw new Error('director-ui.js: #timeline [data-tl="director"] missing from index.html');

const pill = document.createElement('button');
pill.type = 'button';
pill.id = 'directorPill';
pill.className = 'director-pill';
pill.hidden = true;
document.body.appendChild(pill);

const lessonOpen = () => !!state.doc && !!ensureDoc().autoGoalie && hasDirector(getFrames());   // shots to show and a goalie to follow

function refresh() {
  const has = lessonOpen();
  btn.hidden = !has;
  btn.classList.toggle('active', state.director);
  btn.setAttribute('aria-pressed', String(state.director));
  const mode = document.body.dataset.mode;
  pill.hidden = !(has && !state.director && (mode === 'train' || mode === 'plan'));
  pill.textContent = t('goalie.director.free');
}

// Back to the director: ease from where the camera stands to its pose.
function resume() {
  if (!lessonOpen() || state.activeCamera !== camera) return;
  const pose = directorPoseFor(playheadMs());
  if (!pose) return;
  if (playbackState().playing) state.directorResume = { from: currentPose(), t0: performance.now() };   // the next ticks blend
  else blendCameraTo(pose);
}

btn.addEventListener('click', () => setDirector(!state.director));
pill.addEventListener('click', () => setDirector(true));

onUserCamera(() => {
  if (state.director && lessonOpen()) setDirector(false);
});

window.addEventListener('directorChanged', () => {
  if (state.director) resume();
  refresh();
});
for (const ev of ['framesChanged', 'langChanged', 'shell:mode', 'playbackChanged']) window.addEventListener(ev, refresh);
document.addEventListener('layers:dirty', refresh);   // undo / redo
refresh();
