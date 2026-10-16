// Phone Analyze bottom sheet (S-BACK-021, design canvas "phone"): below
// 768 px #photoPanel sits above the tab bar as a peek (grab bar + stepper);
// the grab toggles body.photo-sheet-open to expand it. The layout lives in
// app.css; the grab is hidden on wider screens, where the panel is docked.
const grab = document.getElementById('photoSheetGrab');
if (!grab) throw new Error('photo-sheet: #photoSheetGrab missing from index.html');

function setOpen(open) {
  document.body.classList.toggle('photo-sheet-open', open);
  grab.setAttribute('aria-expanded', String(open));
  grab.setAttribute('aria-label', open ? 'Collapse the analysis steps' : 'Expand the analysis steps');
}

grab.addEventListener('click', () => setOpen(!document.body.classList.contains('photo-sheet-open')));
// Leaving Analyze collapses it, so coming back starts at the peek.
window.addEventListener('shell:mode', (e) => { if (e.detail?.mode !== 'analyze') setOpen(false); });
