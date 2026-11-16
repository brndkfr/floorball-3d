// Screenshot button in the top bar, its menu and the P shortcut
// (S-BACK-032). In every mode; P also works in Present, where the top bar
// is hidden. screenshot.js makes the image.

import { saveScreenshot, copyScreenshot } from '../screenshot.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const button = document.getElementById('shotBtn');
const menuBtn = document.getElementById('shotMenuBtn');
const menu = document.getElementById('shotMenu');
const toast = document.getElementById('shotToast');
if (!button || !menuBtn || !menu || !toast) throw new Error('screenshot-menu.js: #shotBtn, #shotMenuBtn, #shotMenu or #shotToast missing from index.html');

menu.innerHTML = [
  ['save', 'Save PNG', 'P'],
  ['copy', 'Copy to clipboard', ''],
  ['clean', 'Save without labels', ''],
].map(([a, label, key]) => `<button type="button" role="menuitem" data-shot="${a}">${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('');

let toastTimer = null;
function say(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

async function run(action) {
  try {
    if (action === 'copy') { await copyScreenshot(); say('Copied to clipboard'); }
    else say(`Saved ${await saveScreenshot({ clean: action === 'clean' })}`);
  } catch (e) {
    console.warn('screenshot failed', e);
    say(action === 'copy' ? 'Could not copy: the browser blocked the clipboard' : 'Screenshot failed');
  }
}

function openMenu() {
  menu.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
  menu.querySelector('button')?.focus();
}
function closeMenu({ focusButton = false } = {}) {
  if (menu.hidden) return;
  menu.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
  if (focusButton) menuBtn.focus();
}

button.addEventListener('click', () => run('save'));
menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
menu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-shot]');
  if (!b) return;
  closeMenu();
  run(b.dataset.shot);
});
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
});

window.addEventListener('keydown', (e) => {
  if (!menu.hidden && e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeMenu({ focusButton: true });
    return;
  }
  if (e.key !== 'p' && e.key !== 'P') return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
  e.preventDefault();
  run('save');
}, true);
