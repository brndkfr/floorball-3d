// Help overlay + first-visit onboarding tip (A7). Kept in one module
// since they're both purely UI-shell concerns and share the same
// localStorage prefix. The overlay opens on '?', from an on-screen
// help button, or the first time the app boots.

import { installFocusTrap } from './focus-trap.js';
import { KEY_SECTIONS } from './keymap.js';

const ONBOARDED_KEY = 'floorball-3d:onboarded';

function renderShortcutGrid() {
  return KEY_SECTIONS.map(({ title, entries, note }) => {
    const rows = entries.map(([key, desc]) =>
      `<kbd>${key}</kbd><span>${desc}</span>`).join('\n      ');
    const noteRow = note
      ? `<span style="grid-column:1/-1; font-size:11px; opacity:0.7;">${note}</span>`
      : '';
    return `<b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">${title}</b>\n      ${rows}${rows && noteRow ? '\n      ' : ''}${noteRow}`;
  }).join('\n\n      ');
}

const overlay = document.createElement('div');
overlay.id = 'helpOverlay';
overlay.setAttribute('role', 'dialog');
overlay.setAttribute('aria-modal', 'true');
overlay.setAttribute('aria-label', 'Shortcuts and tips');
overlay.style.cssText = `
  position:fixed; inset:0; z-index:30;
  background:rgba(0,0,0,0.55); display:none;
  align-items:center; justify-content:center;
  font-family:'Consolas','Courier New',monospace;
`;
overlay.innerHTML = `
  <div style="max-width:min(560px, 92vw); max-height:88vh; overflow:auto;
              background:rgba(20,16,10,0.96);
              border:1px solid rgba(255,179,71,0.5); border-radius:12px;
              padding:22px 26px; color:#f7e6cf;
              box-shadow:0 12px 32px rgba(0,0,0,0.5); line-height:1.55;">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <div style="font-size:14px; letter-spacing:0.06em; text-transform:uppercase; color:#ffb347;">Shortcuts &amp; tips</div>
      <button data-x="close" style="background:transparent; color:#f7e6cf; border:1px solid rgba(255,179,71,0.35); border-radius:6px; padding:2px 10px; font-family:inherit; cursor:pointer;">Close (Esc)</button>
    </div>
    <div style="display:grid; grid-template-columns:auto 1fr; gap:6px 14px; font-size:12px;">
      ${renderShortcutGrid()}
    </div>
    <div style="margin-top:14px; font-size:11px; opacity:0.7; text-align:right;">Press <b>Esc</b> or click Close</div>
  </div>
`;
document.body.appendChild(overlay);

const css = document.createElement('style');
css.textContent = `
  #helpOverlay kbd {
    font-family:inherit; background:rgba(255,179,71,0.14);
    border:1px solid rgba(255,179,71,0.35); border-radius:5px;
    padding:1px 8px; font-size:11px; white-space:nowrap;
    min-width:60px; text-align:center; display:inline-block;
  }
  #onboardingTip {
    position:absolute; z-index:25;
    left:50%; bottom:190px; transform:translateX(-50%);
    max-width:420px;
    background:rgba(20,16,10,0.94);
    border:1px solid rgba(255,179,71,0.55); border-radius:10px;
    padding:12px 16px; color:#f7e6cf; font-family:'Consolas','Courier New',monospace;
    box-shadow:0 8px 24px rgba(0,0,0,0.5);
  }
  #onboardingTip .tip-title { color:#ffb347; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px; }
  #onboardingTip .tip-body { font-size:12px; line-height:1.5; margin-bottom:10px; }
  #onboardingTip button { background:#ffb347; color:#1a120a; border:none; border-radius:6px; padding:6px 14px; font-family:inherit; font-weight:700; cursor:pointer; margin-right:6px; }
  #onboardingTip button.secondary { background:transparent; color:#f7e6cf; border:1px solid rgba(255,179,71,0.35); font-weight:400; }
`;
document.head.appendChild(css);

function openHelp() {
  overlay.style.display = 'flex';
  releaseTrap = installFocusTrap(overlay, { onEscape: closeHelp });
}
function closeHelp() {
  overlay.style.display = 'none';
  releaseTrap?.();
  releaseTrap = null;
}

let releaseTrap = null;

overlay.querySelector('[data-x="close"]').addEventListener('click', closeHelp);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHelp(); });

window.addEventListener('keydown', (e) => {
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    // ignore when typing in an input
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    if (overlay.style.display === 'flex') closeHelp(); else openHelp();
  }
  // Escape while the overlay is open is handled by the focus-trap's
  // onEscape callback so we do not double-close here.
});

// --- first-visit onboarding tip --------------------------------------

function showOnboarding() {
  if (localStorage.getItem(ONBOARDED_KEY) === '1') return;
  const tip = document.createElement('div');
  tip.id = 'onboardingTip';
  tip.innerHTML = `
    <div class="tip-title">Welcome</div>
    <div class="tip-body">
      Click <b>Chip</b> on the dock, then click the rink to drop a player.
      Use <b>+</b> on the timeline to add a keyframe, drag chips to their next positions, then hit <b>Space</b> to play back.
      Press <b>?</b> anytime for full shortcuts.
    </div>
    <button data-x="ok">Got it</button>
    <button class="secondary" data-x="help">Show shortcuts</button>
  `;
  document.body.appendChild(tip);
  const dismiss = () => { tip.remove(); localStorage.setItem(ONBOARDED_KEY, '1'); };
  tip.querySelector('[data-x="ok"]').addEventListener('click', dismiss);
  tip.querySelector('[data-x="help"]').addEventListener('click', () => { dismiss(); openHelp(); });
}

// Run after the DOM has settled a little so the tip renders on top.
setTimeout(showOnboarding, 800);

export { openHelp, closeHelp };
