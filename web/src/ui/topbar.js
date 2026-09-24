// Broadcast top bar (S-BACK-021, design canvas "Plan"): frame crumb, 2D / 3D
// segmented control and Export. The buttons call the same functions as the
// dock; the control follows view changes made anywhere (viewModeChanged
// from topdown-camera.js). The project name and Tutorial are wired by
// dock.js / choreo-tutorial-ui.js as before.
import { state } from '../state.js';
import { frameCrumb } from './topbar-model.js';
import { enterTopDown, exitTopDown, isTopDown } from '../authoring/topdown-camera.js';
import { onProjectChanged } from '../authoring/library-dialog.js';

const bar = document.getElementById('appTopbar');
if (!bar) throw new Error('topbar.js: #appTopbar missing from index.html');
const crumb = bar.querySelector('[data-topbar="crumb"]');
const modeButtons = [...bar.querySelectorAll('[data-view-mode]')];
const exportBtn = bar.querySelector('[data-action="export-video"]');
if (!crumb || modeButtons.length !== 2 || !exportBtn) throw new Error('topbar.js: top bar controls missing from index.html');

function renderCrumb() {
  crumb.textContent = frameCrumb(state.doc);
}

function renderMode() {
  const td = isTopDown();
  for (const b of modeButtons) b.setAttribute('aria-pressed', String((b.dataset.viewMode === '2d') === td));
}

for (const b of modeButtons) {
  b.addEventListener('click', () => {
    const want2d = b.dataset.viewMode === '2d';
    if (want2d !== isTopDown()) {
      if (want2d) enterTopDown(); else exitTopDown();
      // Path handles are 2D-only; same nudge as the dock's view button.
      import('../authoring/path-handles.js').then((m) => m.rebuild());
    }
  });
}

exportBtn.addEventListener('click', async () => {
  (await import('../authoring/export-dialog.js')).openExportDialog();
});

window.addEventListener('framesChanged', renderCrumb);
window.addEventListener('viewModeChanged', renderMode);
// state.doc is only final once authoring/index.js's bootstrap has run.
onProjectChanged(() => { renderCrumb(); renderMode(); });
renderMode();
