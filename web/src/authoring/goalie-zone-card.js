// Zone card, top-left over the Train stage (A-BACK-048; layout A, A-BACK-054):
// the ball's goalie zone with its name and motto in the header, which also
// collapses the card, and our short card text below; the Zones button
// switches the floor layer. In the app language. Follows
// `goalieZoneChanged` (goalie-zones-layer.js), `goalieZonesChanged`,
// `trainCardsChanged` and `langChanged`.

import { state } from '../state.js';
import { t } from '../lang-state.js';
import { setGoalieZonesShown } from '../goalie-zones-state.js';
import { GOALIE_ZONE_TOKENS } from '../tokens.js';
import { isCardCollapsed, toggleCard } from './train-cards-ui.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const slots = document.getElementById('trainSlots');
if (!slots) throw new Error('goalie-zone-card.js: #trainSlots missing from index.html');

const root = document.createElement('section');
root.className = 'train-card gz';
root.innerHTML = `
  <div class="tc-head">
    <button type="button" class="tc-collapse" aria-controls="gzBody">
      <span class="gz-dot" aria-hidden="true"></span><span class="gz-name"></span><span class="gz-motto"></span>
      <svg class="tc-chevron" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 8l5 5 5-5"></path></svg>
    </button>
    <button type="button" class="gz-toggle"></button>
  </div>
  <p class="gz-text" id="gzBody"></p>`;
slots.appendChild(root);

const collapse = root.querySelector('.tc-collapse');
const toggle = root.querySelector('.gz-toggle');
collapse.addEventListener('click', () => toggleCard('zone'));
toggle.addEventListener('click', () => setGoalieZonesShown(!state.goalieZonesShown, { remember: false }));

function refresh() {
  toggle.textContent = t('goalie.zones.toggle');
  toggle.setAttribute('aria-pressed', String(!!state.goalieZonesShown));
  const collapsed = isCardCollapsed('zone');
  collapse.setAttribute('aria-expanded', String(!collapsed));
  root.classList.toggle('collapsed', collapsed);
  root.querySelector('.gz-text').hidden = collapsed;
  const zone = state.goalieZone?.zone;
  root.hidden = !zone;
  if (!zone) return;
  root.querySelector('.gz-dot').style.background = GOALIE_ZONE_TOKENS[zone].css;
  root.querySelector('.gz-name').textContent = t(`goalie.zone.${zone}.name`);
  root.querySelector('.gz-motto').textContent = t(`goalie.zone.${zone}.motto`);
  root.querySelector('.gz-text').textContent = t(`goalie.zone.${zone}.card`);
}

for (const ev of ['goalieZoneChanged', 'goalieZonesChanged', 'trainCardsChanged', 'langChanged']) window.addEventListener(ev, refresh);
refresh();
