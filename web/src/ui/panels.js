// Right panel collapse (A-BACK-044 steps 2 and 3). At >= 1200 px the top
// bar's panel button and "\" switch the docked panel between open (320 px)
// and a 40 px strip of section icons; an icon opens the panel at that
// section. Below 1200 px the same button opens and closes the drawer as
// before (decisions/002). Every section folds to its header, and the scene
// recorder to its transport bar (its ResizeObserver re-fits the rink). The
// state (ui/panel-layout.js) is kept per browser; the rink re-fits right
// away in 2D and, if untouched, in 3D.
import {
  DEFAULT_PANEL_STATE, SECTIONS, parsePanelState, togglePanel, toggleFold, toggleTimeline, openAt,
} from './panel-layout.js';
import { fitTopDownFrustum, refitDefaultView } from '../scene.js';

const STORAGE_KEY = 'floorball3d.panels';
const OLD_LAYERS_KEY = 'floorball3d.layersPanel.collapsed';   // the Layers "-" button before step 3
const WIDE = window.matchMedia('(min-width: 1200px)');
const NAMES = { inspector: 'Inspector', layersPanel: 'Layers', viewPanel: 'View', coords: 'Coordinates' };
const FOLD_SVG = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>';

const toggleBtn = document.querySelector('#appTopbar [data-action="toggle-panel"]');
const panel = document.getElementById('rightPanel');
const strip = document.getElementById('panelStrip');
const timeline = document.getElementById('timeline');
const timelineFold = timeline?.querySelector('[data-action="fold-timeline"]');
if (!toggleBtn || !panel || !strip || !timelineFold) {
  throw new Error('panels.js: panel toggle, #rightPanel, #panelStrip or the recorder fold button missing from index.html');
}

let layout = DEFAULT_PANEL_STATE;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  layout = parsePanelState(raw);
  if (raw == null && localStorage.getItem(OLD_LAYERS_KEY) === '1') layout = toggleFold(layout, 'layersPanel');
} catch { /* storage blocked: defaults */ }

// Step 3: one fold button in each section's header (its first child).
const sections = SECTIONS.map((id) => {
  const el = document.getElementById(id);
  if (!el?.firstElementChild) throw new Error(`panels.js: #${id} or its header missing from index.html`);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rp-fold';
  btn.innerHTML = FOLD_SVG;
  btn.addEventListener('click', () => setLayout(toggleFold(layout, id)));
  el.firstElementChild.appendChild(btn);
  return { id, el, btn };
});
timelineFold.addEventListener('click', () => setLayout(toggleTimeline(layout)));

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* storage blocked */ }
}

function apply() {
  document.documentElement.classList.toggle('panel-strip', layout.panel === 'strip');
  for (const { id, el, btn } of sections) {
    const folded = layout.folded[id];
    el.classList.toggle('folded', folded);
    btn.setAttribute('aria-expanded', String(!folded));
    btn.setAttribute('aria-label', `${folded ? 'Unfold' : 'Fold'} ${NAMES[id]}`);
  }
  const bar = layout.timeline === 'bar';
  timeline.classList.toggle('folded', bar);
  timelineFold.setAttribute('aria-expanded', String(!bar));
  timelineFold.setAttribute('aria-label', bar ? 'Unfold the recorder' : 'Fold the recorder');
  const open = WIDE.matches ? layout.panel === 'open' : document.body.classList.contains('right-panel-open');
  toggleBtn.setAttribute('aria-expanded', String(open));
  toggleBtn.title = WIDE.matches
    ? (open ? 'Collapse the side panel (\\)' : 'Show the side panel (\\)')
    : (open ? 'Hide the side panel' : 'Show the side panel');
  fitTopDownFrustum();
  refitDefaultView();
}

function setLayout(next) {
  layout = next;
  save();
  apply();
}

toggleBtn.addEventListener('click', () => {
  if (WIDE.matches) setLayout(togglePanel(layout));
  else {
    document.body.classList.toggle('right-panel-open');
    apply();
  }
});

strip.addEventListener('click', (e) => {
  const id = e.target.closest('button[data-open]')?.dataset.open;
  if (!id) return;
  setLayout(openAt(layout, id));
  document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
});

window.addEventListener('keydown', (e) => {
  if (e.key !== '\\' || e.ctrlKey || e.metaKey || e.altKey || !WIDE.matches) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
  if (document.body.dataset.mode && document.body.dataset.mode !== 'plan') return;
  e.preventDefault();
  setLayout(togglePanel(layout));
});

WIDE.addEventListener('change', apply);
apply();
