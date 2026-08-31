// App shell: left-rail mode switcher (docs/plan.md section 2). Only toggles
// visibility of existing panels via their [data-view] tag - no authoring/ or
// photo-overlay/ logic lives here or changes because of this file.
const railButtons = document.querySelectorAll('#appRail button[data-mode]');
const libraryView = document.getElementById('libraryView');

function setMode(mode) {
  for (const el of document.querySelectorAll('[data-view="plan"]')) {
    el.style.display = mode === 'plan' ? '' : 'none';
  }
  for (const el of document.querySelectorAll('[data-view="analyze"]')) {
    el.style.display = mode === 'analyze' ? '' : 'none';
  }
  libraryView.style.display = mode === 'library' ? 'flex' : 'none';
  for (const btn of railButtons) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
}

for (const btn of railButtons) {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
}

setMode('plan');
