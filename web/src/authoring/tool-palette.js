// Left-side vertical tool palette (Mode A). Mirrors the tool buttons that
// used to live in the bottom dock so those can retire; both stay wired to
// the same setActiveTool machinery in dock.js. Floating position handled
// by floatable.js.
import { state } from '../state.js';
import { activateTool, onToolChanged } from './dock.js';
import { makeFloatable } from './floatable.js';

// Throw (rather than silently no-op) if the container is missing - the
// bootstrap e2e spec's zero-pageerror assertion is the tripwire that
// catches an accidental HTML deletion. See CLAUDE.md 'DOM-owning modules'.
const palette = document.getElementById('toolPalette');
if (!palette) throw new Error('toolPalette element missing from index.html');

const buttons = Array.from(palette.querySelectorAll('button[data-tool]'));

function refresh(activeTool) {
  for (const b of buttons) {
    const wanted = b.dataset.tool || '';
    const active = (activeTool || '') === wanted;
    b.classList.toggle('active', active);
  }
}

for (const b of buttons) {
  b.addEventListener('click', () => {
    const tool = b.dataset.tool || null;
    activateTool(tool);
  });
}

onToolChanged(refresh);
refresh(state.activeTool);

makeFloatable(palette, {
  storageKey: 'floorball.toolPalette.pos',
  // Rail (52px) + topbar (40px) come from index.html's #appRail / #appTopbar.
  reserved: { top: 48, left: 60, right: 8, bottom: 8 },
  defaultPos: { x: 60, y: Math.max(48, Math.round(window.innerHeight / 2 - 200)) },
});
