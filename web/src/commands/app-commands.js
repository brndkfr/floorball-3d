// The app's commands (S-BACK-033), first slice. Each handler calls the
// code the UI uses for the same action, so a command and a click cannot
// drift apart. Registered on the shared registry at import time
// (authoring/index.js); the MCP server (S-BACK-034) will serve them.

import { commands } from './registry.js';
import { state, getBallWorldCenter } from '../state.js';
import { RINK_L, HALF_W } from '../constants.js';
import { LESSON_KEYS, lessonShelf } from '../goalie-lessons.js';
import { openLesson } from '../authoring/train-mode.js';
import { seekTo, stop, playbackState, totalDuration } from '../authoring/playback.js';
import { tickActors } from '../authoring/actors.js';
import { applySelectionVisuals } from '../selection.js';
import { updateGoalieZones } from '../goalie-zones-layer.js';
import { updateKataReadout } from '../kata-readout.js';
import { captureStage } from '../screenshot.js';
import { markRenderDirty } from '../render-dirty.js';

const { defineCommand } = commands;
const MM_X = { type: 'number', minimum: -RINK_L / 2, maximum: RINK_L / 2 };
const MM_Z = { type: 'number', minimum: -HALF_W, maximum: HALF_W };

defineCommand({
  name: 'lesson.open',
  description: 'Open a shipped goalie lesson in Train mode (enters Train if needed). Returns its title and frame count.',
  input: {
    type: 'object',
    properties: { key: { type: 'string', enum: [...LESSON_KEYS] } },
    required: ['key'],
    additionalProperties: false,
  },
  run({ key }) {
    if (!openLesson(key)) throw new Error(`no lesson "${key}"`);
    const row = lessonShelf(state.lang).find((l) => l.key === key);
    return { key, title: row?.title ?? key, frames: state.doc.frames.length };
  },
});

defineCommand({
  name: 'goalie.place',
  description: 'Place goalie A or B on the rink (millimetres, rink centre is 0,0; angle in radians) in the current frame, like dragging it.',
  input: {
    type: 'object',
    properties: { goal: { type: 'string', enum: ['A', 'B'] }, x: MM_X, z: MM_Z, angle: { type: 'number' } },
    required: ['goal', 'x', 'z'],
    additionalProperties: false,
  },
  run({ goal, x, z, angle }) {
    const g = state.goalies[goal];
    if (!g) throw new Error(`goalie ${goal} is not loaded`);
    const pb = playbackState();
    if (pb.playing || pb.previewing) stop();   // edit the frame, not a playback pose (as a click on the 2D rink does)
    g.position.x = x;
    g.position.z = z;
    if (angle !== undefined) g.rotation.y = angle;
    tickActors();   // writes the mesh into the doc, as after a drag
    applySelectionVisuals();
    updateGoalieZones(getBallWorldCenter());
    updateKataReadout();
    markRenderDirty();
    return { goal, x: g.position.x, z: g.position.z, angle: g.rotation.y };
  },
});

defineCommand({
  name: 'playback.seek',
  description: 'Show the play at a time in milliseconds from its start (a preview pose; playback.stop returns to the edit frame).',
  input: {
    type: 'object',
    properties: { ms: { type: 'number', minimum: 0 } },
    required: ['ms'],
    additionalProperties: false,
  },
  run({ ms }) {
    const total = totalDuration();
    seekTo(Math.min(ms, total));
    window.dispatchEvent(new Event('playbackChanged'));
    markRenderDirty();
    return { elapsed: playbackState().elapsed, total };
  },
});

defineCommand({
  name: 'playback.stop',
  description: 'Stop playback and go back to the frame being edited.',
  run() {
    stop();
    markRenderDirty();
    return { elapsed: playbackState().elapsed };
  },
});

defineCommand({
  name: 'kata.read',
  description: 'Read the KATA readout (Train mode): zone, expected action, placement / depth / axis against the targets, coverage %.',
  run() {
    if (document.body.dataset.mode !== 'train') throw new Error('needs Train mode (open a lesson or enter Train first)');
    updateGoalieZones(getBallWorldCenter());
    updateKataReadout();
    const r = state.kataReadout;
    if (!r) throw new Error('no readout: the ball is not in a goalie zone');
    return JSON.parse(JSON.stringify(r));
  },
});

defineCommand({
  name: 'screenshot.take',
  description: 'A PNG of the visible stage as a base64 data URL; clean leaves out the labels.',
  input: {
    type: 'object',
    properties: { clean: { type: 'boolean' } },
    additionalProperties: false,
  },
  async run({ clean = false }) {
    const canvas = await captureStage({ clean });
    return { mimeType: 'image/png', width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL('image/png') };
  },
});
