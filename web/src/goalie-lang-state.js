// The goalie module's language (A-BACK-052): state.goalieLang, loaded from
// and saved to this browser; the first default follows the browser language
// (goalie-i18n.js holds the pure rules). Fires `goalieLangChanged` on window
// after every change so open goalie UI can re-label itself.

import { state } from './state.js';
import { parseGoalieLang, GOALIE_LANGS, GOALIE_LANG_STORAGE_KEY, goalieText } from './goalie-i18n.js';

let stored = null;
try { stored = localStorage.getItem(GOALIE_LANG_STORAGE_KEY); } catch { /* storage blocked: browser default */ }
state.goalieLang = parseGoalieLang(stored, typeof navigator !== 'undefined' ? navigator.languages : []);

export function setGoalieLang(lang) {
  if (!GOALIE_LANGS.includes(lang) || lang === state.goalieLang) return;
  state.goalieLang = lang;
  try { localStorage.setItem(GOALIE_LANG_STORAGE_KEY, lang); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('goalieLangChanged'));
}

// goalieText in the current language.
export const gt = (key, vars) => goalieText(key, state.goalieLang, vars);
