// A-BACK-044: collapsible side panel, foldable sections and timeline, and
// Present mode. Pure state (three-free, DOM-free); ui/panels.js applies it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PANEL_STATE, SECTIONS, PRESENT_HIDES, PANEL_STRIP_PX,
  parsePanelState, togglePanel, toggleFold, toggleTimeline, openAt,
} from '../web/src/ui/panel-layout.js';

test('defaults: panel open, timeline open, only Coordinates folded', () => {
  assert.equal(DEFAULT_PANEL_STATE.panel, 'open');
  assert.equal(DEFAULT_PANEL_STATE.timeline, 'open');
  assert.deepEqual(SECTIONS, ['inspector', 'layersPanel', 'viewPanel', 'coords']);
  for (const id of SECTIONS) assert.equal(DEFAULT_PANEL_STATE.folded[id], id === 'coords');
  assert.equal(PANEL_STRIP_PX, 40);
});

test('parsePanelState: missing, broken or foreign values give the defaults', () => {
  for (const raw of [null, '', 'nope', '{"panel":"wide"}', '[]', '42']) {
    assert.deepEqual(parsePanelState(raw), DEFAULT_PANEL_STATE, String(raw));
  }
});

test('parsePanelState keeps the valid parts of a stored state', () => {
  const s = parsePanelState(JSON.stringify({
    panel: 'strip', timeline: 'bar', folded: { viewPanel: true, coords: false, bogus: true, inspector: 'yes' },
  }));
  assert.equal(s.panel, 'strip');
  assert.equal(s.timeline, 'bar');
  assert.equal(s.folded.viewPanel, true);
  assert.equal(s.folded.coords, false);
  assert.equal(s.folded.inspector, false);   // not a boolean: default
  assert.ok(!('bogus' in s.folded));
});

test('togglePanel, toggleFold and toggleTimeline flip one thing and leave the rest', () => {
  const a = togglePanel(DEFAULT_PANEL_STATE);
  assert.equal(a.panel, 'strip');
  assert.equal(togglePanel(a).panel, 'open');
  assert.deepEqual(a.folded, DEFAULT_PANEL_STATE.folded);
  const b = toggleFold(DEFAULT_PANEL_STATE, 'viewPanel');
  assert.equal(b.folded.viewPanel, true);
  assert.equal(b.panel, 'open');
  assert.equal(toggleFold(DEFAULT_PANEL_STATE, 'nope'), DEFAULT_PANEL_STATE);
  assert.equal(toggleTimeline(DEFAULT_PANEL_STATE).timeline, 'bar');
  assert.equal(DEFAULT_PANEL_STATE.panel, 'open', 'no mutation');
});

test('openAt opens the panel at one section and unfolds it, the rest keep their fold', () => {
  const strip = { ...togglePanel(DEFAULT_PANEL_STATE), folded: { ...DEFAULT_PANEL_STATE.folded, viewPanel: true } };
  const s = openAt(strip, 'viewPanel');
  assert.equal(s.panel, 'open');
  assert.equal(s.folded.viewPanel, false);
  assert.equal(s.folded.coords, true);
});

test('Present hides every shell root around the stage', () => {
  for (const id of ['appRail', 'appTopbar', 'rightPanel', 'toolPalette', 'dock', 'dockStatus', 'timeline']) {
    assert.ok(PRESENT_HIDES.includes(id), id);
  }
});
