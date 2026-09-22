// Runtime check for the OS/browser "reduce motion" accessibility
// preference. Read on every call so the answer stays current if the user
// flips the setting mid-session (macOS/Windows both fire the media-query
// change event, and consumers that repeatedly check will naturally pick
// it up). Safe to call in Node/tests where `window` doesn't exist.
//
// See S-BACK-005 (docs/plan.md §10). Used by walk-tween.js and chips.js
// to snap the RTS-style walk animation to its destination and skip the
// chip-drop scale + cyan-ring flash when the user has asked for reduced
// motion. Playback timelines (interpolated frame animation) are NOT
// gated - they are the primary product output, not decoration.

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion() {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return !!window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}
