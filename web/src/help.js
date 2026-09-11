// Help overlay + first-visit onboarding tip (A7). Kept in one module
// since they're both purely UI-shell concerns and share the same
// localStorage prefix. The overlay opens on '?', from an on-screen
// help button, or the first time the app boots.

const ONBOARDED_KEY = 'floorball-3d:onboarded';

const overlay = document.createElement('div');
overlay.id = 'helpOverlay';
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
      <b style="color:#ffb347; grid-column:1/-1; margin-top:6px;">2D Plan mode (RTS controls)</b>
      <kbd>left-click</kbd><span>select object &middot; on empty floor = deselect (or place with active tool)</span>
      <kbd>left-drag chip</kbd><span>move that chip under the cursor</span>
      <kbd>right-click floor</kbd><span>move-command: selected chip / ball / goalie walks there</span>
      <kbd>right-click tool</kbd><span>cancel the active tool (chip stamp, arrow, zone, text)</span>
      <kbd>right-drag / middle-drag</kbd><span>pan the top-down camera</span>
      <kbd>scroll</kbd><span>zoom in / out</span>
      <kbd>WASD / arrows</kbd><span>pan camera (never moves the selected item)</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">3D walking view</b>
      <kbd>left-drag</kbd><span>look around (first-person)</span>
      <kbd>WASD / arrows</kbd><span>walk relative to look direction</span>
      <kbd>scroll</kbd><span>zoom / dolly</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">Selection &amp; edit</b>
      <kbd>Q / E</kbd><span>rotate the selected goalie (Shift = fine)</span>
      <kbd>Tab / Shift+Tab</kbd><span>cycle selection</span>
      <kbd>Esc</kbd><span>cancel active tool &middot; second press = deselect</span>
      <kbd>Del / Backspace</kbd><span>remove selected chip or shape</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">Tool hotkeys</b>
      <span style="grid-column:1/-1; font-size:11px; opacity:0.7;">Click the tool palette on the left. Number-key hotkeys are reserved for playback speed.</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">Authoring dock</b>
      <kbd>3D / 2D</kbd><span>toggle first-person and top-down camera</span>
      <kbd>T1 / T2</kbd><span>flip active team (chip color)</span>
      <kbd>color swatch</kbd><span>pick color for next shape or the selected shape</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">Timeline &amp; playback</b>
      <kbd>Space</kbd><span>play / pause</span>
      <kbd>, / .</kbd><span>step to previous / next keyframe</span>
      <kbd>R</kbd><span>toggle loop</span>
      <kbd>+</kbd><span>append a new keyframe (copy of current)</span>
      <kbd>&#9744;</kbd><span>set / clear a camera keyframe on that frame</span>
      <kbd>duration</kbd><span>per-frame in the small ms box</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">Choreograph mode (draft the next frame)</b>
      <span style="grid-column:1/-1; font-size:11px; opacity:0.85; margin-bottom:4px;">
        Plan a play by seeing before / after positions side by side. Use it when
        the current frame is your <em>starting</em> position and you want to
        draft where each player runs next.
      </span>
      <kbd>Choreo</kbd><span>timeline button. Duplicates the current frame as a draft <em>N+1</em>, snapshots every chip's position, then shows a cyan ring at each snapshot with a live line to the chip's new position.</span>
      <kbd>drag chips</kbd><span>move each chip to where it should end up. Right-click move-commands and walk-tweens also work. Arrows appear as chips leave their starting rings.</span>
      <kbd>Commit</kbd><span>keep the new frame and exit (green banner button).</span>
      <kbd>Cancel / Esc</kbd><span>delete the draft frame and return to N (red banner button).</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">Save / share / export</b>
      <kbd>Ctrl+Z / Ctrl+Y</kbd><span>undo / redo</span>
      <kbd>&hellip;</kbd><span>Save / Load / Export JSON / Import JSON / Copy share link / Export video</span>
      <kbd>share link</kbd><span>copies a URL with the whole scheme embedded (up to ~32 KB, JSON download otherwise)</span>

      <b style="color:#ffb347; grid-column:1/-1; margin-top:10px;">Help</b>
      <kbd>?</kbd><span>open this dialog</span>
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

function openHelp() { overlay.style.display = 'flex'; }
function closeHelp() { overlay.style.display = 'none'; }

overlay.querySelector('[data-x="close"]').addEventListener('click', closeHelp);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHelp(); });

window.addEventListener('keydown', (e) => {
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    // ignore when typing in an input
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    if (overlay.style.display === 'flex') closeHelp(); else openHelp();
  } else if (e.key === 'Escape' && overlay.style.display === 'flex') {
    closeHelp();
  }
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
