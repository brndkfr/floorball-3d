// KATA section in the Train panel (A-BACK-046), under the zone card: the
// expected action (Auto from the play, or a manual Shot / Pass / Dribble,
// A-Q-009), coverage %, the four KATA rows (body pending until A-BACK-042)
// and one hint sentence for the worst dimension, which is also tinted
// (decision 2026-11-15, "Gauges"). Reads state.kataReadout (kata-readout.js).

import { state } from '../state.js';
import { t } from '../lang-state.js';
import { setKataAction } from '../kata-readout.js';
import { KATA_DIMS } from '../kata.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const slots = document.getElementById('trainSlots');
if (!slots) throw new Error('kata-section.js: #trainSlots missing from index.html');

const ACTIONS = ['auto', 'shot', 'pass', 'dribble'];

const root = document.createElement('section');
root.className = 'kata';
root.innerHTML = `
  <div class="gz-head"><span class="gz-label"></span><span class="kata-pct"></span></div>
  <div class="kata-action" role="radiogroup">${ACTIONS.map((a) => `<button type="button" role="radio" data-action="${a}"></button>`).join('')}</div>
  <ul class="kata-rows">${KATA_DIMS.map((d) => `<li class="kata-row" data-dim="${d}"><span class="kata-dot" aria-hidden="true"></span><span class="kata-name"></span><span class="kata-value"></span></li>`).join('')}</ul>
  <p class="kata-hint" role="status"></p>`;
slots.appendChild(root);

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
  root.querySelector('.gz-label').textContent = t('goalie.kata.title');
  const group = root.querySelector('.kata-action');
  group.setAttribute('aria-label', t('goalie.kata.action'));
  const picked = state.kataAction ?? 'auto';
  for (const b of group.querySelectorAll('button')) {
    const a = b.dataset.action;
    b.textContent = a === 'auto' ? t('goalie.kata.auto') : t(`goalie.action.${a}`);
    b.setAttribute('aria-checked', String(a === picked));
  }
  if (!r) return;
  root.querySelector('.kata-pct').textContent = r.pct == null ? '' : t('goalie.kata.coverage', { pct: `${Math.round(r.pct)}%` });
  for (const li of root.querySelectorAll('.kata-row')) {
    const dim = li.dataset.dim;
    li.dataset.status = r.judged.status[dim];
    li.classList.toggle('worst', r.judged.worst === dim);
    li.querySelector('.kata-name').textContent = t(`goalie.kata.${dim}`);
    li.querySelector('.kata-value').textContent = valueText(dim, r);
  }
  root.querySelector('.kata-hint').textContent = t(r.judged.hint.key, r.judged.hint.vars);
}

for (const ev of ['kataReadoutChanged', 'langChanged']) window.addEventListener(ev, refresh);
refresh();
