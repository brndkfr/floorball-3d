// DOM wiring for a draggable floating panel. Pure position math lives in
// palette-position.js (clampPalettePos / parseStoredPos) so this stays a
// thin DOM adapter. Used by tool-palette / inspector / layers-panel.
import { clampPalettePos, parseStoredPos } from './palette-position.js';

export function makeFloatable(el, opts) {
  const { storageKey, defaultPos, reserved = { top: 8, left: 8, right: 8, bottom: 8 }, gripSelector = '.floatable-grip' } = opts;

  const size = () => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };
  const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

  function applyPos(pos) {
    const clamped = clampPalettePos(pos, size(), viewport(), reserved);
    el.style.left = clamped.x + 'px';
    el.style.top = clamped.y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    return clamped;
  }
  function savePos(pos) {
    try { localStorage.setItem(storageKey, JSON.stringify(pos)); } catch {}
  }
  function loadPos() {
    try { return parseStoredPos(localStorage.getItem(storageKey)); } catch { return null; }
  }

  const stored = loadPos();
  applyPos(stored || defaultPos);

  const grip = el.querySelector(gripSelector);
  if (grip) {
    let dragging = null;
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const rect = el.getBoundingClientRect();
      dragging = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      el.classList.add('dragging');
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      applyPos({ x: e.clientX - dragging.dx, y: e.clientY - dragging.dy });
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = null;
      el.classList.remove('dragging');
      try { grip.releasePointerCapture(e.pointerId); } catch {}
      const rect = el.getBoundingClientRect();
      savePos({ x: rect.left, y: rect.top });
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  window.addEventListener('resize', () => {
    const rect = el.getBoundingClientRect();
    applyPos({ x: rect.left, y: rect.top });
  });
}
