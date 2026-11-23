// Title card and recap card of a lesson (A-BACK-049, lesson-cards.js holds
// the rules): a card over the middle of the Train stage. Opening a lesson
// shows its task until the first play (the Start button, or any play);
// when a play ends the recap card shows what to take away, with Play again.
// Close puts a card away without playing. Follows `framesChanged`,
// `playbackChanged`, `langChanged` and `shell:mode`.

import { ensureDoc } from './doc.js';
import { state } from '../state.js';
import { playbackState, play, stop, totalDuration } from './playback.js';
import { cardToShow, cardContent } from '../lesson-cards.js';
import { t } from '../lang-state.js';
import { setDirector } from './director-state.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const panel = document.getElementById('trainPanel');
if (!panel) throw new Error('lesson-cards-ui.js: #trainPanel missing from index.html');

const root = document.createElement('section');
root.id = 'lessonCard';
root.className = 'train-card lesson-card';
root.hidden = true;
root.setAttribute('role', 'region');
root.innerHTML = `
  <h2 class="lc-title"></h2>
  <p class="lc-text"></p>
  <ul class="lc-bullets"></ul>
  <div class="lc-actions">
    <button type="button" class="lc-primary"></button>
    <button type="button" class="lc-close"></button>
  </div>`;
panel.appendChild(root);
const titleEl = root.querySelector('.lc-title');
const textEl = root.querySelector('.lc-text');
const bulletsEl = root.querySelector('.lc-bullets');
const primary = root.querySelector('.lc-primary');
const closeBtn = root.querySelector('.lc-close');

let introPending = false;     // the opened lesson has not been played yet
let recapDismissed = false;   // the recap at the end of this play was closed
let shown = null;             // 'intro' | 'recap' | null

// Called when a lesson is opened (train-mode.js openLesson): its title card is up until the first play.
export function armLessonIntro() {
  introPending = true;
  recapDismissed = false;
  refresh();
}

export const lessonCardShown = () => shown;

function refresh() {
  const doc = state.doc ? ensureDoc() : null;
  const pb = playbackState();
  const total = totalDuration();
  if (!doc?.lesson) introPending = false;
  if (pb.playing || pb.elapsed < total) recapDismissed = false;
  let which = document.body.dataset.mode === 'train'
    ? cardToShow({ lesson: doc?.lesson, introPending, playing: pb.playing, elapsed: pb.elapsed, total })
    : null;
  if (which === 'recap' && recapDismissed) which = null;
  if (pb.playing) introPending = false;
  shown = which;
  root.hidden = !which;
  if (!which) return;
  const c = cardContent(doc.lesson, which, state.lang);
  root.dataset.card = which;
  root.setAttribute('aria-label', c.title || doc.meta?.name || '');
  titleEl.textContent = c.title || (which === 'intro' ? doc.meta?.name ?? '' : '');
  textEl.textContent = c.text;
  textEl.hidden = !c.text;
  bulletsEl.replaceChildren(...c.bullets.map((b) => Object.assign(document.createElement('li'), { textContent: b })));
  bulletsEl.hidden = !c.bullets.length;
  primary.textContent = which === 'intro' ? t('goalie.lesson.start') : t('goalie.lesson.replay');
  closeBtn.textContent = t('goalie.lesson.close');
}

primary.addEventListener('click', () => {
  if (shown === 'recap') { stop(); setDirector(true); }   // back to the start, the director on again
  introPending = false;
  play();
  refresh();
});
closeBtn.addEventListener('click', () => {
  if (shown === 'intro') introPending = false;
  else recapDismissed = true;
  refresh();
});

for (const ev of ['framesChanged', 'playbackChanged', 'langChanged', 'shell:mode']) window.addEventListener(ev, refresh);
