// Zone card in the Train panel (A-BACK-048): the ball's goalie zone with
// its name, motto and our short card text, in the app language, plus the
// Zones toggle for the floor layer. Follows `goalieZoneChanged`
// (goalie-zones-layer.js), `goalieZonesChanged` and `langChanged`.

import { state } from '../state.js';
import { t } from '../lang-state.js';
import { setGoalieZonesShown } from '../goalie-zones-state.js';
import { GOALIE_ZONE_TOKENS } from '../tokens.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const slots = document.getElementById('trainSlots');
if (!slots) throw new Error('goalie-zone-card.js: #trainSlots missing from index.html');

const root = document.createElement('section');
root.className = 'gz';
root.innerHTML = `
  <div class="gz-head"><span class="gz-label"></span><button type="button" class="gz-toggle"></button></div>
  <div class="gz-card" role="status">
    <div class="gz-title"><span class="gz-dot" aria-hidden="true"></span><span class="gz-name"></span></div>
    <div class="gz-motto"></div>
    <p class="gz-text"></p>
  </div>`;
slots.appendChild(root);

const toggle = root.querySelector('.gz-toggle');
toggle.addEventListener('click', () => setGoalieZonesShown(!state.goalieZonesShown, { remember: false }));

function refresh() {
  root.querySelector('.gz-label').textContent = t('goalie.zones.section');
  toggle.textContent = t('goalie.zones.toggle');
  toggle.setAttribute('aria-pressed', String(!!state.goalieZonesShown));
  const zone = state.goalieZone?.zone;
  root.querySelector('.gz-card').hidden = !zone;
  if (!zone) return;
  root.querySelector('.gz-dot').style.background = GOALIE_ZONE_TOKENS[zone].css;
  root.querySelector('.gz-name').textContent = t(`goalie.zone.${zone}.name`);
  root.querySelector('.gz-motto').textContent = t(`goalie.zone.${zone}.motto`);
  root.querySelector('.gz-text').textContent = t(`goalie.zone.${zone}.card`);
}

for (const ev of ['goalieZoneChanged', 'goalieZonesChanged', 'langChanged']) window.addEventListener(ev, refresh);
refresh();
