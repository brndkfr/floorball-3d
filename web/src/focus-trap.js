// Small focus-trap helper for the hand-rolled overlays in help.js and
// export-dialog.js (S-BACK-005). Traps Tab / Shift+Tab inside `container`
// so keyboard-only users can't accidentally focus something behind the
// modal, and hands focus back to whatever the user was on before opening
// when release() is called. Both overlays also want Escape-to-close, so
// this takes an `onEscape` callback.
//
// Not wired into modules using the native `<dialog>` element (dialog.js,
// library-dialog.js) - those get focus trap + Escape for free from
// `showModal()`.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

// Returns the next focus index to jump to when Tab is pressed, or null if
// the browser's default Tab behaviour is fine (i.e. focus stays within
// the trap without wrapping). Pure - unit tested via test/focus-trap.test.js.
export function nextTrappedIndex(count, activeIndex, shiftKey) {
  if (count <= 0) return null;
  if (activeIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey && activeIndex === 0) return count - 1;
  if (!shiftKey && activeIndex === count - 1) return 0;
  return null;
}

// Attaches Tab-wrapping + Escape handlers to `container`, focuses either
// `initialFocus` or the first focusable descendant. Returns a release()
// function that removes the listeners and restores focus to whatever
// element had it when installFocusTrap was called.
export function installFocusTrap(container, { onEscape, initialFocus } = {}) {
  const previouslyFocused = document.activeElement;

  function keydown(e) {
    if (e.key === 'Tab') {
      const items = focusable(container);
      const activeIndex = items.indexOf(document.activeElement);
      const nextIndex = nextTrappedIndex(items.length, activeIndex, e.shiftKey);
      if (nextIndex !== null) {
        e.preventDefault();
        items[nextIndex]?.focus();
      }
    } else if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
    }
  }
  container.addEventListener('keydown', keydown);

  const target = initialFocus || focusable(container)[0] || container;
  try { target.focus(); } catch { /* ignore */ }

  return function release() {
    container.removeEventListener('keydown', keydown);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try { previouslyFocused.focus(); } catch { /* ignore */ }
    }
  };
}
