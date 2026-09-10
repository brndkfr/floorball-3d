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
import { shapeDataFor, removeShape, updateShape } from './shapes.js';

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
  heading.textContent = shape.type.charAt(0).toUpperCase() + shape.type.slice(1);
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
