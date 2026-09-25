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
    return `<b style="color:var(--fb-brand); grid-column:1/-1; margin-top:10px;">${title}</b>\n      ${rows}${rows && noteRow ? '\n      ' : ''}${noteRow}`;
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
  font-family:var(--fb-font);
`;
overlay.innerHTML = `
  <div style="max-width:min(560px, 92vw); max-height:88vh; overflow:auto;
              background:var(--fb-surf-1);
              border:1px solid var(--fb-line-strong); border-radius:12px;
              padding:22px 26px; color:var(--fb-text-1);
              box-shadow:0 12px 32px rgba(0,0,0,0.5); line-height:1.55;">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <h2 class="fb-dialog-title" style="margin:0;">Shortcuts &amp; tips</h2>
      <div style="display:flex; gap:6px;">
        <button data-x="close" style="background:transparent; color:var(--fb-text-1); border:1px solid var(--fb-line-strong); border-radius:6px; padding:2px 10px; font-family:inherit; cursor:pointer;">Close (Esc)</button>
        <button data-x="tutorial" style="background:var(--fb-brand); color:#fff; border:none; border-radius:6px; padding:2px 10px; font-family:inherit; font-weight:700; cursor:pointer;">Try a guided play</button>
      </div>
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
    font-family:inherit; background:var(--fb-brand-quiet);
    border:1px solid var(--fb-line-strong); border-radius:5px;
    padding:1px 8px; font-size:11px; white-space:nowrap;
    min-width:60px; text-align:center; display:inline-block;
  }
  /* First run (Broadcast, design canvas "first run"): two entry cards
     centred on the stage, secondary links underneath. */
  #onboardingTip {
    position:absolute; z-index:25; top:50%; left:var(--stage-center); transform:translate(-50%, -50%);
    width:min(640px, calc(var(--stage-width) - 32px)); box-sizing:border-box;
    padding:28px; border-radius:12px; border:1px solid var(--fb-line-strong);
    background:var(--fb-surf-1); color:var(--fb-text-1); font:400 13px/1.5 var(--fb-font);
    box-shadow:0 24px 64px rgba(0,0,0,0.55);
  }
  #onboardingTip h2 { margin:0; font:700 24px/1.15 var(--fb-font); letter-spacing:-0.01em; }
  #onboardingTip .fr-sub { margin:6px 0 20px; color:var(--fb-text-2); }
  #onboardingTip .fr-cards { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  #onboardingTip .fr-card {
    display:flex; flex-direction:column; gap:8px; padding:16px; border-radius:var(--fb-radius-2);
    background:var(--fb-surf-2); border:1px solid var(--fb-line);
  }
  #onboardingTip .fr-card h3 { margin:0; font:700 15px/1.2 var(--fb-font); }
  #onboardingTip .fr-card p { margin:0 0 8px; color:var(--fb-text-2); font-size:12px; }
  #onboardingTip .fr-card button { margin-top:auto; align-self:flex-start; }
  #onboardingTip button {
    height:34px; padding:0 14px; border-radius:var(--fb-radius-1); cursor:pointer;
    font:600 13px/1 var(--fb-font); border:1px solid var(--fb-brand); background:var(--fb-brand); color:#fff;
  }
  #onboardingTip button.secondary { background:transparent; border-color:var(--fb-line-strong); color:var(--fb-text-1); }
  #onboardingTip .fr-links { display:flex; flex-wrap:wrap; gap:16px; margin-top:16px; }
  #onboardingTip .fr-links button { height:auto; padding:0; border:none; background:none; color:var(--fb-text-2); font:600 12px/1.4 var(--fb-font); }
  #onboardingTip .fr-links button:hover { color:var(--fb-text-1); }
  #onboardingTip button:focus-visible { outline:2px solid var(--fb-brand); outline-offset:2px; }
  @media (max-width: 640px) { #onboardingTip .fr-cards { grid-template-columns:1fr; } }
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
// Decoupled via an event so help.js stays free of authoring imports.
const startTutorial = () => window.dispatchEvent(new Event('tutorial:start'));
overlay.querySelector('[data-x="tutorial"]').addEventListener('click', () => { closeHelp(); startTutorial(); });
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
  tip.setAttribute('role', 'dialog');
  tip.setAttribute('aria-label', 'Welcome to Floorball Studio');
  tip.innerHTML = `
    <h2>Design a play, or read a real one.</h2>
    <p class="fr-sub">A tactics board and a photo analyser on the same rink.</p>
    <div class="fr-cards">
      <div class="fr-card">
        <h3>Start a play</h3>
        <p>Place players, draw arrows and zones, step through frames. Record it in 2D or 3D.</p>
        <button data-x="ok">New play</button>
      </div>
      <div class="fr-card">
        <h3>Analyze a photo</h3>
        <p>Align a game photo to the rink, then get shot angle, coverage and passing lanes.</p>
        <button data-x="analyze">Choose photo</button>
      </div>
    </div>
    <div class="fr-links">
      <button data-x="tutorial">Try a guided play</button>
      <button data-x="library">Open from Library</button>
      <button data-x="help">Keyboard shortcuts</button>
    </div>
  `;
  document.body.appendChild(tip);
  const dismiss = () => { tip.remove(); localStorage.setItem(ONBOARDED_KEY, '1'); };
  tip.querySelector('[data-x="ok"]').addEventListener('click', dismiss);
  tip.querySelector('[data-x="tutorial"]').addEventListener('click', () => { dismiss(); startTutorial(); });
  tip.querySelector('[data-x="help"]').addEventListener('click', () => { dismiss(); openHelp(); });
  tip.querySelector('[data-x="analyze"]').addEventListener('click', () => {
    dismiss();
    document.querySelector('#appRail [data-mode="analyze"]')?.click();
    document.getElementById('photoFileInput')?.click();
  });
  tip.querySelector('[data-x="library"]').addEventListener('click', () => {
    dismiss();
    document.querySelector('#appRail [data-action="library"]')?.click();
  });
}

// Run after the DOM has settled a little so the tip renders on top.
setTimeout(showOnboarding, 800);

export { openHelp, closeHelp };
