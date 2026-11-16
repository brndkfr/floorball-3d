// App-wide language switch (A-BACK-052, A-Q-010): the globe button at the
// bottom of the left rail opens English / Deutsch. lang-state.js holds the
// choice; this file only wires the button and its menu.

import { state } from '../state.js';
import { setLang, t } from '../lang-state.js';
import { LANGS, LANG_NAMES } from '../i18n.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const button = document.getElementById('langBtn');
const menu = document.getElementById('langMenu');
if (!button || !menu) throw new Error('lang-menu.js: #langBtn or #langMenu missing from index.html');

menu.innerHTML = LANGS.map((l) =>
  `<button type="button" role="menuitemradio" lang="${l}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');

function refresh() {
  button.querySelector('.lang-code').textContent = state.lang.toUpperCase();
  button.setAttribute('aria-label', `${t('lang.label')}: ${LANG_NAMES[state.lang]}`);
  button.title = t('lang.label');
  menu.setAttribute('aria-label', t('lang.label'));
  for (const b of menu.querySelectorAll('[data-lang]')) b.setAttribute('aria-checked', String(b.dataset.lang === state.lang));
}

function openMenu() {
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.focus();
}

function closeMenu({ focusButton = false } = {}) {
  if (menu.hidden) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (focusButton) button.focus();
}

button.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
menu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  setLang(b.dataset.lang);
  closeMenu({ focusButton: true });
});
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) closeMenu();
});
// Capture phase: runs before the window-level Esc (cancel tool, deselect).
window.addEventListener('keydown', (e) => {
  if (menu.hidden) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeMenu({ focusButton: true });
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }
}, true);

window.addEventListener('langChanged', refresh);
refresh();
