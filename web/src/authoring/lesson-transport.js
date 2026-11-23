// Lesson transport in Train (A-BACK-049, decided 2026-11-22): the recorder
// is a Plan view, so while a lesson is open Train gets its own small bar
// under the stage: Play/Pause, Restart and the Director switch (shown only
// when the lesson names shots). The caption moves up above it
// (body[data-lesson-transport], app.css). Restart is stop() + play(); Stop
// already turns the director back on (playback.js).

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { getFrames } from './frames.js';
import { hasDirector } from '../director.js';
import { playbackState, toggle, stop, play } from './playback.js';
import { setDirector } from './director-state.js';
import { t } from '../lang-state.js';
import { onProjectChanged } from './library-dialog.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const panel = document.getElementById('trainPanel');
if (!panel) throw new Error('lesson-transport.js: #trainPanel missing from index.html');

const bar = document.createElement('div');
bar.id = 'lessonTransport';
bar.className = 'train-card lesson-transport';
bar.setAttribute('role', 'toolbar');
bar.hidden = true;
bar.innerHTML = `
  <button type="button" data-lt="play"></button>
  <button type="button" data-lt="restart"></button>
  <button type="button" data-lt="director" aria-pressed="true"></button>`;
panel.appendChild(bar);

const btnPlay = bar.querySelector('[data-lt="play"]');
const btnRestart = bar.querySelector('[data-lt="restart"]');
const btnDirector = bar.querySelector('[data-lt="director"]');

const lessonOpen = () => !!state.doc && !!ensureDoc().autoGoalie;

function refresh() {
  const shown = document.body.dataset.mode === 'train' && lessonOpen();
  bar.hidden = !shown;
  if (shown) document.body.dataset.lessonTransport = '';
  else delete document.body.dataset.lessonTransport;
  if (!shown) return;
  bar.setAttribute('aria-label', t('goalie.transport.label'));
  const playing = playbackState().playing;
  btnPlay.textContent = t(playing ? 'goalie.transport.pause' : 'goalie.transport.play');
  btnRestart.textContent = t('goalie.transport.restart');
  btnDirector.textContent = t('goalie.transport.director');
  btnDirector.hidden = !hasDirector(getFrames());
  btnDirector.classList.toggle('active', state.director);
  btnDirector.setAttribute('aria-pressed', String(state.director));
}

btnPlay.addEventListener('click', toggle);
btnRestart.addEventListener('click', () => { stop(); play(); });
btnDirector.addEventListener('click', () => setDirector(!state.director));

for (const ev of ['framesChanged', 'langChanged', 'shell:mode', 'playbackChanged', 'directorChanged']) window.addEventListener(ev, refresh);
document.addEventListener('layers:dirty', refresh);   // undo / redo
onProjectChanged(refresh);
refresh();
