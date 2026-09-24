// Layers panel (Mode A). Lists every doc-authored object (chips + shapes)
// for the current frame with per-row eye toggles + click-to-select.
//
// Refresh model: mutations in chips.js / shapes.js / frames.js /
// history.js dispatch a `layers:dirty` CustomEvent on `document`; this
// module listens and re-renders. Selection highlight rides
// onSelectionChanged.

import { state } from '../state.js';
import { ensureDoc } from './doc.js';
import { chipDataFor, setChipHidden, TEAM_COLORS, setLabelsVisible, updateChipLabel, removeChip, reorderChips } from './chips.js';
import { shapeDataFor, setShapeHidden, updateShapeLabel, updateShape, removeShape, reorderShapes } from './shapes.js';
import { coneDataFor, setConeHidden, updateCone, removeCone, CONE_DEFAULT_COLOR } from './cones.js';
import { ballDataFor, setBallHidden, updateBall, removeBall, BALL_DEFAULT_COLOR } from './balls.js';
import { goalDataFor, setGoalHidden, updateGoal, removeGoal } from './goals.js';
import { onSelectionChanged, selectObject, deselectAll } from '../selection.js';
import { makeFloatable } from './floatable.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const root = document.getElementById('layersPanel');
if (!root) throw new Error('layersPanel element missing from index.html');
{
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
  window.addEventListener('ballCarrierChanged', render);
  window.addEventListener('ballColorChanged', render);
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
    const cone = coneDataFor(state.selected);
    if (cone) return cone.id;
    const ball = ballDataFor(state.selected);
    if (ball) return ball.id;
    const goal = goalDataFor(state.selected);
    if (goal) return goal.id;
    return null;
  }

  function render() {
    body.innerHTML = '';
    const doc = ensureDoc();
    const players = Object.values(doc.scheme.players || {});
    const shapes = doc.scheme.shapes || [];
    const cones = doc.scheme.cones || [];
    const balls = doc.scheme.balls?.extras || [];
    const goals = doc.scheme.goals?.extras || [];
    const selId = selectedId();

    const teamA = players.filter((p) => p.team === 1);
    const teamB = players.filter((p) => p.team === 2);
    const zones = shapes.filter((s) => s.type === 'zone');
    const arrows = shapes.filter((s) => s.type === 'arrow');
    const texts = shapes.filter((s) => s.type === 'text');

    // No empty state: every frame has a match ball (A-BACK-026), so the Balls section always renders.

    renderSection('chips-a', `Team 1 · ${teamA.length}`, teamA.map(chipRow(selId)), (ids) => reorderChips(ids));
    renderSection('chips-b', `Team 2 · ${teamB.length}`, teamB.map(chipRow(selId)), (ids) => reorderChips(ids));
    renderSection('zones', `Zones · ${zones.length}`, zones.map(shapeRow(selId)), (ids) => reorderShapes(ids));
    renderSection('arrows', `Arrows · ${arrows.length}`, arrows.map(shapeRow(selId)), (ids) => reorderShapes(ids));
    renderSection('texts', `Text · ${texts.length}`, texts.map(shapeRow(selId)), (ids) => reorderShapes(ids));
    renderSection('cones', `Cones \u00b7 ${cones.length}`, cones.map(coneRow(selId)));
    renderSection('balls', `Balls \u00b7 ${balls.length + 1}`, [matchBallRow(doc), ...balls.map(ballRow(selId))]);
    renderSection('goals', `Goals \u00b7 ${goals.length}`, goals.map(goalRow(selId)));
  }

  function renderSection(key, title, rows, onReorder) {
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
    if (onReorder && rows.length > 1) wireDragReorder(list, onReorder);
    sec.appendChild(list);

    body.appendChild(sec);
  }

  // HTML5 drag-and-drop reorder within a single section. Every row in
  // `list` must carry `dataset.itemId`. On drop, `onReorder` is called
  // with the new id order for that section only.
  function wireDragReorder(list, onReorder) {
    let draggingId = null;
    list.querySelectorAll('.lp-row').forEach((row) => {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        draggingId = row.dataset.itemId;
        row.classList.add('lp-dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Firefox needs some payload to fire the drag events.
        e.dataTransfer.setData('text/plain', draggingId);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('lp-dragging');
        list.querySelectorAll('.lp-drop-before, .lp-drop-after').forEach((r) => {
          r.classList.remove('lp-drop-before', 'lp-drop-after');
        });
        draggingId = null;
      });
      row.addEventListener('dragover', (e) => {
        if (!draggingId || row.dataset.itemId === draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        list.querySelectorAll('.lp-drop-before, .lp-drop-after').forEach((r) => {
          r.classList.remove('lp-drop-before', 'lp-drop-after');
        });
        row.classList.add(before ? 'lp-drop-before' : 'lp-drop-after');
      });
      row.addEventListener('drop', (e) => {
        if (!draggingId || row.dataset.itemId === draggingId) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        const ids = Array.from(list.querySelectorAll('.lp-row')).map((r) => r.dataset.itemId);
        const from = ids.indexOf(draggingId);
        if (from < 0) return;
        ids.splice(from, 1);
        let to = ids.indexOf(row.dataset.itemId);
        if (!before) to += 1;
        ids.splice(to, 0, draggingId);
        onReorder(ids);
      });
    });
  }

  function chipRow(selId) {
    return (player) => {
      const row = document.createElement('div');
      row.className = 'lp-row';
      row.dataset.itemId = player.id;
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
      const displayName = (player.label && player.label.trim()) || `#${player.number}`;
      name.textContent = displayName;
      name.title = 'Double-click to rename';
      attachInlineRename(name, row, {
        current: (player.label && player.label.trim()) || '',
        placeholder: `#${player.number}`,
        commit: (v) => updateChipLabel(player.id, v),
      });
      row.appendChild(name);

      if (player.role) {
        const badge = document.createElement('span');
        badge.className = 'lp-role-badge';
        badge.dataset.role = player.role;
        badge.textContent = player.role[0].toUpperCase();
        badge.title = player.role;
        row.appendChild(badge);
      }

      row.appendChild(makeTrash(() => deleteChip(player.id)));

      row.addEventListener('click', () => {
        const group = state.chipGroups.find((g) => g.userData.chip && g.userData.chip.id === player.id);
        if (group) selectObject(group);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        deleteChip(player.id);
      });
      return row;
    };
  }

  function shapeRow(selId) {
    return (shape) => {
      const row = document.createElement('div');
      row.className = 'lp-row';
      row.dataset.itemId = shape.id;
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
      const defaultTypeName = `${shape.type[0].toUpperCase()}${shape.type.slice(1)}`;
      const displayName = shape.type === 'text'
        ? (shape.text?.trim() || 'Text')
        : (shape.label?.trim() || defaultTypeName);
      name.textContent = displayName;
      name.title = 'Double-click to rename';
      attachInlineRename(name, row, {
        current: shape.type === 'text' ? (shape.text || '') : (shape.label || ''),
        placeholder: defaultTypeName,
        commit: (v) => {
          if (shape.type === 'text') updateShape(shape.id, { text: v.trim() || 'Text' });
          else updateShapeLabel(shape.id, v);
        },
      });
      row.appendChild(name);

      row.appendChild(makeTrash(() => deleteShape(shape.id)));

      row.addEventListener('click', () => {
        const obj = state.shapeObjects.find((o) => o.userData.shape && o.userData.shape.id === shape.id);
        if (obj) selectObject(obj);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        deleteShape(shape.id);
      });
      return row;
    };
  }

  function makeTrash(onDelete) {
    const btn = document.createElement('button');
    btn.className = 'lp-trash';
    btn.title = 'Delete (or right-click row)';
    btn.textContent = '\u2715';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
    });
    return btn;
  }

  function deleteChip(id) {
    const group = state.chipGroups.find((g) => g.userData.chip?.id === id);
    if (group && state.selected === group) deselectAll();
    removeChip(id);
  }

  function deleteShape(id) {
    const obj = state.shapeObjects.find((o) => o.userData.shape?.id === id);
    if (obj && state.selected === obj) deselectAll();
    removeShape(id);
  }

  function deleteCone(id) {
    const mesh = state.coneObjects.find((m) => m.userData.cone?.id === id);
    if (mesh && state.selected === mesh) deselectAll();
    removeCone(id);
  }

  function deleteBall(id) {
    const mesh = state.extraBalls.find((m) => m.userData.ball?.id === id);
    if (mesh && state.selected === mesh) deselectAll();
    removeBall(id);
  }

  function deleteGoal(id) {
    const node = state.extraGoals.find((m) => m.userData.goal?.id === id);
    if (node && state.selected === node) deselectAll();
    removeGoal(id);
  }

  // The match ball (scheme.balls.main): always first, never deletable, tagged with its carrier.
  function matchBallRow(doc) {
    const main = doc.scheme.balls?.main;
    const row = document.createElement('div');
    row.className = 'lp-row';
    row.dataset.matchBall = '';
    if (state.ballGroup && state.selected === state.ballGroup) row.classList.add('selected');

    const spacer = document.createElement('span');
    spacer.className = 'lp-eye';
    row.appendChild(spacer);

    const swatch = document.createElement('span');
    swatch.className = 'lp-swatch';
    swatch.style.background = main?.color || BALL_DEFAULT_COLOR;
    row.appendChild(swatch);

    const carrier = main?.carrier ? doc.scheme.players?.[main.carrier] : null;
    const name = document.createElement('span');
    name.className = 'lp-name';
    name.textContent = carrier ? `Match ball → #${carrier.number}` : 'Match ball';
    name.title = 'The ball that can be carried, passed and shot';
    row.appendChild(name);

    row.addEventListener('click', () => { if (state.ballGroup) selectObject(state.ballGroup); });
    return row;
  }

  function ballRow(selId) {
    return (ball) => {
      const row = document.createElement('div');
      row.className = 'lp-row';
      if (ball.id === selId) row.classList.add('selected');

      const eye = document.createElement('button');
      eye.className = 'lp-eye';
      eye.title = ball.hidden ? 'Show' : 'Hide';
      eye.textContent = ball.hidden ? '\u25CB' : '\u25CF';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        setBallHidden(ball.id, !ball.hidden);
      });
      row.appendChild(eye);

      const swatch = document.createElement('span');
      swatch.className = 'lp-swatch';
      swatch.style.background = ball.color || BALL_DEFAULT_COLOR;
      row.appendChild(swatch);

      const name = document.createElement('span');
      name.className = 'lp-name';
      name.textContent = (ball.label && ball.label.trim()) || 'Ball';
      name.title = 'Double-click to rename';
      attachInlineRename(name, row, {
        current: (ball.label && ball.label.trim()) || '',
        placeholder: 'Ball',
        commit: (v) => updateBall(ball.id, { label: v }),
      });
      row.appendChild(name);

      row.appendChild(makeTrash(() => deleteBall(ball.id)));

      row.addEventListener('click', () => {
        const mesh = state.extraBalls.find((m) => m.userData.ball?.id === ball.id);
        if (mesh) selectObject(mesh);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        deleteBall(ball.id);
      });
      return row;
    };
  }

  function coneRow(selId) {
    return (cone) => {
      const row = document.createElement('div');
      row.className = 'lp-row';
      if (cone.id === selId) row.classList.add('selected');

      const eye = document.createElement('button');
      eye.className = 'lp-eye';
      eye.title = cone.hidden ? 'Show' : 'Hide';
      eye.textContent = cone.hidden ? '\u25CB' : '\u25CF';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        setConeHidden(cone.id, !cone.hidden);
      });
      row.appendChild(eye);

      const swatch = document.createElement('span');
      swatch.className = 'lp-swatch';
      swatch.style.background = cone.color || CONE_DEFAULT_COLOR;
      row.appendChild(swatch);

      const name = document.createElement('span');
      name.className = 'lp-name';
      const defaultName = cone.kind === 'disc' ? 'Disc' : cone.kind === 'pole' ? 'Pole' : 'Cone';
      name.textContent = (cone.label && cone.label.trim()) || defaultName;
      name.title = 'Double-click to rename';
      attachInlineRename(name, row, {
        current: (cone.label && cone.label.trim()) || '',
        placeholder: defaultName,
        commit: (v) => updateCone(cone.id, { label: v }),
      });
      row.appendChild(name);

      row.appendChild(makeTrash(() => deleteCone(cone.id)));

      row.addEventListener('click', () => {
        const mesh = state.coneObjects.find((m) => m.userData.cone?.id === cone.id);
        if (mesh) selectObject(mesh);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        deleteCone(cone.id);
      });
      return row;
    };
  }

  function goalRow(selId) {
    return (goal) => {
      const row = document.createElement('div');
      row.className = 'lp-row';
      if (goal.id === selId) row.classList.add('selected');

      const eye = document.createElement('button');
      eye.className = 'lp-eye';
      eye.title = goal.hidden ? 'Show' : 'Hide';
      eye.textContent = goal.hidden ? '\u25CB' : '\u25CF';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        setGoalHidden(goal.id, !goal.hidden);
      });
      row.appendChild(eye);

      const swatch = document.createElement('span');
      swatch.className = 'lp-swatch';
      swatch.style.background = '#c0c0c0';
      row.appendChild(swatch);

      const name = document.createElement('span');
      name.className = 'lp-name';
      name.textContent = (goal.label && goal.label.trim()) || 'Goal';
      name.title = 'Double-click to rename';
      attachInlineRename(name, row, {
        current: (goal.label && goal.label.trim()) || '',
        placeholder: 'Goal',
        commit: (v) => updateGoal(goal.id, { label: v }),
      });
      row.appendChild(name);

      row.appendChild(makeTrash(() => deleteGoal(goal.id)));

      row.addEventListener('click', () => {
        const node = state.extraGoals.find((m) => m.userData.goal?.id === goal.id);
        if (node) selectObject(node);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        deleteGoal(goal.id);
      });
      return row;
    };
  }

  // Turn a name span into a double-click-to-edit inline input. Enter or
  // blur commits, Esc cancels. Commit calls the chip/shape mutator, which
  // fires `layers:dirty` and re-renders the row from doc state.
  function attachInlineRename(span, row, { current, placeholder, commit }) {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'lp-name-input';
      input.type = 'text';
      input.value = current;
      input.placeholder = placeholder;
      input.maxLength = 32;
      row.replaceChild(input, span);
      input.focus();
      input.select();
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        if (save) commit(input.value);
        // If commit didn't fire a re-render (empty -> empty), restore span
        if (row.isConnected && row.contains(input)) {
          row.replaceChild(span, input);
        }
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
        ev.stopPropagation();
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (ev) => ev.stopPropagation());
    });
  }
}

makeFloatable(root, {
  storageKey: 'floorball.layersPanel.pos',
  reserved: { top: 48, left: 60, right: 8, bottom: 8 },
  defaultPos: { x: Math.max(60, window.innerWidth - 244), y: 480 },
});
