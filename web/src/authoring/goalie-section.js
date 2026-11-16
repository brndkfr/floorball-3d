// Goalie section in a goalie's Inspector, the start of the goalie lens
// (A-BACK-052): the EN / DE switch for the goalie module's text and the link
// to the J+S / swiss unihockey module it follows. The zone card (A-BACK-048)
// and the KATA rows (A-BACK-046) are added here in later steps.
//
// Keeps its own DOM current through `goalieLangChanged` instead of making
// the Inspector re-render.

import { state } from '../state.js';
import { setGoalieLang, gt } from '../goalie-lang-state.js';
import { GOALIE_LANGS, GOALIE_MODULE_URL } from '../goalie-i18n.js';

let current = null;   // the section on screen, if any

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function goalieSection() {
  const root = el('div', 'goalie-section');
  const head = el('div', 'goalie-head');
  head.appendChild(el('div', 'ins-label goalie-title'));

  const langs = el('div', 'goalie-lang');
  langs.setAttribute('role', 'radiogroup');
  for (const lang of GOALIE_LANGS) {
    const b = el('button', 'shot-seg', lang.toUpperCase());
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.lang = lang;
    b.dataset.lang = lang;
    b.addEventListener('click', () => setGoalieLang(lang));
    langs.appendChild(b);
  }
  head.appendChild(langs);
  root.appendChild(head);

  const source = el('div', 'ins-empty goalie-source');
  source.append(el('span', 'goalie-source-text'), ' ');
  const link = el('a', 'goalie-source-link');
  link.href = GOALIE_MODULE_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  source.appendChild(link);
  root.appendChild(source);

  current = root;
  refresh();
  return root;
}

function refresh() {
  const root = current;
  if (!root) return;
  root.lang = state.goalieLang;
  root.querySelector('.goalie-title').textContent = gt('section.title');
  root.querySelector('.goalie-lang').setAttribute('aria-label', gt('lang.label'));
  for (const b of root.querySelectorAll('.goalie-lang .shot-seg')) b.setAttribute('aria-checked', String(b.dataset.lang === state.goalieLang));
  root.querySelector('.goalie-source-text').textContent = gt('source.text');
  root.querySelector('.goalie-source-link').textContent = gt('source.link');
}

window.addEventListener('goalieLangChanged', refresh);
