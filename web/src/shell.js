// App shell: left-rail mode switcher (docs/plan.md section 2). Only toggles
// visibility of existing panels via their [data-view] tag - no authoring/ or
// photo-overlay/ logic lives here or changes because of this file.
const railButtons = document.querySelectorAll('#appRail button[data-mode]');
const libraryView = document.getElementById('libraryView');
const photoCanvas = document.getElementById('photo-canvas');

let currentMode = 'plan';

function enforcePhotoCanvasVisibility() {
  // photo-overlay.js's auto-restore + loadPhoto set the canvas to `block`
  // as soon as a cached photo is decoded, regardless of which app mode
  // we're in. Force it back to hidden whenever we're not in Analyze so
  // it can't leak through the Plan-mode HUD.
  if (!photoCanvas) return;
  if (currentMode !== 'analyze' && photoCanvas.style.display !== 'none') {
    photoCanvas.style.display = 'none';
  }
}

function restoreWebGLCanvasIfNeeded() {
  // Photo-overlay's setCalibrating(true) hides the three.js renderer to
  // layer the photo over the plan view; leaving Analyze must reveal it
  // again so the rink comes back.
  if (currentMode === 'analyze') return;
  const gl = document.querySelector('canvas[data-engine^="three"]');
  if (gl && gl.style.display === 'none') gl.style.display = '';
}

if (photoCanvas) {
  const observer = new MutationObserver(enforcePhotoCanvasVisibility);
  observer.observe(photoCanvas, { attributes: true, attributeFilter: ['style'] });
}

function setMode(mode) {
  // Library is a modal dialog (see library-dialog.js), not a full-viewport
  // mode: don't hide the plan/analyze panels when it's opened from the rail.
  if (mode === 'library') return;
  const previous = currentMode;
  currentMode = mode;
  document.body.dataset.mode = mode;   // CSS hook (phone Analyze sheet, app.css)
  for (const el of document.querySelectorAll('[data-view="plan"]')) {
    el.style.display = mode === 'plan' ? '' : 'none';
  }
  for (const el of document.querySelectorAll('[data-view="analyze"]')) {
    el.style.display = mode === 'analyze' ? '' : 'none';
  }
  enforcePhotoCanvasVisibility();
  restoreWebGLCanvasIfNeeded();
  if (libraryView) libraryView.style.display = 'none';
  for (const btn of railButtons) {
    if (btn.dataset.mode === 'library') continue;
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  if (mode !== previous) {
    window.dispatchEvent(new CustomEvent('shell:mode', { detail: { mode, previous } }));
  }
}

export function getMode() { return currentMode; }

for (const btn of railButtons) {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
}

setMode('plan');
