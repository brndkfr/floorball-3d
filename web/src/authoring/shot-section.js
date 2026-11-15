// Shot section in the match ball's Inspector (A-BACK-045 step 3, draft
// variant B): which goal the shot overlays aim at, the verdict with the %
// blocked, the three overlay toggles and two actions. The overlays stay on
// the rink when something else is selected; only the controls live here.
//
// Reads state.shotReadout (shot-readout.js) and state.shotView
// (shot-view-state.js); keeps its own DOM current through their events
// instead of making the Inspector re-render.

import { state, shotGoal, goalLetterForGoal } from '../state.js';
import { toggleShotOverlay } from '../shot-view-state.js';
import { updateShotReadout } from '../shot-readout.js';
import { alignGoalie } from '../trajectory.js';
import { viewFromBall } from '../scene.js';
import { isTopDown, exitTopDown } from './topdown-camera.js';
import { endName } from '../end-names.js';
import { SHOT_LINE_TOKENS } from '../tokens.js';
import { markRenderDirty } from '../render-dirty.js';

export const VERDICT_TITLES = {
  open: 'Open shot',
  'blocked-off': 'Blocked off-centre',
  'blocked-centred': 'Squared up',
};

const TOGGLES = [
  { key: 'lines', label: 'Lines', title: 'Ball to the four goal corners' },
  { key: 'shotLine', label: 'Shooting line', title: 'Ball to the goal centre, in the verdict colour; the goalie glows with it' },
  { key: 'coverage', label: 'Coverage', title: 'Goal mouth: green covered, red open' },
];

let current = null;   // the section on screen, if any

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// The pick as the radios show it: 'auto' | 'A' | 'B'.
const pickedTarget = () => (state.targetGoal ? goalLetterForGoal(state.targetGoal) : 'auto');

function setTarget(value) {
  state.targetGoal = value === 'auto' ? null : state.goalInstances[value === 'B' ? 1 : 0] ?? null;
  updateShotReadout();   // fires shotReadoutChanged -> refresh
  markRenderDirty();
  refresh();
}

export function shotSection() {
  const root = el('div', 'shot-section');
  root.appendChild(el('div', 'ins-label', 'Shot'));

  const target = el('div', 'shot-target');
  target.setAttribute('role', 'radiogroup');
  target.setAttribute('aria-label', 'Target goal');
  for (const value of ['auto', 'A', 'B']) {
    const b = el('button', 'shot-seg', value === 'auto' ? 'Auto' : endName(value));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.target = value;
    b.addEventListener('click', () => setTarget(value));
    target.appendChild(b);
  }
  root.appendChild(target);
  root.appendChild(el('div', 'ins-empty shot-target-note'));

  const verdict = el('div', 'shot-verdict');
  verdict.setAttribute('role', 'status');
  const dot = el('span', 'shot-dot');
  dot.setAttribute('aria-hidden', 'true');
  verdict.append(dot, el('span', 'shot-verdict-title'), el('span', 'shot-verdict-pct'));
  root.appendChild(verdict);

  const toggles = el('div', 'shot-toggles');
  for (const t of TOGGLES) {
    const b = el('button', 'shot-chip', t.label);
    b.type = 'button';
    b.title = t.title;
    b.dataset.key = t.key;
    b.addEventListener('click', () => toggleShotOverlay(t.key));
    toggles.appendChild(b);
  }
  root.appendChild(toggles);

  const actions = el('div', 'shot-actions');
  const align = el('button', 'ins-btn', 'Align goalie');
  align.type = 'button';
  align.title = 'Slide the goalie sideways onto the shooting line at its current depth';
  align.addEventListener('click', () => { alignGoalie(); markRenderDirty(); });
  const from = el('button', 'ins-btn', 'From the ball');
  from.type = 'button';
  from.title = 'Look at the goal from just behind the ball';
  from.addEventListener('click', () => {
    if (isTopDown()) exitTopDown();
    viewFromBall();
    markRenderDirty();
  });
  actions.append(align, from);
  root.appendChild(actions);

  current = root;
  updateShotReadout();
  refresh();
  return root;
}

function refresh() {
  const root = current;
  if (!root) return;
  const pick = pickedTarget();
  for (const b of root.querySelectorAll('.shot-seg')) b.setAttribute('aria-checked', String(b.dataset.target === pick));
  const goal = shotGoal();
  const letter = goal ? goalLetterForGoal(goal) : null;
  root.querySelector('.shot-target-note').textContent = !letter ? ''
    : pick === 'auto' ? `Aiming at ${endName(letter)}: the goal nearer the ball.`
      : `Always ${endName(letter)}, wherever the ball is.`;

  const r = state.shotReadout;
  const title = root.querySelector('.shot-verdict-title');
  const pct = root.querySelector('.shot-verdict-pct');
  const dot = root.querySelector('.shot-dot');
  if (r) {
    title.textContent = VERDICT_TITLES[r.key] ?? r.key;
    pct.textContent = `${Math.round(r.pctBlocked)}% blocked`;
    dot.style.background = SHOT_LINE_TOKENS[r.key].css;
    root.querySelector('.shot-verdict').style.borderColor = SHOT_LINE_TOKENS[r.key].css;
  } else {
    title.textContent = 'No shot';
    pct.textContent = '';
  }

  for (const b of root.querySelectorAll('.shot-chip')) b.setAttribute('aria-pressed', String(!!state.shotView[b.dataset.key]));
}

window.addEventListener('shotReadoutChanged', refresh);
window.addEventListener('shotViewChanged', () => { refresh(); markRenderDirty(); });
