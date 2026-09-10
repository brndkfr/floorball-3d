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
import { shapeDataFor, removeShape, updateShape, updateShapeLabel } from './shapes.js';

// Chip properties live in the chip-anchored popover (see chip-popover.js),
// not here; the Inspector still handles shapes / text / read-only labels.

const body = document.getElementById('inspectorBody');
if (body) {
  onSelectionChanged(render);
  render(state.selected);
}

function render(sel) {
  body.innerHTML = '';
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

  // Ball / goalie / goal / other: read-only label.
  const heading = document.createElement('div');
  heading.className = 'ins-heading';
  heading.textContent = labelFor(sel);
  body.appendChild(heading);
  const empty = document.createElement('div');
  empty.className = 'ins-empty';
  empty.textContent = 'No editable properties.';
  body.appendChild(empty);
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
