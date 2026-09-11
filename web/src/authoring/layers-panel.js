// Layers panel (Mode A). Lists every doc-authored object (chips + shapes)
// for the current frame with per-row eye toggles + click-to-select.
//
// Refresh model: mutations in chips.js / shapes.js / frames.js /
// history.js dispatch a `layers:dirty` CustomEvent on `document`; this
// module listens and re-renders. Selection highlight rides
// onSelectionChanged.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { chipDataFor, setChipHidden, TEAM_COLORS, setLabelsVisible } from './chips.js';
import { shapeDataFor, setShapeHidden } from './shapes.js';
import { onSelectionChanged, selectObject } from '../selection.js';

const root = document.getElementById('layersPanel');
if (root) {
  const body = root.querySelector('.lp-body');
  const collapseBtn = root.querySelector('.lp-toggle');
  const STORAGE_KEY = 'floorball3d.layersPanel.collapsed';
  const SECTION_KEY = 'floorball3d.layersPanel.sections';

  let sectionCollapsed = readSectionState();

  if (localStorage.getItem(STORAGE_KEY) === '1') root.classList.add('collapsed');
  collapseBtn.addEventListener('click', () => {
    root.classList.toggle('collapsed');
    localStorage.setItem(STORAGE_KEY, root.classList.contains('collapsed') ? '1' : '0');
  });

  // Marquee-scope toggle: whether a box-select drag also grabs shapes, not
  // just chips. On by default (select-everything is the common case); uncheck
  // it for pure formation authoring where only chips should be swept up.
  const marqueeToggle = document.getElementById('marqueeShapesToggle');
  const MARQUEE_KEY = 'floorball3d.marquee.includeShapes';
  if (marqueeToggle) {
    const on = localStorage.getItem(MARQUEE_KEY) !== '0';
    marqueeToggle.checked = on;
    state.marqueeIncludesShapes = on;
    marqueeToggle.addEventListener('change', () => {
      state.marqueeIncludesShapes = marqueeToggle.checked;
      localStorage.setItem(MARQUEE_KEY, marqueeToggle.checked ? '1' : '0');
    });
  }

  // In-scene labels visibility toggle (A-BACK-010). On by default; when
  // off, chips with a label fall back to the number sprite.
  const labelsToggle = document.getElementById('labelsVisibleToggle');
  const LABELS_KEY = 'floorball3d.labels.visible';
  if (labelsToggle) {
    const on = localStorage.getItem(LABELS_KEY) !== '0';
    labelsToggle.checked = on;
    setLabelsVisible(on);
    labelsToggle.addEventListener('change', () => {
      setLabelsVisible(labelsToggle.checked);
      localStorage.setItem(LABELS_KEY, labelsToggle.checked ? '1' : '0');
    });
  }

  document.addEventListener('layers:dirty', render);
  onSelectionChanged(render);
  // Initial render after the DOM is wired; chips/shapes may still be
  // spawning async but re-fires will catch up via layers:dirty.
  render();

  function readSectionState() {
    try { return JSON.parse(localStorage.getItem(SECTION_KEY) || '{}'); }
    catch { return {}; }
  }
  function persistSectionState() {
    localStorage.setItem(SECTION_KEY, JSON.stringify(sectionCollapsed));
  }

  function selectedId() {
    if (!state.selected) return null;
    const chip = chipDataFor(state.selected);
    if (chip) return chip.id;
    const shape = shapeDataFor(state.selected);
    if (shape) return shape.id;
    return null;
  }

  function render() {
    body.innerHTML = '';
    const doc = ensureDoc();
    const players = Object.values(doc.scheme.players || {});
    const shapes = doc.scheme.shapes || [];
    const selId = selectedId();

    const teamA = players.filter((p) => p.team === 1);
    const teamB = players.filter((p) => p.team === 2);
    const zones = shapes.filter((s) => s.type === 'zone');
    const arrows = shapes.filter((s) => s.type === 'arrow');
    const texts = shapes.filter((s) => s.type === 'text');

    if (!players.length && !shapes.length) {
      const empty = document.createElement('div');
      empty.className = 'lp-empty';
      empty.textContent = 'No chips or shapes on this frame yet.';
      body.appendChild(empty);
      return;
    }

    renderSection('chips-a', `Team 1 · ${teamA.length}`, teamA.map(chipRow(selId)));
    renderSection('chips-b', `Team 2 · ${teamB.length}`, teamB.map(chipRow(selId)));
    renderSection('zones', `Zones · ${zones.length}`, zones.map(shapeRow(selId)));
    renderSection('arrows', `Arrows · ${arrows.length}`, arrows.map(shapeRow(selId)));
    renderSection('texts', `Text · ${texts.length}`, texts.map(shapeRow(selId)));
  }

  function renderSection(key, title, rows) {
    if (!rows.length) return;
    const sec = document.createElement('div');
    sec.className = 'lp-section';
    if (sectionCollapsed[key]) sec.classList.add('collapsed');

    const head = document.createElement('div');
    head.className = 'lp-section-head';
    head.textContent = title;
    head.addEventListener('click', () => {
      sec.classList.toggle('collapsed');
      sectionCollapsed[key] = sec.classList.contains('collapsed');
      persistSectionState();
    });
    sec.appendChild(head);

    const list = document.createElement('div');
    list.className = 'lp-section-body';
    for (const r of rows) list.appendChild(r);
    sec.appendChild(list);

    body.appendChild(sec);
  }

  function chipRow(selId) {
    return (player) => {
      const row = document.createElement('div');
      row.className = 'lp-row';
      if (player.id === selId) row.classList.add('selected');

      const eye = document.createElement('button');
      eye.className = 'lp-eye';
      eye.title = player.hidden ? 'Show' : 'Hide';
      eye.textContent = player.hidden ? '\u25CB' : '\u25CF';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        setChipHidden(player.id, !player.hidden);
      });
      row.appendChild(eye);

      const swatch = document.createElement('span');
      swatch.className = 'lp-swatch';
      swatch.style.background = '#' + (TEAM_COLORS[player.team] ?? 0x888888).toString(16).padStart(6, '0');
      row.appendChild(swatch);

      const name = document.createElement('span');
      name.className = 'lp-name';
      name.textContent = (player.label && player.label.trim()) || `#${player.number}`;
      row.appendChild(name);

      if (player.role) {
        const badge = document.createElement('span');
        badge.className = 'lp-role-badge';
        badge.dataset.role = player.role;
        badge.textContent = player.role[0].toUpperCase();
        badge.title = player.role;
        row.appendChild(badge);
      }

      row.addEventListener('click', () => {
        const group = state.chipGroups.find((g) => g.userData.chip && g.userData.chip.id === player.id);
        if (group) selectObject(group);
      });
      return row;
    };
  }

  function shapeRow(selId) {
    return (shape) => {
      const row = document.createElement('div');
      row.className = 'lp-row';
      if (shape.id === selId) row.classList.add('selected');

      const eye = document.createElement('button');
      eye.className = 'lp-eye';
      eye.title = shape.hidden ? 'Show' : 'Hide';
      eye.textContent = shape.hidden ? '\u25CB' : '\u25CF';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        setShapeHidden(shape.id, !shape.hidden);
      });
      row.appendChild(eye);

      const swatch = document.createElement('span');
      swatch.className = 'lp-swatch';
      swatch.style.background = shape.color || '#ffb347';
      row.appendChild(swatch);

      const name = document.createElement('span');
      name.className = 'lp-name';
      name.textContent = shape.type === 'text'
        ? (shape.text?.trim() || 'Text')
        : (shape.type === 'zone' && shape.label?.trim())
          ? shape.label.trim()
          : `${shape.type[0].toUpperCase()}${shape.type.slice(1)}`;
      row.appendChild(name);

      row.addEventListener('click', () => {
        const obj = state.shapeObjects.find((o) => o.userData.shape && o.userData.shape.id === shape.id);
        if (obj) selectObject(obj);
      });
      return row;
    };
  }
}
