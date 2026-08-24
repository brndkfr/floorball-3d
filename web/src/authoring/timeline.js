// Timeline strip (A4): horizontal list of frame cards + playback transport.
// Lives at the bottom of the viewport, above the dock. Wheel over a card
// resizes the card, giving a lightweight zoom-in / zoom-out affordance for
// crowded schemes on small screens.

import {
  getFrames, getCurrentIndex, selectFrame, duplicateFrame,
  insertBlankFrame, deleteFrame, addFrame,
} from './frames.js';
import {
  stop, toggle, toggleLoop, setSpeed, stepFrame,
  playbackState, frameIndexAt,
} from './playback.js';

const el = document.getElementById('timeline');
if (!el) throw new Error('timeline element missing from index.html');

const strip = el.querySelector('.tl-strip');
const btnPlay = el.querySelector('[data-tl="play"]');
const btnStop = el.querySelector('[data-tl="stop"]');
const btnPrev = el.querySelector('[data-tl="prev"]');
const btnNext = el.querySelector('[data-tl="next"]');
const btnLoop = el.querySelector('[data-tl="loop"]');
const speedEl = el.querySelector('[data-tl="speed"]');
const btnAdd = el.querySelector('[data-tl="add"]');

let cardWidth = 72;   // 40..120 px per plan; wheel adjusts
const MIN_W = 40, MAX_W = 120;

function render() {
  const frames = getFrames();
  const cur = getCurrentIndex();
  const p = playbackState();
  const playIdx = p.playing ? frameIndexAt(p.elapsed) : cur;

  strip.innerHTML = '';
  frames.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'tl-card';
    if (i === cur) card.classList.add('editing');
    if (i === playIdx && p.playing) card.classList.add('playing');
    card.style.width = cardWidth + 'px';
    card.title = `Frame ${i + 1} (${f.duration} ms) - click to select`;

    const num = document.createElement('div');
    num.className = 'tl-num';
    num.textContent = i + 1;
    card.appendChild(num);

    const dur = document.createElement('input');
    dur.className = 'tl-dur';
    dur.type = 'number'; dur.min = '50'; dur.step = '50';
    dur.value = f.duration;
    dur.title = 'duration (ms)';
    dur.addEventListener('click', (e) => e.stopPropagation());
    dur.addEventListener('change', () => {
      import('./frames.js').then((m) => m.setFrameDuration(i, +dur.value));
    });
    card.appendChild(dur);

    const acts = document.createElement('div');
    acts.className = 'tl-acts';
    acts.innerHTML = `
      <button title="Insert blank before" data-a="ins-before">\u25c1+</button>
      <button title="Duplicate" data-a="dup">\u29c9</button>
      <button title="Insert blank after" data-a="ins-after">+\u25b7</button>
      <button title="Delete" data-a="del" ${frames.length <= 1 ? 'disabled' : ''}>\u00d7</button>
    `;
    acts.querySelector('[data-a="ins-before"]').addEventListener('click', (e) => { e.stopPropagation(); insertBlankFrame(i); });
    acts.querySelector('[data-a="dup"]').addEventListener('click', (e) => { e.stopPropagation(); duplicateFrame(i, i + 1); });
    acts.querySelector('[data-a="ins-after"]').addEventListener('click', (e) => { e.stopPropagation(); insertBlankFrame(i + 1); });
    acts.querySelector('[data-a="del"]').addEventListener('click', (e) => { e.stopPropagation(); deleteFrame(i); });
    card.appendChild(acts);

    card.addEventListener('click', () => selectFrame(i));
    strip.appendChild(card);
  });

  btnPlay.textContent = p.playing ? '\u23f8' : '\u25b6';
  btnPlay.title = p.playing ? 'Pause (Space)' : 'Play (Space)';
  btnLoop.classList.toggle('active', p.loop);
  speedEl.textContent = p.speed + 'x';
}

// wheel over the strip resizes cards
strip.addEventListener('wheel', (e) => {
  e.preventDefault();
  cardWidth = Math.min(Math.max(cardWidth + (e.deltaY < 0 ? 6 : -6), MIN_W), MAX_W);
  render();
}, { passive: false });

btnPlay.addEventListener('click', toggle);
btnStop.addEventListener('click', stop);
btnPrev.addEventListener('click', () => stepFrame(-1));
btnNext.addEventListener('click', () => stepFrame(1));
btnLoop.addEventListener('click', toggleLoop);
btnAdd.addEventListener('click', addFrame);
speedEl.addEventListener('click', () => setSpeed((playbackState().speed % 9) + 1));

window.addEventListener('framesChanged', render);
window.addEventListener('playbackChanged', render);

// Playback keybindings. `,` / `.` step, 1..9 speed, R loop, Space toggle.
// Left/Right aren't bound - they conflict with WASD/arrow chip movement.
window.addEventListener('keydown', (event) => {
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === ' ') { event.preventDefault(); toggle(); }
  else if (event.key === ',') { event.preventDefault(); stepFrame(-1); }
  else if (event.key === '.') { event.preventDefault(); stepFrame(1); }
  else if (event.key.toLowerCase() === 'r') { toggleLoop(); }
  else if (event.key >= '1' && event.key <= '9') { setSpeed(+event.key); }
});

// Re-render whenever chips/shapes are added etc. - the current card should
// reflect the working scene. render() is cheap (small DOM). We hook into
// the same events dock/frames already emit.
window.addEventListener('framesChanged', render);
render();
