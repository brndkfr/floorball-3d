// Right panel collapse (A-BACK-044 step 2). At >= 1200 px the top bar's
// panel button and "\" switch the docked panel between open (320 px) and a
// 40 px strip of section icons; an icon opens the panel at that section.
// Below 1200 px the same button opens and closes the drawer as before
// (decisions/002). The state (ui/panel-layout.js) is kept per browser; the
// rink re-fits right away in 2D and, if untouched, in 3D.
import { DEFAULT_PANEL_STATE, parsePanelState, togglePanel, openAt } from './panel-layout.js';
import { fitTopDownFrustum, refitDefaultView } from '../scene.js';

const STORAGE_KEY = 'floorball3d.panels';
const WIDE = window.matchMedia('(min-width: 1200px)');

const toggleBtn = document.querySelector('#appTopbar [data-action="toggle-panel"]');
const panel = document.getElementById('rightPanel');
const strip = document.getElementById('panelStrip');
if (!toggleBtn || !panel || !strip) throw new Error('panels.js: panel toggle, #rightPanel or #panelStrip missing from index.html');

let layout = DEFAULT_PANEL_STATE;
try { layout = parsePanelState(localStorage.getItem(STORAGE_KEY)); } catch { /* storage blocked: defaults */ }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* storage blocked */ }
}

function apply() {
  document.documentElement.classList.toggle('panel-strip', layout.panel === 'strip');
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
