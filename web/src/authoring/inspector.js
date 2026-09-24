// Right-side inspector panel (Mode A). Renders properties for the current
// selection: chip -> team + delete; shape -> colour swatch + delete;
// ball/goalie/goal -> read-only label; nothing -> hint.
//
// Reacts to selection.js's onSelectionChanged. Property mutations go
// through the same helpers the dock/keyboard shortcuts already use, so
// history + persistence + rebuilds "just work".

import { state } from '../state.js';
import { onSelectionChanged, deselectAll, labelFor } from '../selection.js';
import { chipDataFor } from './chips.js';
import { shapeDataFor, removeShape, updateShape, updateShapeLabel, TEXT_MIN_SIZE, TEXT_MAX_SIZE, TEXT_DEFAULT_SIZE } from './shapes.js';
import { coneDataFor, updateCone, CONE_DEFAULT_COLOR } from './cones.js';
import { ballDataFor, updateBall, BALL_DEFAULT_COLOR } from './balls.js';
import { goalDataFor, updateGoal, fixedGoalLetterOf, fixedGoalDataFor, updateFixedGoal, GOAL_LABEL_DEFAULT_COLOR, GOAL_LABEL_DEFAULT_SIZE, GOAL_LABEL_MIN_SIZE, GOAL_LABEL_MAX_SIZE } from './goals.js';
import { arrowRoleColor } from '../tokens.js';
import { ensureDoc } from './doc.js';
import { getBallCarrier, setBallCarrier, getBallColor, setBallColor } from './actors.js';
import { passTargets } from './choreo-pass.js';
import { makeFloatable } from './floatable.js';

// Chip properties live in the chip-anchored popover (see chip-popover.js),
// not here; the Inspector still handles shapes / text / read-only labels.

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const inspectorEl = document.getElementById('inspector');
if (!inspectorEl) throw new Error('inspector element missing from index.html');
const body = document.getElementById('inspectorBody');
if (!body) throw new Error('inspectorBody element missing from index.html');

onSelectionChanged(render);
window.addEventListener('ballCarrierChanged', () => render(state.selected));
window.addEventListener('ballColorChanged', () => render(state.selected));
render(state.selected);

makeFloatable(inspectorEl, {
  storageKey: 'floorball.inspector.pos',
  reserved: { top: 48, left: 60, right: 8, bottom: 8 },
  defaultPos: { x: Math.max(60, window.innerWidth - 244), y: 220 },
});

function render(sel) {
  body.innerHTML = '';

  if (state.selectedSet.length > 1) {
    const heading = document.createElement('div');
    heading.className = 'ins-heading';
    heading.textContent = `${state.selectedSet.length} items selected`;
    body.appendChild(heading);
    const hint = document.createElement('div');
    hint.className = 'ins-empty';
    hint.textContent = 'Use the bulk bar to reteam or delete. Right-click the floor to move the whole formation.';
    body.appendChild(hint);
    return;
  }

  if (!sel) {
    const empty = document.createElement('div');
    empty.className = 'ins-empty';
    empty.textContent = 'Nothing selected. Click a chip, shape, ball, goalie or goal - or use a tool from the palette.';
    body.appendChild(empty);
    return;
  }

  const chip = chipDataFor(sel);
  if (chip) {
    const heading = document.createElement('div');
    heading.className = 'ins-heading';
    heading.textContent = chip.label?.trim() || `Player #${chip.number}`;
    body.appendChild(heading);
    const hint = document.createElement('div');
    hint.className = 'ins-empty';
    hint.textContent = 'Tap the label above the chip to edit.';
    body.appendChild(hint);
    return;
  }

  const shape = shapeDataFor(sel);
  if (shape) return renderShape(shape);

  const cone = coneDataFor(sel);
  if (cone) return renderCone(cone);

  const extraBall = ballDataFor(sel);
  if (extraBall) return renderExtraBall(extraBall);

  const extraGoal = goalDataFor(sel);
  if (extraGoal) return renderExtraGoal(extraGoal, sel);

  const fixedLetter = fixedGoalLetterOf(sel);
  if (fixedLetter) return renderFixedGoal(fixedLetter);

  // Ball / goalie / goal / other: read-only label.
  const heading = document.createElement('div');
  heading.className = 'ins-heading';
  heading.textContent = labelFor(sel);
  body.appendChild(heading);

  // Goalie: rotation slider (Q/E works too but a slider is discoverable).
  if (sel === state.goalieGroup) {
    body.appendChild(rotationRow(sel));
    return;
  }

  // Ball: carrier picker + colour tint on the primary ball mesh.
  if (sel === state.ballGroup) {
    body.appendChild(carrierRow());
    body.appendChild(passRow());
    body.appendChild(ballColorRow());
    const hint = document.createElement('div');
    hint.className = 'ins-empty';
    hint.style.marginTop = '6px';
    hint.textContent = 'Shortcut: right-click a chip to pass to it.';
    body.appendChild(hint);
    return;
  }

  const empty = document.createElement('div');
  empty.className = 'ins-empty';
  empty.textContent = 'No editable properties.';
  body.appendChild(empty);
}

function carrierRow() {
  const row = document.createElement('div');
  row.className = 'ins-row';
  const label = document.createElement('span');
  label.className = 'ins-label';
  label.textContent = 'Has ball';
  row.appendChild(label);

  const sel = document.createElement('select');
  sel.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '(loose)';
  sel.appendChild(none);
  const doc = ensureDoc();
  for (const p of Object.values(doc.scheme.players || {})) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `Team ${p.team} #${p.number}` + (p.label ? ` \u00b7 ${p.label}` : '');
    sel.appendChild(opt);
  }
  sel.value = getBallCarrier() ?? '';
  sel.addEventListener('change', () => setBallCarrier(sel.value || null));
  row.appendChild(sel);
  return row;
}

function passRow() {
  const row = document.createElement('div');
  row.className = 'ins-row';
  row.id = 'inspectorPassTo';
  row.style.flexWrap = 'wrap';
  const label = document.createElement('span');
  label.className = 'ins-label';
  label.textContent = 'Pass to';
  row.appendChild(label);
  const targets = passTargets(Object.values(ensureDoc().scheme.players || {}), getBallCarrier());
  for (const t of targets) {
    const btn = document.createElement('button');
    btn.className = 'ins-btn';
    btn.dataset.passTo = t.id;
    btn.textContent = t.text;
    btn.addEventListener('click', () => setBallCarrier(t.id));
    row.appendChild(btn);
  }
  return row;
}

function ballColorRow() {
  const row = document.createElement('div');
  row.className = 'ins-row';
  const label = document.createElement('span');
  label.className = 'ins-label';
  label.textContent = 'Colour';
  row.appendChild(label);

  const stored = getBallColor();
  const input = document.createElement('input');
  input.type = 'color';
  input.value = stored || '#ffffff';
  input.style.cssText = 'width:36px; height:26px; border:none; background:transparent; cursor:pointer; padding:0;';
  input.addEventListener('input', () => setBallColor(input.value));
  row.appendChild(input);

  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.title = 'Restore the ball\u2019s default (loader) colour';
  reset.style.cssText = 'margin-left:6px; padding:2px 8px; border-radius:4px; cursor:pointer; border:1px solid rgba(79,224,255,0.35); background:rgba(79,224,255,0.08); color:#dff9ff; font-family:inherit; font-size:10px;';
  reset.addEventListener('click', () => { setBallColor(null); input.value = '#ffffff'; });
  row.appendChild(reset);

  return row;
}

function rotationRow(obj) {
  const row = document.createElement('div');
  row.className = 'ins-row';
  const label = document.createElement('span');
  label.className = 'ins-label';
  label.textContent = 'Facing';
  row.appendChild(label);

  const deg = () => Math.round((obj.rotation.y * 180 / Math.PI) % 360);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '-180'; slider.max = '180'; slider.step = '1';
  slider.value = String(((deg() + 540) % 360) - 180);
  slider.style.cssText = 'flex:1;';

  const num = document.createElement('input');
  num.type = 'number';
  num.min = '-180'; num.max = '180'; num.step = '1';
  num.value = slider.value;
  num.style.cssText = 'width:56px; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:2px 4px; font-family:inherit; font-size:11px;';

  function apply(v) {
    const rad = v * Math.PI / 180;
    obj.rotation.y = rad;
    slider.value = String(v);
    num.value = String(v);
  }
  slider.addEventListener('input', () => apply(Number(slider.value)));
  num.addEventListener('input', () => apply(Number(num.value)));

  row.appendChild(slider);
  row.appendChild(num);
  return row;
}

function renderCone(cone) {
  const heading = document.createElement('div');
  heading.className = 'ins-heading';
  const kindLabel = cone.kind === 'disc' ? 'Disc' : cone.kind === 'pole' ? 'Pole' : 'Cone';
  heading.textContent = kindLabel + (cone.label ? ` \u00b7 ${cone.label}` : '');
  body.appendChild(heading);

  // Kind switcher (Disc <-> Full <-> Pole)
  const kindRow = document.createElement('div');
  kindRow.className = 'ins-row';
  const kl = document.createElement('span');
  kl.className = 'ins-label';
  kl.textContent = 'Kind';
  kindRow.appendChild(kl);
  const kindSel = document.createElement('select');
  kindSel.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
  for (const opt of [{ v: 'disc', t: 'Disc (flat)' }, { v: 'full', t: 'Full (cone)' }, { v: 'pole', t: 'Pole (disc + rod)' }]) {
    const o = document.createElement('option');
    o.value = opt.v; o.textContent = opt.t;
    kindSel.appendChild(o);
  }
  kindSel.value = cone.kind;
  kindSel.addEventListener('change', () => updateCone(cone.id, { kind: kindSel.value }));
  kindRow.appendChild(kindSel);
  body.appendChild(kindRow);

  // Colour picker
  const colorRow = document.createElement('div');
  colorRow.className = 'ins-row';
  const cl = document.createElement('span');
  cl.className = 'ins-label';
  cl.textContent = 'Colour';
  colorRow.appendChild(cl);
  const input = document.createElement('input');
  input.type = 'color';
  input.value = cone.color || CONE_DEFAULT_COLOR;
  input.style.cssText = 'width:36px; height:26px; border:none; background:transparent; cursor:pointer; padding:0;';
  input.addEventListener('input', () => updateCone(cone.id, { color: input.value }));
  colorRow.appendChild(input);
  body.appendChild(colorRow);

  // Label editor
  const labelRow = document.createElement('div');
  labelRow.className = 'ins-row';
  const ll = document.createElement('span');
  ll.className = 'ins-label';
  ll.textContent = 'Label';
  labelRow.appendChild(ll);
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.maxLength = 32;
  labelInput.placeholder = cone.kind === 'disc' ? 'Disc' : cone.kind === 'pole' ? 'Pole' : 'Cone';
  labelInput.value = cone.label || '';
  labelInput.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
  labelInput.addEventListener('change', () => updateCone(cone.id, { label: labelInput.value }));
  labelRow.appendChild(labelInput);
  body.appendChild(labelRow);
}

function renderExtraBall(ball) {
  const heading = document.createElement('div');
  heading.className = 'ins-heading';
  heading.textContent = 'Ball' + (ball.label ? ` \u00b7 ${ball.label}` : '');
  body.appendChild(heading);

  const colorRow = document.createElement('div');
  colorRow.className = 'ins-row';
  const cl = document.createElement('span');
  cl.className = 'ins-label';
  cl.textContent = 'Colour';
  colorRow.appendChild(cl);
  const input = document.createElement('input');
  input.type = 'color';
  input.value = ball.color || BALL_DEFAULT_COLOR;
  input.style.cssText = 'width:36px; height:26px; border:none; background:transparent; cursor:pointer; padding:0;';
  input.addEventListener('input', () => updateBall(ball.id, { color: input.value }));
  colorRow.appendChild(input);
  body.appendChild(colorRow);

  const labelRow = document.createElement('div');
  labelRow.className = 'ins-row';
  const ll = document.createElement('span');
  ll.className = 'ins-label';
  ll.textContent = 'Label';
  labelRow.appendChild(ll);
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.maxLength = 32;
  labelInput.placeholder = 'Ball';
  labelInput.value = ball.label || '';
  labelInput.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
  labelInput.addEventListener('change', () => updateBall(ball.id, { label: labelInput.value }));
  labelRow.appendChild(labelInput);
  body.appendChild(labelRow);

  const hint = document.createElement('div');
  hint.className = 'ins-empty';
  hint.style.marginTop = '6px';
  hint.textContent = 'Extra balls are decorative. Coverage / trajectory analysis still tracks the primary ball only.';
  body.appendChild(hint);
}

// Extra goal: rotation slider (Q/E works too) + label. The two fixed IFF
// goals are handled by the read-only branch further up (they're in
// state.goalInstances, not state.extraGoals).
function renderExtraGoal(goal, node) {
  const heading = document.createElement('div');
  heading.className = 'ins-heading';
  heading.textContent = 'Goal' + (goal.label ? ` \u00b7 ${goal.label}` : '');
  body.appendChild(heading);

  const rotRow = document.createElement('div');
  rotRow.className = 'ins-row';
  const rl = document.createElement('span');
  rl.className = 'ins-label';
  rl.textContent = 'Rot';
  rotRow.appendChild(rl);
  const rot = document.createElement('input');
  rot.type = 'range';
  rot.min = '-180'; rot.max = '180'; rot.step = '1';
  rot.value = String(Math.round((goal.rotY || 0) * 180 / Math.PI));
  rot.style.flex = '1';
  const readout = document.createElement('span');
  readout.textContent = rot.value + '\u00b0';
  readout.style.cssText = 'min-width:36px; text-align:right; font-variant-numeric:tabular-nums;';
  rot.addEventListener('input', () => {
    const deg = Number(rot.value);
    readout.textContent = deg + '\u00b0';
    const rad = deg * Math.PI / 180;
    if (node) node.rotation.y = rad;
    updateGoal(goal.id, { rotY: rad });
  });
  rotRow.appendChild(rot);
  rotRow.appendChild(readout);
  body.appendChild(rotRow);

  const labelRow = document.createElement('div');
  labelRow.className = 'ins-row';
  const ll = document.createElement('span');
  ll.className = 'ins-label';
  ll.textContent = 'Label';
  labelRow.appendChild(ll);
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.maxLength = 32;
  labelInput.placeholder = 'Goal';
  labelInput.value = goal.label || '';
  labelInput.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
  labelInput.addEventListener('change', () => updateGoal(goal.id, { label: labelInput.value }));
  labelRow.appendChild(labelInput);
  body.appendChild(labelRow);

  // Show-label toggle. When on, colour + size rows appear below.
  const showRow = document.createElement('div');
  showRow.className = 'ins-row';
  const sl = document.createElement('span');
  sl.className = 'ins-label';
  sl.textContent = 'Show';
  showRow.appendChild(sl);
  const showCb = document.createElement('input');
  showCb.type = 'checkbox';
  showCb.checked = !!goal.labelVisible;
  showCb.addEventListener('change', () => {
    updateGoal(goal.id, { labelVisible: showCb.checked });
    colorRow.style.display = showCb.checked ? '' : 'none';
    sizeRow.style.display = showCb.checked ? '' : 'none';
  });
  showRow.appendChild(showCb);
  body.appendChild(showRow);

  const colorRow = document.createElement('div');
  colorRow.className = 'ins-row';
  colorRow.style.display = goal.labelVisible ? '' : 'none';
  const cl = document.createElement('span');
  cl.className = 'ins-label';
  cl.textContent = 'Colour';
  colorRow.appendChild(cl);
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = goal.labelColor || GOAL_LABEL_DEFAULT_COLOR;
  colorInput.style.cssText = 'width:36px; height:26px; border:none; background:transparent; cursor:pointer; padding:0;';
  colorInput.addEventListener('input', () => updateGoal(goal.id, { labelColor: colorInput.value }));
  colorRow.appendChild(colorInput);
  body.appendChild(colorRow);

  const sizeRow = document.createElement('div');
  sizeRow.className = 'ins-row';
  sizeRow.style.display = goal.labelVisible ? '' : 'none';
  const szl = document.createElement('span');
  szl.className = 'ins-label';
  szl.textContent = 'Size';
  sizeRow.appendChild(szl);
  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = String(GOAL_LABEL_MIN_SIZE);
  sizeInput.max = String(GOAL_LABEL_MAX_SIZE);
  sizeInput.step = '50';
  sizeInput.value = String(goal.labelSize || GOAL_LABEL_DEFAULT_SIZE);
  sizeInput.style.flex = '1';
  const sizeReadout = document.createElement('span');
  sizeReadout.textContent = sizeInput.value;
  sizeReadout.style.cssText = 'min-width:44px; text-align:right; font-variant-numeric:tabular-nums;';
  sizeInput.addEventListener('input', () => {
    sizeReadout.textContent = sizeInput.value;
    updateGoal(goal.id, { labelSize: Number(sizeInput.value) });
  });
  sizeRow.appendChild(sizeInput);
  sizeRow.appendChild(sizeReadout);
  body.appendChild(sizeRow);

  const hint = document.createElement('div');
  hint.className = 'ins-empty';
  hint.style.marginTop = '6px';
  hint.textContent = 'Extra goals are markers only. Trajectory / coverage still targets the two end-of-rink IFF goals.';
  body.appendChild(hint);
}

// Fixed IFF goals A/B. Same label controls as extras, but no rotation
// slider (they're pinned to the ends of the rink) and no delete.
function renderFixedGoal(letter) {
  const data = fixedGoalDataFor(letter);
  const heading = document.createElement('div');
  heading.className = 'ins-heading';
  heading.textContent = `Goal ${letter}`;
  body.appendChild(heading);

  const labelRow = document.createElement('div');
  labelRow.className = 'ins-row';
  const ll = document.createElement('span');
  ll.className = 'ins-label';
  ll.textContent = 'Label';
  labelRow.appendChild(ll);
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.maxLength = 32;
  labelInput.placeholder = letter === 'A' ? 'Home' : 'Away';
  labelInput.value = data.label;
  labelInput.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
  labelInput.addEventListener('change', () => updateFixedGoal(letter, { label: labelInput.value }));
  labelRow.appendChild(labelInput);
  body.appendChild(labelRow);

  const showRow = document.createElement('div');
  showRow.className = 'ins-row';
  const sl = document.createElement('span');
  sl.className = 'ins-label';
  sl.textContent = 'Show';
  showRow.appendChild(sl);
  const showCb = document.createElement('input');
  showCb.type = 'checkbox';
  showCb.checked = data.labelVisible;
  showCb.addEventListener('change', () => {
    updateFixedGoal(letter, { labelVisible: showCb.checked });
    colorRow.style.display = showCb.checked ? '' : 'none';
    sizeRow.style.display = showCb.checked ? '' : 'none';
  });
  showRow.appendChild(showCb);
  body.appendChild(showRow);

  const colorRow = document.createElement('div');
  colorRow.className = 'ins-row';
  colorRow.style.display = data.labelVisible ? '' : 'none';
  const cl = document.createElement('span');
  cl.className = 'ins-label';
  cl.textContent = 'Colour';
  colorRow.appendChild(cl);
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = data.labelColor;
  colorInput.style.cssText = 'width:36px; height:26px; border:none; background:transparent; cursor:pointer; padding:0;';
  colorInput.addEventListener('input', () => updateFixedGoal(letter, { labelColor: colorInput.value }));
  colorRow.appendChild(colorInput);
  body.appendChild(colorRow);

  const sizeRow = document.createElement('div');
  sizeRow.className = 'ins-row';
  sizeRow.style.display = data.labelVisible ? '' : 'none';
  const szl = document.createElement('span');
  szl.className = 'ins-label';
  szl.textContent = 'Size';
  sizeRow.appendChild(szl);
  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = String(GOAL_LABEL_MIN_SIZE);
  sizeInput.max = String(GOAL_LABEL_MAX_SIZE);
  sizeInput.step = '50';
  sizeInput.value = String(data.labelSize);
  sizeInput.style.flex = '1';
  const sizeReadout = document.createElement('span');
  sizeReadout.textContent = sizeInput.value;
  sizeReadout.style.cssText = 'min-width:44px; text-align:right; font-variant-numeric:tabular-nums;';
  sizeInput.addEventListener('input', () => {
    sizeReadout.textContent = sizeInput.value;
    updateFixedGoal(letter, { labelSize: Number(sizeInput.value) });
  });
  sizeRow.appendChild(sizeInput);
  sizeRow.appendChild(sizeReadout);
  body.appendChild(sizeRow);
}

function renderShape(shape) {
  const heading = document.createElement('div');
  heading.className = 'ins-heading';
  const kindLabel = shape.type === 'zone' && shape.kind && shape.kind !== 'polygon'
    ? ` (${shape.kind})` : '';
  heading.textContent = shape.type.charAt(0).toUpperCase() + shape.type.slice(1) + kindLabel;
  body.appendChild(heading);

  if (shape.type !== 'text') {
    const row = document.createElement('div');
    row.className = 'ins-row';
    const label = document.createElement('span');
    label.className = 'ins-label';
    label.textContent = 'Colour';
    row.appendChild(label);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = shape.color || '#ffb347';
    input.style.cssText = 'width:36px; height:26px; border:none; background:transparent; cursor:pointer; padding:0;';
    input.addEventListener('input', () => {
      updateShape(shape.id, { color: input.value });
    });
    row.appendChild(input);
    body.appendChild(row);
  }

  if (shape.type === 'arrow') {
    const roleRow = document.createElement('div');
    roleRow.className = 'ins-row';
    const rl = document.createElement('span');
    rl.className = 'ins-label';
    rl.textContent = 'Role';
    roleRow.appendChild(rl);
    const roleSel = document.createElement('select');
    roleSel.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
    for (const opt of [{ v: '', t: 'custom' }, { v: 'pass', t: 'Pass' }, { v: 'shot', t: 'Shot' }, { v: 'run', t: 'Run' }]) {
      const o = document.createElement('option');
      o.value = opt.v; o.textContent = opt.t;
      roleSel.appendChild(o);
    }
    roleSel.value = shape.role || '';
    roleSel.addEventListener('change', () => {
      const role = roleSel.value || undefined;
      const patch = { role };
      const roleColor = role ? arrowRoleColor(role) : null;
      if (roleColor) patch.color = roleColor;
      updateShape(shape.id, patch);
    });
    roleRow.appendChild(roleSel);
    body.appendChild(roleRow);

    const labelRow = document.createElement('div');
    labelRow.className = 'ins-row';
    const ll = document.createElement('span');
    ll.className = 'ins-label';
    ll.textContent = 'Label';
    labelRow.appendChild(ll);
    const li = document.createElement('input');
    li.type = 'text';
    li.placeholder = 'e.g. Pass';
    li.value = shape.label || '';
    li.maxLength = 40;
    li.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
    li.addEventListener('input', () => {
      updateShapeLabel(shape.id, li.value);
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') li.blur();
      e.stopPropagation();
    });
    labelRow.appendChild(li);
    body.appendChild(labelRow);

    const row = document.createElement('div');
    row.className = 'ins-row';
    const label = document.createElement('span');
    label.className = 'ins-label';
    label.textContent = 'Width';
    row.appendChild(label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '20'; input.max = '240'; input.step = '10';
    input.value = String(shape.width ?? 80);
    input.style.cssText = 'flex:1;';
    input.addEventListener('input', () => {
      updateShape(shape.id, { width: parseInt(input.value, 10) });
    });
    row.appendChild(input);
    body.appendChild(row);

    const shaftRow = document.createElement('div');
    shaftRow.className = 'ins-row';
    const shaftL = document.createElement('span');
    shaftL.className = 'ins-label';
    shaftL.textContent = 'Shaft';
    shaftRow.appendChild(shaftL);
    const shaftSel = document.createElement('select');
    shaftSel.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
    for (const opt of ['solid', 'dashed', 'dotted']) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      shaftSel.appendChild(o);
    }
    shaftSel.value = shape.shaftStyle || 'solid';
    shaftSel.addEventListener('change', () => {
      updateShape(shape.id, { shaftStyle: shaftSel.value });
    });
    shaftRow.appendChild(shaftSel);
    body.appendChild(shaftRow);

    const headRow = document.createElement('div');
    headRow.className = 'ins-row';
    const headL = document.createElement('span');
    headL.className = 'ins-label';
    headL.textContent = 'Head';
    headRow.appendChild(headL);
    const headSel = document.createElement('select');
    headSel.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
    for (const opt of ['filled', 'open', 'none']) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      headSel.appendChild(o);
    }
    headSel.value = shape.headStyle || 'filled';
    headSel.addEventListener('change', () => {
      updateShape(shape.id, { headStyle: headSel.value });
    });
    headRow.appendChild(headSel);
    body.appendChild(headRow);

    if ((shape.points?.length ?? 0) >= 3) {
      const smoothRow = document.createElement('div');
      smoothRow.className = 'ins-row';
      const smoothL = document.createElement('span');
      smoothL.className = 'ins-label';
      smoothL.textContent = 'Smooth';
      smoothRow.appendChild(smoothL);
      const smoothIn = document.createElement('input');
      smoothIn.type = 'checkbox';
      smoothIn.checked = shape.smooth !== false;
      smoothIn.addEventListener('change', () => {
        updateShape(shape.id, { smooth: smoothIn.checked });
      });
      smoothRow.appendChild(smoothIn);
      body.appendChild(smoothRow);
    }
  }

  if (shape.type === 'zone') {
    const labelRow = document.createElement('div');
    labelRow.className = 'ins-row';
    const ll = document.createElement('span');
    ll.className = 'ins-label';
    ll.textContent = 'Label';
    labelRow.appendChild(ll);
    const li = document.createElement('input');
    li.type = 'text';
    li.placeholder = 'e.g. Pocket';
    li.value = shape.label || '';
    li.maxLength = 40;
    li.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
    li.addEventListener('input', () => {
      updateShapeLabel(shape.id, li.value);
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') li.blur();
      e.stopPropagation();
    });
    labelRow.appendChild(li);
    body.appendChild(labelRow);

    const row = document.createElement('div');
    row.className = 'ins-row';
    const label = document.createElement('span');
    label.className = 'ins-label';
    label.textContent = 'Opacity';
    row.appendChild(label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0.05'; input.max = '0.8'; input.step = '0.05';
    input.value = String(shape.opacity ?? 0.3);
    input.style.cssText = 'flex:1;';
    input.addEventListener('input', () => {
      updateShape(shape.id, { opacity: parseFloat(input.value) });
    });
    row.appendChild(input);
    body.appendChild(row);

    if (shape.label && shape.label.trim()) {
      const sizeRow = document.createElement('div');
      sizeRow.className = 'ins-row';
      const sl = document.createElement('span');
      sl.className = 'ins-label';
      sl.textContent = 'Text size';
      sizeRow.appendChild(sl);
      const sInp = document.createElement('input');
      sInp.type = 'range';
      sInp.min = '0'; sInp.max = '8000'; sInp.step = '100';
      sInp.value = String(shape.labelSize ?? 0);
      sInp.title = '0 = auto-fit; drag to override';
      sInp.style.cssText = 'flex:1;';
      sInp.addEventListener('input', () => {
        const v = parseInt(sInp.value, 10);
        updateShape(shape.id, { labelSize: v > 0 ? v : undefined });
      });
      sizeRow.appendChild(sInp);
      body.appendChild(sizeRow);

      const rotRow = document.createElement('div');
      rotRow.className = 'ins-row';
      const rl = document.createElement('span');
      rl.className = 'ins-label';
      rl.textContent = 'Rotation';
      rotRow.appendChild(rl);
      const rotSel = document.createElement('select');
      rotSel.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
      for (const o of [{ v: 'auto', t: 'auto' }, { v: '0', t: '0°' }, { v: '90', t: '90°' }, { v: '-90', t: '-90°' }]) {
        const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.t;
        rotSel.appendChild(opt);
      }
      rotSel.value = shape.labelRotation === 0 ? '0'
        : shape.labelRotation === 90 ? '90'
        : shape.labelRotation === -90 ? '-90'
        : 'auto';
      rotSel.addEventListener('change', () => {
        const v = rotSel.value === 'auto' ? undefined : parseInt(rotSel.value, 10);
        updateShape(shape.id, { labelRotation: v });
      });
      rotRow.appendChild(rotSel);
      body.appendChild(rotRow);

      const boldRow = document.createElement('div');
      boldRow.className = 'ins-row';
      const bl = document.createElement('span');
      bl.className = 'ins-label';
      bl.textContent = 'Bold';
      boldRow.appendChild(bl);
      const boldIn = document.createElement('input');
      boldIn.type = 'checkbox';
      boldIn.checked = shape.labelBold !== false;
      boldIn.addEventListener('change', () => {
        updateShape(shape.id, { labelBold: boldIn.checked });
      });
      boldRow.appendChild(boldIn);
      body.appendChild(boldRow);
    }
  }

  if (shape.type === 'text' && shape.text != null) {
    const row = document.createElement('div');
    row.className = 'ins-row';
    const label = document.createElement('span');
    label.className = 'ins-label';
    label.textContent = 'Text';
    row.appendChild(label);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = shape.text || '';
    input.style.cssText = 'flex:1; background:rgba(79,224,255,0.08); border:1px solid rgba(79,224,255,0.35); color:#dff9ff; padding:3px 6px; font-family:inherit; font-size:11px;';
    input.addEventListener('change', () => {
      updateShape(shape.id, { text: input.value });
    });
    row.appendChild(input);
    body.appendChild(row);

    const sizeRow = document.createElement('div');
    sizeRow.className = 'ins-row';
    const sl = document.createElement('span');
    sl.className = 'ins-label';
    sl.textContent = 'Size';
    sizeRow.appendChild(sl);
    const sizeIn = document.createElement('input');
    sizeIn.type = 'range';
    sizeIn.min = String(TEXT_MIN_SIZE);
    sizeIn.max = String(TEXT_MAX_SIZE);
    sizeIn.step = '50';
    sizeIn.value = String(shape.size || TEXT_DEFAULT_SIZE);
    sizeIn.style.flex = '1';
    sizeIn.addEventListener('input', () => {
      updateShape(shape.id, { size: Number(sizeIn.value) });
    });
    sizeRow.appendChild(sizeIn);
    body.appendChild(sizeRow);
  }

  const del = document.createElement('button');
  del.className = 'ins-btn danger';
  del.textContent = `Delete ${shape.type}`;
  del.addEventListener('click', () => {
    removeShape(shape.id);
    deselectAll();
  });
  body.appendChild(del);
}
