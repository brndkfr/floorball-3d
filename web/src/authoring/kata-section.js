// KATA card, bottom-left over the Train stage (A-BACK-046; layout A,
// A-BACK-054): the header (collapses the card) with coverage % and the
// turn buttons; the body with the expected action (Auto from the play, or
// Shot / Pass / Dribble, A-Q-009) and the four KATA rows (body pending until
// A-BACK-042), the worst one outlined (decision 2026-11-15, "Gauges").
// The one hint sentence is a pill next to the goalie on the rink
// (#trainHint), placed every frame by placeTrainHint() from main.js.
// Reads state.kataReadout (kata-readout.js).

import * as THREE from 'three';
import { setShotViewUnsaved } from '../shot-view-state.js';
import { withTrainLines, trainLinesOn } from '../shot-view.js';
import { setShooterInsetShown } from '../shooter-inset.js';
import { idealGoaliePose } from '../shooter-view.js';
import { prefersReducedMotion } from '../reduced-motion.js';
import { state } from '../state.js';
import { renderer } from '../scene.js';
import { t } from '../lang-state.js';
import { setKataAction, updateKataReadout } from '../kata-readout.js';
import { markRenderDirty } from '../render-dirty.js';
import { KATA_DIMS } from '../kata.js';
import { isCardCollapsed, toggleCard } from './train-cards-ui.js';
import { setKataMarksShown } from '../kata-marks-layer.js';
import { blendCameraTo } from '../ui/camera-menu.js';
import { trainPose, trainFocusPose } from '../camera-presets.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const slots = document.getElementById('trainSlots');
const pill = document.getElementById('trainHint');
const overlay = document.getElementById('trainPanel');
if (!slots || !pill || !overlay) throw new Error('kata-section.js: #trainSlots, #trainHint or #trainPanel missing from index.html');

const ACTIONS = ['auto', 'shot', 'pass', 'dribble'];

const root = document.createElement('section');
root.className = 'train-card kata';
root.innerHTML = `
  <div class="tc-head">
    <button type="button" class="tc-collapse" aria-controls="kataBody">
      <span class="kata-title"></span>
      <svg class="tc-chevron" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 8l5 5 5-5"></path></svg>
    </button>
    <span class="kata-pct"></span>
    <span class="kata-turn"><button type="button" data-turn="1">↺</button><button type="button" data-turn="-1">↻</button></span>
  </div>
  <div class="kata-body" id="kataBody">
    <div class="kata-tools"><button type="button" class="kata-tool" data-tool="focus"></button><button type="button" class="kata-tool" data-tool="marks"></button><button type="button" class="kata-tool" data-tool="lines"></button><button type="button" class="kata-tool" data-tool="inset"></button><button type="button" class="kata-tool" data-tool="auto"></button></div>
    <div class="kata-action" role="radiogroup">${ACTIONS.map((a) => `<button type="button" role="radio" data-action="${a}"></button>`).join('')}</div>
    <ul class="kata-rows">${KATA_DIMS.map((d) => `<li class="kata-row" data-dim="${d}"><span class="kata-dot" aria-hidden="true"></span><span class="kata-name"></span><span class="kata-value"></span></li>`).join('')}</ul>
  </div>`;
slots.appendChild(root);

root.querySelector('.tc-collapse').addEventListener('click', () => toggleCard('kata'));

// Turn the defending goalie 5 degrees; rotation.y grows turning left
// (Q / E do the same on a selected goalie, controls.js).
const TURN_STEP = (5 * Math.PI) / 180;
// Focus goalie: close camera on the defending goalie (trainFocusPose),
// a second press goes back to the Train view. Off again whenever the mode
// changes (train-mode.js sets the Train view on the way in).
const focusBtn = root.querySelector('[data-tool="focus"]');
focusBtn.addEventListener('click', () => {
  const goal = state.goalieZone?.goal ?? 'A';
  const g = state.goalies[goal];
  if (!g) return;
  state.kataFocus = !state.kataFocus;
  blendCameraTo(state.kataFocus ? trainFocusPose(goal, { x: g.position.x, z: g.position.z }) : trainPose(goal));
  refresh();
});
window.addEventListener('shell:mode', () => { state.kataFocus = false; refresh(); });
root.querySelector('[data-tool="marks"]').addEventListener('click', () => setKataMarksShown(!state.kataMarksShown));
// Lines: the corner lines and the shooting line, together, shown but not
// stored (Plan keeps its own choice, train-mode.js gives it back).
root.querySelector('[data-tool="inset"]').addEventListener('click', () => setShooterInsetShown(!state.shooterInsetShown));

// Auto position: the defending goalie glides to its ideal spot and facing
// for the zone and action (idealGoaliePose, the base for later animations,
// A-BACK-051); at once with reduced motion.
const AUTO_MS = 350;   // estimate
let autoTween = null;
function autoPosition() {
  const r = state.kataReadout;
  const g = r && state.goalies[r.goal];
  if (!g) return;
  const to = idealGoaliePose({ ...r.inputs, targets: r.targets });
  const from = { x: g.position.x, z: g.position.z, yaw: g.rotation.y };
  const dYaw = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  const apply = (k) => {
    g.position.x = from.x + (to.x - from.x) * k;
    g.position.z = from.z + (to.z - from.z) * k;
    g.rotation.y = from.yaw + dYaw * k;
    updateKataReadout();
    markRenderDirty();
  };
  if (autoTween) cancelAnimationFrame(autoTween);
  if (prefersReducedMotion()) { apply(1); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / AUTO_MS);
    apply(k < 1 ? 1 - (1 - k) * (1 - k) : 1);   // ease out
    autoTween = k < 1 ? requestAnimationFrame(step) : null;
  };
  autoTween = requestAnimationFrame(step);
}
root.querySelector('[data-tool="auto"]').addEventListener('click', autoPosition);

root.querySelector('[data-tool="lines"]').addEventListener('click', () => setShotViewUnsaved(withTrainLines(state.shotView, !trainLinesOn(state.shotView))));

for (const b of root.querySelectorAll('.kata-turn button')) {
  b.addEventListener('click', () => {
    const g = state.goalies[state.goalieZone?.goal ?? 'A'];
    if (!g) return;
    g.rotation.y += Number(b.dataset.turn) * TURN_STEP;
    updateKataReadout();
    markRenderDirty();
  });
}

for (const b of root.querySelectorAll('.kata-action button')) {
  b.addEventListener('click', () => setKataAction(b.dataset.action === 'auto' ? null : b.dataset.action));
}

const sideWord = (mm, tolMm = 50) => (Math.abs(mm) <= tolMm ? t('goalie.side.on') : t(mm > 0 ? 'goalie.side.left' : 'goalie.side.right'));
const m = (mm) => (Math.abs(mm) / 1000).toFixed(1);

function valueText(dim, r) {
  const st = r.judged.status[dim];
  if (st === 'pending') return t('goalie.kata.pending');
  if (st === 'free') return t('goalie.kata.free');
  const k = r.kata;
  if (dim === 'placement') return `${m(k.placementLeftMm)} m ${sideWord(k.placementLeftMm)}`;
  if (dim === 'depth') return `${m(k.depthMm)} m`;
  return `${Math.round(Math.abs(k.axisDeg))}°`;
}

function refresh() {
  const r = state.kataReadout;
  root.hidden = !r;
  const title = t('goalie.kata.title');
  root.querySelector('.kata-title').textContent = title;
  const collapsed = isCardCollapsed('kata');
  const collapse = root.querySelector('.tc-collapse');
  collapse.setAttribute('aria-expanded', String(!collapsed));
  collapse.title = t('goalie.card.toggle', { card: title });
  root.classList.toggle('collapsed', collapsed);
  root.querySelector('.kata-body').hidden = collapsed;
  focusBtn.textContent = t('goalie.focus');
  focusBtn.setAttribute('aria-pressed', String(!!state.kataFocus));
  const marksBtn = root.querySelector('[data-tool="marks"]');
  marksBtn.textContent = t('goalie.marks');
  marksBtn.setAttribute('aria-pressed', String(!!state.kataMarksShown));
  const linesBtn = root.querySelector('[data-tool="lines"]');
  linesBtn.textContent = t('goalie.lines');
  linesBtn.setAttribute('aria-pressed', String(trainLinesOn(state.shotView)));
  const insetBtn = root.querySelector('[data-tool="inset"]');
  insetBtn.textContent = t('goalie.inset.title');
  insetBtn.setAttribute('aria-pressed', String(!!state.shooterInsetShown));
  const autoBtn = root.querySelector('[data-tool="auto"]');
  autoBtn.textContent = t('goalie.auto');
  autoBtn.title = t('goalie.auto.title');
  for (const b of root.querySelectorAll('.kata-turn button')) {
    const label = t(b.dataset.turn === '1' ? 'goalie.turn.left' : 'goalie.turn.right');
    b.setAttribute('aria-label', label);
    b.title = label;
  }
  const group = root.querySelector('.kata-action');
  group.setAttribute('aria-label', t('goalie.kata.action'));
  const picked = state.kataAction ?? 'auto';
  for (const b of group.querySelectorAll('button')) {
    const a = b.dataset.action;
    b.textContent = a === 'auto' ? t('goalie.kata.auto') : t(`goalie.action.${a}`);
    b.setAttribute('aria-checked', String(a === picked));
  }
  pill.hidden = !r;
  if (!r) return;
  root.querySelector('.kata-pct').textContent = r.pct == null ? '' : t('goalie.kata.coverage', { pct: `${Math.round(r.pct)}%` });
  for (const li of root.querySelectorAll('.kata-row')) {
    const dim = li.dataset.dim;
    li.dataset.status = r.judged.status[dim];
    li.classList.toggle('worst', r.judged.worst === dim);
    li.querySelector('.kata-name').textContent = t(`goalie.kata.${dim}`);
    li.querySelector('.kata-value').textContent = valueText(dim, r);
  }
  pill.textContent = t(r.judged.hint.key, r.judged.hint.vars);
  pill.dataset.status = r.judged.worst ? 'adjust' : (r.judged.hint.key === 'goalie.hint.free' ? 'free' : 'ok');
}

for (const ev of ['kataReadoutChanged', 'trainCardsChanged', 'langChanged', 'kataMarksChanged', 'shotViewChanged', 'shooterInsetChanged']) window.addEventListener(ev, refresh);
refresh();

// Put the hint pill to the right of the defending goalie's head, in the
// overlay's coordinates. Writes the DOM only when the spot moves.
const v = new THREE.Vector3();
let lastSpot = '';
const HEAD_MM = 1200;   // estimate: pill at about head height
export function placeTrainHint() {
  if (pill.hidden || document.body.dataset.mode !== 'train') return;
  const g = state.goalies[state.kataReadout?.goal ?? 'A'];
  if (!g) return;
  v.set(g.position.x, g.position.y + HEAD_MM, g.position.z).project(state.activeCamera);
  const canvas = renderer.domElement.getBoundingClientRect();
  const box = overlay.getBoundingClientRect();
  const x = Math.round(canvas.left + ((v.x + 1) / 2) * canvas.width - box.left + 28);
  const y = Math.round(canvas.top + ((1 - v.y) / 2) * canvas.height - box.top);
  const off = v.z > 1 || x < 0 || y < 0 || x > box.width || y > box.height;
  const spot = off ? 'off' : `${x},${y}`;
  if (spot === lastSpot) return;
  lastSpot = spot;
  pill.classList.toggle('off', off);
  if (!off) pill.style.transform = `translate(${x}px, ${y}px) translateY(-50%)`;
}
