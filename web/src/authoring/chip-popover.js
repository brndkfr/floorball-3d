// Chip-anchored popover (Mode A). When a chip is selected, a small floating
// card follows the chip's screen-space position with T1/T2 + delete controls,
// replacing the right-side Inspector's chip UI. Non-chip selections still
// use the Inspector.
//
// Position is computed by projecting the chip group's world position through
// state.activeCamera each frame while visible; a self-driven rAF loop keeps
// the card glued to the chip during camera pans, zooms, and mode swaps
// without touching main.js's animate().

import * as THREE from 'three';
import { state } from '../state.js';
import { onSelectionChanged, deselectAll } from '../selection.js';
import { chipDataFor, removeChip, updateChipTeam, updateChipLabel, TEAM_COLORS, CHIP_HEIGHT, CHIP_DISPLAY_SCALE } from './chips.js';

const root = document.createElement('div');
root.id = 'chipPopover';
root.style.display = 'none';
document.body.appendChild(root);

let currentChipGroup = null;
let currentChipData = null;
let expanded = false;
let rafHandle = 0;
const worldPos = new THREE.Vector3();
const screenPos = new THREE.Vector3();

onSelectionChanged((sel) => {
  const chip = chipDataFor(sel);
  if (chip) {
    currentChipGroup = sel;
    currentChipData = chip;
    expanded = false;
    render();
    show();
  } else {
    hide();
  }
});

function show() {
  root.style.display = 'block';
  if (!rafHandle) rafHandle = requestAnimationFrame(tick);
}

function hide() {
  root.style.display = 'none';
  currentChipGroup = null;
  currentChipData = null;
  if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
}

function tick() {
  rafHandle = 0;
  if (!currentChipGroup || !state.activeCamera) return;
  // Anchor above the chip's top (disc height + a small gap), so the card
  // hovers over the player rather than clipping through it.
  worldPos.set(
    currentChipGroup.position.x,
    (CHIP_HEIGHT + 40) * CHIP_DISPLAY_SCALE,
    currentChipGroup.position.z,
  );
  screenPos.copy(worldPos).project(state.activeCamera);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = (screenPos.x * 0.5 + 0.5) * w;
  const y = (-screenPos.y * 0.5 + 0.5) * h;
  const behindCamera = screenPos.z > 1 || screenPos.z < -1;
  if (behindCamera) {
    root.style.visibility = 'hidden';
  } else {
    root.style.visibility = 'visible';
    // Clamp so the card never leaves the viewport when the chip is near an edge.
    const cardW = root.offsetWidth || 180;
    const cardH = root.offsetHeight || 80;
    const margin = 8;
    const clampedX = Math.max(cardW / 2 + margin, Math.min(w - cardW / 2 - margin, x));
    const clampedY = Math.max(cardH + margin, Math.min(h - margin, y));
    root.style.left = clampedX + 'px';
    root.style.top = clampedY + 'px';
  }
  rafHandle = requestAnimationFrame(tick);
}

function teamColorCss(team) {
  const hex = TEAM_COLORS[team];
  return hex != null ? '#' + hex.toString(16).padStart(6, '0') : '#888';
}

function render() {
  const chip = currentChipData;
  if (!chip) return;
  root.innerHTML = '';
  root.classList.toggle('collapsed', !expanded);

  const displayLabel = chip.label?.trim() || `Player #${chip.number}`;

  // Header row: label + expand/collapse chevron. Clicking anywhere on the
  // header (outside the chevron) toggles expanded state so the whole
  // collapsed pill is a hit target.
  const header = document.createElement('div');
  header.className = 'pop-header';
  const title = document.createElement('div');
  title.className = 'pop-title';
  title.textContent = displayLabel;
  header.appendChild(title);
  const chevron = document.createElement('button');
  chevron.className = 'pop-chevron';
  chevron.type = 'button';
  chevron.textContent = expanded ? '\u25B2' : '\u25BC';
  chevron.title = expanded ? 'Collapse' : 'Expand';
  chevron.addEventListener('click', (e) => {
    e.stopPropagation();
    expanded = !expanded;
    render();
  });
  header.appendChild(chevron);
  header.addEventListener('click', (e) => {
    if (e.target === chevron) return;
    expanded = !expanded;
    render();
  });
  root.appendChild(header);

  if (!expanded) return;

  const labelRow = document.createElement('div');
  labelRow.className = 'pop-label-row';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'pop-label-input';
  labelInput.placeholder = `Player #${chip.number}`;
  labelInput.value = chip.label || '';
  labelInput.maxLength = 32;
  labelInput.addEventListener('pointerdown', (e) => e.stopPropagation());
  labelInput.addEventListener('change', () => {
    updateChipLabel(chip.id, labelInput.value);
    chip.label = labelInput.value.trim() || undefined;
    title.textContent = chip.label || `Player #${chip.number}`;
  });
  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') labelInput.blur();
  });
  labelRow.appendChild(labelInput);
  root.appendChild(labelRow);

  const row = document.createElement('div');
  row.className = 'pop-row';
  for (const team of [1, 2]) {
    const btn = document.createElement('button');
    btn.className = 'pop-team-btn' + (chip.team === team ? ' active' : '');
    btn.style.setProperty('--team-color', teamColorCss(team));
    btn.textContent = `T${team}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (chip.team === team) return;
      updateChipTeam(chip.id, team);
      chip.team = team;
      render();
    });
    row.appendChild(btn);
  }
  root.appendChild(row);

  const del = document.createElement('button');
  del.className = 'pop-btn danger';
  del.textContent = 'Delete';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    removeChip(chip.id);
    deselectAll();
  });
  root.appendChild(del);
}

// Swallow pointer events targeted at the card so clicks on T1/T2/Delete
// don't fall through to selection.js's canvas listener and deselect the chip.
root.addEventListener('pointerdown', (e) => e.stopPropagation());
root.addEventListener('pointerup', (e) => e.stopPropagation());
