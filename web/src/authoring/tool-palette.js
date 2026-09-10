// Left-side vertical tool palette (Mode A). Mirrors the tool buttons that
// used to live in the bottom dock so those can retire; both stay wired to
// the same setActiveTool machinery in dock.js.
import { state } from '../state.js';
import { activateTool, onToolChanged } from './dock.js';

const palette = document.getElementById('toolPalette');
if (palette) {
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
}
