// Visible save-state indicator + unsaved-work guard (S-BACK-001).
// storage.js tracks save success/failure as pure state so it keeps loading
// standalone in tests; this module is the DOM-touching side effect that
// turns that state into something a user can actually see.

import { getSaveStatus, onSaveStatusChange } from './storage.js';

const el = document.getElementById('saveStatus');

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function render(status) {
  if (!el) return;
  if (status.ok) {
    el.textContent = status.at ? `saved ${formatTime(status.at)}` : '';
    el.classList.remove('save-error');
  } else {
    el.textContent = 'save failed - storage full or unavailable, export a backup';
    el.classList.add('save-error');
  }
}

onSaveStatusChange(render);
render(getSaveStatus());

// Warn before closing/reloading the tab while the most recent save attempt
// failed, since that means in-memory changes since then are not actually
// persisted anywhere and a reload would silently drop them.
window.addEventListener('beforeunload', (event) => {
  if (!getSaveStatus().ok) {
    event.preventDefault();
    event.returnValue = '';
  }
});
