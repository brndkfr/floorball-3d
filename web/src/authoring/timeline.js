// Timeline strip (A4): horizontal list of frame cards + playback transport.
// Lives at the bottom of the viewport, above the dock. Wheel over the strip
// resizes the cards while they all fit and scrolls once they overflow
// (Ctrl / Cmd + wheel always resizes), see timeline-wheel.js.
// A-BACK-038: scrubber + time readout, durations in seconds, speeds
// 0.25x..2x, one "..." menu per frame (also on right-click), Export button.

import {
  getFrames, getCurrentIndex, selectFrame, duplicateFrame,
  insertBlankFrame, deleteFrame, addFrame,
  setFrameCamera, clearFrameCamera, setFrameDuration,
} from './frames.js';
import {
  stop, toggle, pause, toggleLoop, setSpeed, stepFrame, seekTo,
  playbackState, frameIndexAt, totalDuration, addPoseListener,
} from './playback.js';
import { startChoreo, cancelChoreo, commitChoreo, isChoreoActive } from './choreograph.js';
import { getFrameThumb } from './frame-thumb.js';
import { stripWheelAction } from './timeline-wheel.js';
import {
  nextSpeed, speedForKey, speedLabel, formatTimecode, formatSeconds,
  parseSecondsInput, durationEditable, frameMenuItems,
} from './transport-math.js';

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
const btnExport = el.querySelector('[data-tl="export"]');
const scrub = el.querySelector('.tl-scrub');
const timeEl = el.querySelector('.tl-time');

let cardWidth = 72;   // 40..120 px per plan; wheel adjusts
const MIN_W = 40, MAX_W = 120;
let lastRenderedCur = -1;   // scroll the editing card into view only when it changes

const CAM_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="2" y="7" width="14" height="11" rx="1"/><path d="M16 11l6-3v9l-6-3"/></svg>';

// --- per-frame menu (one shared popover) ------------------------------

const menu = document.createElement('div');
menu.id = 'tlFrameMenu';
menu.setAttribute('role', 'menu');
menu.hidden = true;
document.body.appendChild(menu);
let menuFor = -1;
let menuButton = null;

function runAction(action, i) {
  const f = getFrames()[i];
  if (!f) return;
  if (action === 'dup') duplicateFrame(i, i + 1);
  else if (action === 'ins-before') insertBlankFrame(i);
  else if (action === 'ins-after') insertBlankFrame(i + 1);
  else if (action === 'cam') (f.camera ? clearFrameCamera(i) : setFrameCamera(i));
  else if (action === 'del') deleteFrame(i);
}

function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  menuButton?.setAttribute('aria-expanded', 'false');
  menuFor = -1;
  menuButton = null;
}

// Opens above the anchor point (the strip sits at the bottom of the
// viewport), clamped to the window.
function openMenu(i, x, y, button = null) {
  const frames = getFrames();
  if (!frames[i]) return;
  closeMenu();
  menu.innerHTML = '';
  menu.setAttribute('aria-label', `Frame ${i + 1} actions`);
  for (const item of frameMenuItems({ count: frames.length, hasCamera: !!frames[i].camera })) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.dataset.a = item.action;
    b.textContent = item.label;
    b.disabled = !!item.disabled;
    if (item.danger) b.classList.add('danger');
    b.addEventListener('click', () => { closeMenu(); runAction(item.action, i); });
    menu.appendChild(b);
  }
  menu.hidden = false;
  menuFor = i;
  menuButton = button;
  button?.setAttribute('aria-expanded', 'true');
  const r = menu.getBoundingClientRect();
  const left = Math.min(Math.max(8, x), window.innerWidth - r.width - 8);
  const top = y - r.height - 6 >= 8 ? y - r.height - 6 : Math.min(y + 6, window.innerHeight - r.height - 8);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.querySelector('button:not(:disabled)')?.focus();
}

document.addEventListener('pointerdown', (e) => {
  if (menu.hidden || menu.contains(e.target) || e.target === menuButton) return;
  closeMenu();
}, true);
window.addEventListener('keydown', (e) => {
  if (menu.hidden || e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();   // don't also deselect / cancel the tool
  const b = menuButton;
  closeMenu();
  b?.focus();
}, true);

// --- render -------------------------------------------------------------

function updateTime() {
  const total = totalDuration();
  const elapsed = Math.min(playbackState().elapsed, total);
  scrub.max = String(total);
  scrub.value = String(elapsed);
  scrub.disabled = total === 0;
  const text = `${formatTimecode(elapsed)} / ${formatTimecode(total)}`;
  timeEl.textContent = text;
  scrub.setAttribute('aria-valuetext', text);
}

function render() {
  closeMenu();
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
    card.title = `Frame ${i + 1} - click to edit, right-click for actions`;

    const head = document.createElement('div');
    head.className = 'tl-head';
    const num = document.createElement('span');
    num.className = 'tl-num';
    num.textContent = i + 1;
    head.appendChild(num);
    if (f.camera) {
      const cam = document.createElement('span');
      cam.className = 'tl-cam';
      cam.title = 'Camera keyframe';
      cam.innerHTML = CAM_ICON;
      head.appendChild(cam);
    }
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'tl-menu';
    menuBtn.dataset.a = 'menu';
    menuBtn.textContent = '⋯';
    menuBtn.title = 'Frame actions';
    menuBtn.setAttribute('aria-label', `Frame ${i + 1} actions`);
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuFor === i) { closeMenu(); return; }
      const r = menuBtn.getBoundingClientRect();
      openMenu(i, r.left, r.top, menuBtn);
    });
    head.appendChild(menuBtn);
    card.appendChild(head);

    // Thumbnail (top-down snapshot). Rink is 2:1 (long:short), so thumb
    // height is half the card's usable width; getFrameThumb caches by
    // frame id + hash so this runs at most once per frame per size.
    const thumbW = Math.max(24, cardWidth - 8);
    const thumbH = Math.max(12, Math.round(thumbW / 2));
    const thumb = document.createElement('img');
    thumb.className = 'tl-thumb';
    thumb.width = thumbW;
    thumb.height = thumbH;
    thumb.alt = '';
    thumb.decoding = 'async';
    thumb.draggable = false;
    const thumbUrl = getFrameThumb(f, thumbW, thumbH);
    if (thumbUrl) thumb.src = thumbUrl;
    card.appendChild(thumb);

    // A frame's duration is the move to the next frame, so the last one
    // has none to edit.
    if (durationEditable(i, frames.length)) {
      const wrap = document.createElement('label');
      wrap.className = 'tl-durwrap';
      wrap.title = 'Time to move to the next frame, in seconds';
      const dur = document.createElement('input');
      dur.className = 'tl-dur';
      dur.type = 'text';
      dur.inputMode = 'decimal';
      dur.value = formatSeconds(f.duration);
      dur.setAttribute('aria-label', `Frame ${i + 1} duration in seconds`);
      dur.addEventListener('click', (e) => e.stopPropagation());
      dur.addEventListener('keydown', (e) => { if (e.key === 'Enter') dur.blur(); });
      dur.addEventListener('change', () => {
        const ms = parseSecondsInput(dur.value);
        if (ms == null) { dur.value = formatSeconds(f.duration); return; }
        setFrameDuration(i, ms);
      });
      wrap.append(dur, 's');
      card.appendChild(wrap);
    } else {
      const end = document.createElement('span');
      end.className = 'tl-dur-end';
      end.textContent = 'end';
      end.title = 'Playback ends on the last frame';
      card.appendChild(end);
    }

    card.addEventListener('click', () => selectFrame(i));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu(i, e.clientX, e.clientY);
    });
    strip.appendChild(card);
  });

  if (cur !== lastRenderedCur) {
    strip.children[cur]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    lastRenderedCur = cur;
  }

  btnPlay.textContent = p.playing ? '⏸' : '▶';
  btnPlay.title = p.playing ? 'Pause (Space)' : 'Play (Space)';
  btnPlay.setAttribute('aria-label', p.playing ? 'Pause' : 'Play');
  btnLoop.classList.toggle('active', p.loop);
  btnLoop.setAttribute('aria-pressed', String(p.loop));
  speedEl.textContent = speedLabel(p.speed);
  updateTime();
}

strip.addEventListener('wheel', (e) => {
  const action = stripWheelAction({
    deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
    scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth,
  });
  e.preventDefault();
  if (!action) return;
  if (action.kind === 'scroll') { strip.scrollLeft += action.dx; return; }
  cardWidth = Math.min(Math.max(cardWidth + action.dir * 6, MIN_W), MAX_W);
  render();
}, { passive: false });

// Dragging the scrubber pauses and shows that moment; the scene stays a
// preview (never written to the doc) until Stop or a click on the rink.
scrub.addEventListener('input', () => {
  if (playbackState().playing) pause();
  seekTo(+scrub.value);
});
addPoseListener(updateTime);

btnPlay.addEventListener('click', toggle);
btnStop.addEventListener('click', stop);
btnPrev.addEventListener('click', () => stepFrame(-1));
btnNext.addEventListener('click', () => stepFrame(1));
btnLoop.addEventListener('click', toggleLoop);
btnAdd.addEventListener('click', addFrame);
speedEl.addEventListener('click', () => setSpeed(nextSpeed(playbackState().speed)));
btnExport.addEventListener('click', async () => {
  const mod = await import('./export-dialog.js');
  mod.openExportDialog();
});

const btnChoreo = el.querySelector('[data-tl="choreo"]');
if (btnChoreo) {
  btnChoreo.addEventListener('click', () => {
    if (isChoreoActive()) commitChoreo(); else startChoreo();
  });
  window.addEventListener('choreoChanged', () => {
    btnChoreo.classList.toggle('active', isChoreoActive());
    btnChoreo.textContent = isChoreoActive() ? 'Commit' : 'Choreo';
  });
}

window.addEventListener('framesChanged', render);
window.addEventListener('playbackChanged', render);

// Playback keybindings. `,` / `.` step, 1-4 speed, R loop, Space toggle.
// Left/Right aren't bound - they conflict with WASD/arrow chip movement.
window.addEventListener('keydown', (event) => {
  const tag = event.target?.tagName;
  // The scrubber is an <input type="range"> that takes no text, so keys
  // still drive playback after dragging it.
  if ((tag === 'INPUT' && event.target.type !== 'range') || tag === 'TEXTAREA') return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === ' ') { event.preventDefault(); toggle(); }
  else if (event.key === ',') { event.preventDefault(); stepFrame(-1); }
  else if (event.key === '.') { event.preventDefault(); stepFrame(1); }
  else if (event.key.toLowerCase() === 'r') { toggleLoop(); }
  else {
    const speed = speedForKey(event.key);
    if (speed != null) setSpeed(speed);
  }
});

// Re-render whenever chips/shapes are added etc. - the current card should
// reflect the working scene. render() is cheap (small DOM). We hook into
// the same events dock/frames already emit.
window.addEventListener('framesChanged', render);
render();
