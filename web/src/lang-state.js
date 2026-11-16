// The app language (A-BACK-052, A-Q-010): state.lang, loaded from and saved
// to this browser; the first default follows the browser language (i18n.js
// holds the pure rules). Fires `langChanged` on window after every change so
// open UI can re-label itself.

import { state } from './state.js';
import { parseLang, LANGS, LANG_STORAGE_KEY, text } from './i18n.js';

let stored = null;
try { stored = localStorage.getItem(LANG_STORAGE_KEY); } catch { /* storage blocked: browser default */ }
state.lang = parseLang(stored, typeof navigator !== 'undefined' ? navigator.languages : []);
document.documentElement.lang = state.lang;

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === state.lang) return;
  state.lang = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('langChanged'));
}

// text() in the current language.
export const t = (key, vars) => text(key, state.lang, vars);
