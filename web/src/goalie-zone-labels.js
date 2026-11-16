// Zone labels (A-BACK-048 follow-up): a standing name tag in each goalie
// zone, as an HTML overlay that always faces the camera and keeps its
// screen size, so it reads from any angle and in the 2D view. The tag in
// the ball's zone is the big one, with its motto and depth range. Shown
// while the zones are and the Labels choice is on (goalie-zones-state.js),
// in Plan and Train. placeZoneLabels() runs every frame from main.js.

import * as THREE from 'three';
import { state } from './state.js';
import { renderer } from './scene.js';
import { zoneLabelAnchors, zoneDepthText } from './goalie-zones.js';
import { GOALIE_ZONE_TOKENS } from './tokens.js';
import { t } from './lang-state.js';
import './goalie-zones-state.js';   // loads state.goalieZoneLabelsShown
import { insetRect } from './shooter-inset.js';
import { rectsOverlap } from './shooter-view.js';

const root = document.createElement('div');
root.id = 'zoneLabels';
root.setAttribute('aria-hidden', 'true');   // the zone card says the same to screen readers
root.hidden = true;
document.body.appendChild(root);

let builtFor = null;   // `${goal}|${lang}`
let tagEls = [];       // [{ el, anchor }]

function build(goal) {
  root.textContent = '';
  tagEls = zoneLabelAnchors(goal).map((anchor) => {
    const el = document.createElement('span');
    el.className = 'zl-tag';
    el.dataset.zone = anchor.key;
    el.style.setProperty('--zl-color', GOALIE_ZONE_TOKENS[anchor.key].css);
    el.innerHTML = '<span class="zl-name"></span><span class="zl-extra"><span class="zl-motto"></span><span class="zl-depth"></span></span>';
    el.querySelector('.zl-name').textContent = t(`goalie.zone.${anchor.key}.name`);
    el.querySelector('.zl-motto').textContent = t(`goalie.zone.${anchor.key}.motto`);
    el.querySelector('.zl-depth').textContent = zoneDepthText(anchor.key);
    root.appendChild(el);
    return { el, anchor };
  });
  builtFor = `${goal}|${state.lang}`;
}

function shown() {
  const mode = document.body.dataset.mode;
  return state.goalieZonesShown && state.goalieZoneLabelsShown && !!state.goalieZone && (mode === 'plan' || mode === 'train');
}

const v = new THREE.Vector3();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function placeZoneLabels() {
  if (!shown()) {
    if (!root.hidden) root.hidden = true;
    return;
  }
  root.hidden = false;
  const { goal, zone } = state.goalieZone;
  if (builtFor !== `${goal}|${state.lang}`) build(goal);
  // The big tag goes to the ball's zone, on that zone's spot nearest the ball.
  const ball = state.ballGroup?.position;
  let current = null;
  for (const tag of tagEls) {
    if (tag.anchor.key !== zone) continue;
    if (!current || (ball && dist(tag.anchor, ball) < dist(current.anchor, ball))) current = tag;
  }
  const r = renderer.domElement.getBoundingClientRect();
  for (const tag of tagEls) {
    v.set(tag.anchor.x, 0, tag.anchor.z).project(state.activeCamera);
    const x = r.left + ((v.x + 1) / 2) * r.width;
    const y = r.top + ((1 - v.y) / 2) * r.height;
    const off = v.z > 1 || x < r.left || x > r.right || y < r.top || y > r.bottom;
    if (tag.el.hidden !== off) tag.el.hidden = off;
    tag.el.classList.toggle('current', tag === current);
    if (!off) tag.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }
  // Not on the shooter's view card (its view area is see-through).
  const card = insetRect();
  for (const tag of tagEls) tag.el.classList.toggle('under-inset', !tag.el.hidden && rectsOverlap(tag.el.getBoundingClientRect(), card));
}

window.addEventListener('langChanged', () => { builtFor = null; });
