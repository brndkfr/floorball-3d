// Guided Choreo tutorial UI (A-BACK-019). Owns #tutorialCard; drives choreo-tutorial.js
// from app events. Runs in its own seeded project so the user's projects are never mutated.

import { state } from '../state.js';
import { scene } from '../scene.js';
import { tutorialReducer, tutorialView, resumeTutorial, stallCue, STEPS } from './choreo-tutorial.js';
import { buildTutorialDoc, TUTORIAL_NAME } from './choreo-tutorial-seed.js';
import { adoptDocAsProject, deleteProject, getCurrentProjectId, listProjects } from './storage.js';
import { switchToProject, onProjectChanged } from './library-dialog.js';
import { isChoreoActive, getChoreoStartCarrier, startChoreo, cancelChoreo } from './choreograph.js';
import { getBallCarrier } from './actors.js';
import { enterTopDown, isTopDown, resetTopDownView } from './topdown-camera.js';
import { stop as stopPlayback } from './playback.js';
import { spawnMoveMarker } from './move-marker.js';
import { prefersReducedMotion } from '../reduced-motion.js';

const KEY = 'floorball3d.tutorial';
const PULSE_EVERY_MS = 1600;
const STEP_LABELS = {
  choreo: 'Press Choreo',
  move: 'Drag #7 forward',
  pass: 'Pass the ball to #9',
  release: 'Choose when #7 passes',
  commit: 'Commit the frame',
  play: 'Press Space to watch',
};

let tut = null;          // reducer state while the card is shown
let lastProgress = 0;
let lastPulse = 0;
let cueEl = null;

const card = document.createElement('section');
card.id = 'tutorialCard';
card.setAttribute('role', 'region');
card.setAttribute('aria-label', 'Guided play');
card.hidden = true;
document.body.appendChild(card);

const css = document.createElement('style');
css.textContent = `
  #tutorialCard {
    position:fixed; bottom:190px; left:50%; transform:translateX(-50%); z-index:26;
    width:min(360px, 92vw); padding:12px 16px;
    background:rgba(20,16,10,0.94); color:#f7e6cf;
    border:1px solid rgba(255,179,71,0.55); border-radius:10px;
    box-shadow:0 6px 20px rgba(0,0,0,0.45);
    font-family:Consolas,monospace; font-size:12px; line-height:1.5;
  }
  #tutorialCard[hidden] { display:none; }
  #tutorialCard h2 { margin:0 0 6px; font-size:12px; color:#ffb347; text-transform:uppercase; letter-spacing:0.06em; }
  #tutorialCard ol { margin:0 0 8px; padding-left:0; list-style:none; }
  #tutorialCard li { opacity:0.55; }
  #tutorialCard li::before { content:'\\25CB  '; }
  #tutorialCard li[data-status="active"] { opacity:1; font-weight:700; }
  #tutorialCard li[data-status="active"]::before { content:'\\25CF  '; color:#ffb347; }
  #tutorialCard li[data-status="complete"] { opacity:0.8; }
  #tutorialCard li[data-status="complete"]::before { content:'\\2713  '; color:#7ee06b; }
  #tutorialCard .tut-hint { margin:0 0 10px; }
  #tutorialCard.stalled .tut-hint { color:#ffb347; font-weight:700; }
  #tutorialCard button { background:#ffb347; color:#1a120a; border:none; border-radius:6px; padding:5px 12px; font-family:inherit; font-weight:700; cursor:pointer; margin-right:6px; }
  #tutorialCard button.secondary { background:transparent; color:#f7e6cf; border:1px solid rgba(255,179,71,0.35); font-weight:400; }
  .tutorial-pulse { animation:tutorialPulse 1.2s ease-in-out infinite; }
  .tutorial-highlight { outline:2px solid #ffb347 !important; outline-offset:2px; }
  @keyframes tutorialPulse {
    0%, 100% { box-shadow:0 0 0 0 rgba(255,179,71,0.9); }
    50% { box-shadow:0 0 0 6px rgba(255,179,71,0); }
  }
`;
document.head.appendChild(css);

function readSaved() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function writeSaved(patch) {
  const next = { ...(readSaved() || {}), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { console.warn('tutorial: could not persist', e); }
  return next;
}
const projectExists = (id) => !!id && listProjects().some((p) => p.id === id);

export function startTutorial() {
  if (isChoreoActive()) cancelChoreo();
  if (state.playback?.playing) stopPlayback();
  const saved = readSaved();
  const current = getCurrentProjectId();
  const onOldTutorial = saved?.projectId && saved.projectId === current;
  const prevProjectId = onOldTutorial ? saved.prevProjectId : current;
  const adopted = adoptDocAsProject(buildTutorialDoc(), { name: TUTORIAL_NAME });
  if (!adopted) return;
  writeSaved({ projectId: adopted.meta.id, prevProjectId, completed: [], active: true });
  tut = null;
  switchToProject(adopted.meta.id);   // onProjectChanged below shows the card
  if (saved?.projectId && saved.projectId !== adopted.meta.id) deleteProject(saved.projectId);
  if (!isTopDown()) enterTopDown();
  resetTopDownView();
}

function leave({ toPrevious }) {
  if (isChoreoActive()) cancelChoreo();
  if (state.playback?.playing) stopPlayback();
  const saved = writeSaved({ active: false });
  hide();
  if (toPrevious && projectExists(saved.prevProjectId)) switchToProject(saved.prevProjectId);
}

function show(resumed) {
  tut = resumed;
  lastProgress = Date.now();
  card.hidden = false;
  render();
}

function hide() {
  tut = null;
  clearCue();
  card.hidden = true;
  card.replaceChildren();
}

function dispatch(event) {
  if (!tut) return;
  const next = tutorialReducer(tut, event);
  if (next === tut) return;
  tut = next;
  lastProgress = Date.now();
  clearCue();
  writeSaved({ completed: tut.completed });
  render();
}

function render() {
  const v = tutorialView(tut);
  card.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = v.done ? 'Guided play - done' : `Guided play - step ${v.index + 1} of ${STEPS.length}`;
  const ol = document.createElement('ol');
  for (const s of STEPS) {
    const li = document.createElement('li');
    li.dataset.step = s;
    li.dataset.status = v.statuses[s];
    li.textContent = STEP_LABELS[s];
    ol.appendChild(li);
  }
  const hint = document.createElement('p');
  hint.className = 'tut-hint';
  hint.setAttribute('aria-live', 'polite');
  hint.textContent = v.hint;
  card.append(h, ol, hint);
  const button = (x, text, onClick, secondary = false) => {
    const b = document.createElement('button');
    b.dataset.x = x;
    b.textContent = text;
    if (secondary) b.className = 'secondary';
    b.addEventListener('click', onClick);
    card.appendChild(b);
  };
  if (v.done) {
    button('again', 'Add another frame', () => { leave({ toPrevious: false }); startChoreo(); });
    button('back', 'Back to my project', () => leave({ toPrevious: true }), true);
  } else {
    button('skip', 'Skip tutorial', () => leave({ toPrevious: true }), true);
  }
}

function targetElement(target) {
  if (target === 'choreoButton') return document.querySelector('#timeline [data-tl="choreo"]');
  if (target === 'commitButton') return document.getElementById('choreoCommitBtn');
  if (target === 'playButton') return document.querySelector('#timeline [data-tl="play"]');
  if (target === 'carrier' && state.selected && state.selected === carrierGroup()) return document.getElementById('inspectorPassTo');
  if (target === 'releaseMarker') return document.getElementById('passReleaseSlider');
  return null;
}

function carrierGroup() {
  const id = getBallCarrier();
  return id ? state.chipGroups.find((g) => g.userData.chip?.id === id) ?? null : null;
}

function targetWorldPos(target) {
  if (target === 'releaseMarker') {
    const m = scene.getObjectByName('passReleaseMarker');
    return m?.visible ? m.position : null;
  }
  if (target === 'carrier') return carrierGroup()?.position ?? null;
  if (target?.startsWith('chip:')) {
    const n = target.slice(5);
    const id = Object.values(state.doc?.scheme?.players || {}).find((p) => p.number === n)?.id;
    return state.chipGroups.find((g) => g.userData.chip?.id === id)?.position ?? null;
  }
  return null;
}

function clearCue() {
  cueEl?.classList.remove('tutorial-pulse', 'tutorial-highlight');
  cueEl = null;
  card.classList.remove('stalled');
}

// Exported so e2e can pass a future timestamp instead of waiting 8 s.
export function tutorialStallCheck(now = Date.now()) {
  if (!tut) return;
  const v = tutorialView(tut);
  const reducedMotion = prefersReducedMotion();
  const cue = stallCue(now - lastProgress, { reducedMotion, done: v.done });
  if (!cue) return clearCue();
  const el = targetElement(v.target);
  if (el !== cueEl) cueEl?.classList.remove('tutorial-pulse', 'tutorial-highlight');
  card.classList.add('stalled');
  if (el) {
    cueEl = el;
    el.classList.add(cue === 'pulse' ? 'tutorial-pulse' : 'tutorial-highlight');
    return;
  }
  const pos = targetWorldPos(v.target);
  if (pos && cue === 'pulse' && now - lastPulse >= PULSE_EVERY_MS) {
    lastPulse = now;
    spawnMoveMarker(pos.x, pos.z, { color: 0xffb347 });
  }
}
setInterval(() => tutorialStallCheck(), 1000);

window.addEventListener('tutorial:start', startTutorial);
// Permanent entry points (topbar, timeline, Library dialog) all carry data-action="tutorial".
document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-action="tutorial"]')) startTutorial();
});
window.addEventListener('choreoChanged', (e) => {
  const action = e.detail?.action;
  if (action === 'start') dispatch({ type: 'choreoStart' });
  else if (action === 'commit') dispatch({ type: 'choreoCommit' });
  else if (action === 'cancel') dispatch({ type: 'choreoCancel' });
});
window.addEventListener('choreoChipMoved', () => dispatch({ type: 'chipMoved' }));
window.addEventListener('passChanged', (e) => {
  if (e.detail?.releaseT) dispatch({ type: 'releaseChanged' });
});
window.addEventListener('ballCarrierChanged', () => {
  const carrier = getBallCarrier();
  if (isChoreoActive() && carrier != null && carrier !== getChoreoStartCarrier()) dispatch({ type: 'carrierChanged' });
});
window.addEventListener('playbackChanged', () => {
  if (state.playback?.playing) dispatch({ type: 'playStart' });
});

// Fires at the end of bootstrap and on every project switch: resume on the tutorial project, hide elsewhere.
onProjectChanged(() => {
  const saved = readSaved();
  const onTutorial = saved?.active && saved.projectId === getCurrentProjectId();
  if (onTutorial && !tut) show(resumeTutorial(saved));
  else if (!onTutorial && tut) hide();
});
