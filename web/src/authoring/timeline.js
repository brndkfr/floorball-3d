// Scene recorder (A4, redesigned in A-BACK-038 as Variant A "edit bay"):
// docked full width under the stage. Row 1 is the transport; row 2 a time
// ruler with a playhead over frame segments as wide as they are long
// (transport-math.js layoutTrack). Drag a segment's right edge to change its
// duration; one "..." menu per frame (also on right-click). Wheel over the
// track zooms while it fits and scrolls once it overflows (Ctrl / Cmd +
// wheel always zooms), see timeline-wheel.js. Export lives in the top bar.

import {
  getFrames, getCurrentIndex, selectFrame, duplicateFrame,
  insertBlankFrame, deleteFrame, addFrame,
  setFrameCamera, clearFrameCamera, setFrameDuration,
} from './frames.js';
import {
  stop, toggle, pause, toggleLoop, setSpeed, stepFrame, seekTo,
  playbackState, frameIndexAt, totalDuration, addPoseListener,
} from './playback.js';
import { startChoreo, commitChoreo, isChoreoActive } from './choreograph.js';
import { getFrameThumb } from './frame-thumb.js';
import { stripWheelAction } from './timeline-wheel.js';
import {
  nextSpeed, speedForKey, speedLabel, formatTimecode, formatSeconds,
  parseSecondsInput, durationEditable, frameMenuItems,
  layoutTrack, timeToX, xToTime, rulerTicks, durationFromDrag, clampZoom,
} from './transport-math.js';
import { fitTopDownFrustum } from '../scene.js';
import { onProjectChanged } from './library-dialog.js';

const el = document.getElementById('timeline');
if (!el) throw new Error('timeline element missing from index.html');

const strip = el.querySelector('.tl-strip');   // scroll container: ruler, segments, playhead
const segsEl = el.querySelector('.tl-segs');
const ruler = el.querySelector('.tl-ruler');
const playhead = el.querySelector('.tl-playhead');
const btnPlay = el.querySelector('[data-tl="play"]');
const btnStop = el.querySelector('[data-tl="stop"]');
const btnPrev = el.querySelector('[data-tl="prev"]');
const btnNext = el.querySelector('[data-tl="next"]');
const btnLoop = el.querySelector('[data-tl="loop"]');
const speedEl = el.querySelector('[data-tl="speed"]');
const btnAdd = el.querySelector('[data-tl="add"]');
const timeEl = el.querySelector('.tl-time');

let pxPerSec = 120;            // track zoom; wheel adjusts (clampZoom)
const SEG_MIN_W = 76, END_W = 64;
let segs = [];                 // layoutTrack() of the current frames
let lastRenderedCur = -1;      // scroll the editing card into view only when it changes

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

// Opens above the anchor point (the recorder sits at the bottom of the
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

// --- time readout, playhead, stage inset --------------------------------

function updateTime() {
  const total = totalDuration();
  const elapsed = Math.min(playbackState().elapsed, total);
  const text = `${formatTimecode(elapsed)} / ${formatTimecode(total)}`;
  timeEl.textContent = text;
  ruler.setAttribute('aria-valuemax', String(total));
  ruler.setAttribute('aria-valuenow', String(elapsed));
  ruler.setAttribute('aria-valuetext', text);
  playhead.style.left = (segsEl.offsetLeft + timeToX(elapsed, segs)) + 'px';
}

// The docked recorder covers the bottom of the stage: publish how far it
// reaches up (0 while hidden, e.g. in Analyze) so the 2D view fits the rink
// above it (stage-frustum.js readShellInsets) and the dock floats over it.
let lastInset = -1;
function syncInset() {
  const r = el.getBoundingClientRect();
  const inset = r.height ? Math.max(0, Math.round(window.innerHeight - r.top)) : 0;
  if (inset === lastInset) return;
  lastInset = inset;
  document.documentElement.style.setProperty('--recorder-inset', inset + 'px');
  fitTopDownFrustum();
}
new ResizeObserver(syncInset).observe(el);
window.addEventListener('resize', syncInset);

// --- render -------------------------------------------------------------

let suppressClick = false;   // a handle drag ends in a click on its card

function makeThumb(f) {
  const thumb = document.createElement('img');
  thumb.className = 'tl-thumb';
  thumb.width = 48;
  thumb.height = 24;
  thumb.alt = '';
  thumb.decoding = 'async';
  thumb.draggable = false;
  // getFrameThumb caches by frame id + hash: once per frame per size.
  const url = getFrameThumb(f, 48, 24);
  if (url) thumb.src = url;
  return thumb;
}

function makeDurationInput(i, f) {
  const wrap = document.createElement('label');
  wrap.className = 'tl-durwrap';
  wrap.title = 'Time to move to the next frame, in seconds (or drag the edge)';
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
  return { wrap, dur };
}

// Right-edge handle: drag to change the frame's duration at the track's
// scale. The card resizes live; the doc is written once, on release.
function makeHandle(i, f, card, durInput) {
  const handle = document.createElement('span');
  handle.className = 'tl-handle';
  handle.title = 'Drag to change the duration';
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX, start = f.duration;
    let ms = start;
    const move = (ev) => {
      ms = durationFromDrag(start, ev.clientX - x0, pxPerSec);
      card.style.width = Math.max(SEG_MIN_W, (ms / 1000) * pxPerSec) + 'px';
      durInput.value = formatSeconds(ms);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (ms !== start) setFrameDuration(i, ms);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  return handle;
}

function renderRuler(trackW) {
  ruler.style.width = trackW + 'px';
  ruler.innerHTML = '';
  for (const t of rulerTicks(segs)) {
    const tick = document.createElement('span');
    tick.className = t.label ? 'tl-tick major' : 'tl-tick';
    tick.style.left = t.x + 'px';
    tick.textContent = t.label;
    ruler.appendChild(tick);
  }
}

function render() {
  closeMenu();
  const frames = getFrames();
  const cur = getCurrentIndex();
  const p = playbackState();
  const playIdx = p.playing ? frameIndexAt(p.elapsed) : cur;

  segs = layoutTrack(frames.map((f) => f.duration), { pxPerSec, minW: SEG_MIN_W, endW: END_W });
  const last = segs[segs.length - 1];
  const trackW = last ? last.x + last.w : 0;
  segsEl.style.width = trackW + 'px';
  renderRuler(trackW);

  segsEl.innerHTML = '';
  frames.forEach((f, i) => {
    const seg = segs[i];
    const card = document.createElement('div');
    card.className = 'tl-card';
    if (i === cur) card.classList.add('editing');
    if (i === playIdx && p.playing) card.classList.add('playing');
    if (i === frames.length - 1) card.classList.add('end');
    card.style.width = seg.w + 'px';
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

    const body = document.createElement('div');
    body.className = 'tl-body';
    if (seg.w >= 132) body.appendChild(makeThumb(f));
    // A frame's duration is the move to the next frame, so the last one
    // has none to edit.
    if (durationEditable(i, frames.length)) {
      const { wrap, dur } = makeDurationInput(i, f);
      body.appendChild(wrap);
      card.appendChild(body);
      card.appendChild(makeHandle(i, f, card, dur));
    } else {
      const end = document.createElement('span');
      end.className = 'tl-dur-end';
      end.textContent = 'end';
      end.title = 'Playback ends on the last frame';
      body.appendChild(end);
      card.appendChild(body);
    }

    card.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      selectFrame(i);
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu(i, e.clientX, e.clientY);
    });
    segsEl.appendChild(card);
  });

  if (cur !== lastRenderedCur) {
    segsEl.children[cur]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    lastRenderedCur = cur;
  }

  btnPlay.textContent = p.playing ? '⏸' : '▶';
  btnPlay.title = p.playing ? 'Pause (Space)' : 'Play (Space)';
  btnPlay.setAttribute('aria-label', p.playing ? 'Pause' : 'Play');
  btnLoop.classList.toggle('active', p.loop);
  btnLoop.setAttribute('aria-pressed', String(p.loop));
  speedEl.textContent = speedLabel(p.speed);
  updateTime();
  syncInset();
}

// --- ruler: click / drag / keys move the playhead ------------------------
// Pauses playback; the scene is a preview until Stop or a click on the rink.
// Keyboard when focused: arrows 0.1 s (Shift 1 s), Home / End, Page Up /
// Down a frame.

function seekToClientX(clientX) {
  if (playbackState().playing) pause();
  seekTo(xToTime(clientX - segsEl.getBoundingClientRect().left, segs));
}
ruler.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  ruler.setPointerCapture(e.pointerId);
  seekToClientX(e.clientX);
  const move = (ev) => seekToClientX(ev.clientX);
  const up = () => {
    ruler.removeEventListener('pointermove', move);
    ruler.removeEventListener('pointerup', up);
    ruler.removeEventListener('pointercancel', up);
  };
  ruler.addEventListener('pointermove', move);
  ruler.addEventListener('pointerup', up);
  ruler.addEventListener('pointercancel', up);
});
ruler.addEventListener('keydown', (e) => {
  const total = totalDuration();
  const now = Math.min(playbackState().elapsed, total);
  const step = e.shiftKey ? 1000 : 100;
  let target = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') target = now + step;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') target = now - step;
  else if (e.key === 'Home') target = 0;
  else if (e.key === 'End') target = total;
  else if (e.key === 'PageDown' || e.key === 'PageUp') {
    e.preventDefault();
    e.stopPropagation();
    stepFrame(e.key === 'PageDown' ? 1 : -1);
    return;
  }
  if (target == null) return;
  e.preventDefault();
  e.stopPropagation();   // arrows would otherwise move the selected chip
  if (playbackState().playing) pause();
  seekTo(Math.min(Math.max(target, 0), total));
});
addPoseListener(updateTime);

strip.addEventListener('wheel', (e) => {
  const action = stripWheelAction({
    deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
    scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth,
  });
  e.preventDefault();
  if (!action) return;
  if (action.kind === 'scroll') { strip.scrollLeft += action.dx; return; }
  pxPerSec = clampZoom(pxPerSec * (action.dir > 0 ? 1.15 : 1 / 1.15));
  render();
}, { passive: false });

btnPlay.addEventListener('click', toggle);
btnStop.addEventListener('click', stop);
btnPrev.addEventListener('click', () => stepFrame(-1));
btnNext.addEventListener('click', () => stepFrame(1));
btnLoop.addEventListener('click', toggleLoop);
btnAdd.addEventListener('click', addFrame);
speedEl.addEventListener('click', () => setSpeed(nextSpeed(playbackState().speed)));

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
// The first render() below runs at module init, before the bootstrap loads
// the saved project; it and every project switch announce themselves here.
onProjectChanged(render);

// Playback keybindings. `,` / `.` step, 1-4 speed, R loop, Space toggle.
// Left/Right aren't bound - they conflict with WASD/arrow chip movement.
window.addEventListener('keydown', (event) => {
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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

render();
