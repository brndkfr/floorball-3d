// Verdict chip on the rink (A-BACK-045 step 5): dot + verdict + % blocked,
// above the targeted goal's goalie, while any shot overlay is on. Replaces
// coverage.js's old "% blocked" label, which projected with the 3D camera
// onto the whole window and so sat at the wrong goal in 2D. Uses the
// #goalieLabel element, which Present already hides (panel-layout.js).

import * as THREE from 'three';
import { state, goalieForGoal, shotGoal } from '../state.js';
import { renderer } from '../scene.js';
import { anyShotOverlay } from '../shot-view.js';
import { verdictWords, ndcToPage } from '../shot-chip-math.js';
import { SHOT_LINE_TOKENS } from '../tokens.js';

const el = document.getElementById('goalieLabel');
if (!el) throw new Error('shot-chip.js: #goalieLabel missing from index.html');
el.innerHTML = '<span class="shot-chip-dot" aria-hidden="true"></span><span class="shot-chip-title"></span><span class="shot-chip-pct"></span>';
const dotEl = el.querySelector('.shot-chip-dot');
const titleEl = el.querySelector('.shot-chip-title');
const pctEl = el.querySelector('.shot-chip-pct');

const p = new THREE.Vector3();
const HEAD_MM = 1500;   // above the kneeling goalie's head (~1.36 m), estimate

export function updateShotChip() {
  const words = verdictWords(state.shotReadout);
  const goalie = goalieForGoal(shotGoal());
  const cam = state.activeCamera;
  if (!words || state.quiet || !anyShotOverlay(state.shotView) || !cam) return hide();   // quiet lesson frame: no verdict chip (A-BACK-049)
  const anchor = goalie && goalie.visible ? goalie.position : shotGoal()?.position;
  if (!anchor) return hide();
  p.set(anchor.x, HEAD_MM, anchor.z).project(cam);
  const at = ndcToPage(p, renderer.domElement.getBoundingClientRect());
  if (!at) return hide();
  el.style.left = `${at.left}px`;
  el.style.top = `${at.top}px`;
  titleEl.textContent = words.title;
  pctEl.textContent = words.pct;
  dotEl.style.background = SHOT_LINE_TOKENS[words.key].css;
  el.style.borderColor = SHOT_LINE_TOKENS[words.key].css;
  el.style.display = 'flex';
}

function hide() {
  el.style.display = 'none';
}
