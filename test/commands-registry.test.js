// S-BACK-033: the command layer's registry. Commands are named actions
// with a JSON-schema input, run by the same code as the UI; listCommands()
// is what the MCP server (S-BACK-034) will offer as tools/list.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createRegistry, validateInput } = await import('../web/src/commands/registry.js');

const goalSchema = {
  type: 'object',
  properties: {
    goal: { type: 'string', enum: ['A', 'B'] },
    x: { type: 'number', minimum: -20000, maximum: 20000 },
    n: { type: 'integer' },
    on: { type: 'boolean' },
  },
  required: ['goal', 'x'],
  additionalProperties: false,
};

test('validateInput: accepts good input, names the field that is wrong', () => {
  assert.deepEqual(validateInput(goalSchema, { goal: 'A', x: 10 }), []);
  assert.match(validateInput(goalSchema, { x: 1 })[0], /goal.*required/);
  assert.match(validateInput(goalSchema, { goal: 'C', x: 1 })[0], /goal: "C" is not one of A, B/);
  assert.match(validateInput(goalSchema, { goal: 'A', x: 'far' })[0], /x.*number/);
  assert.match(validateInput(goalSchema, { goal: 'A', x: 30000 })[0], /x.*at most 20000/);
  assert.match(validateInput(goalSchema, { goal: 'A', x: -30000 })[0], /x.*at least -20000/);
  assert.match(validateInput(goalSchema, { goal: 'A', x: 1, n: 1.5 })[0], /n.*integer/);
  assert.match(validateInput(goalSchema, { goal: 'A', x: 1, on: 'yes' })[0], /on.*boolean/);
  assert.match(validateInput(goalSchema, { goal: 'A', x: 1, y: 2 })[0], /y.*not allowed/);
  assert.match(validateInput(goalSchema, [])[0], /object/);
  assert.match(validateInput(goalSchema, null)[0], /object/);
  assert.match(validateInput(goalSchema, { goal: 'A', x: NaN })[0], /x.*number/);
});

test('defineCommand + listCommands: name, description and input schema, in definition order', () => {
  const r = createRegistry();
  r.defineCommand({ name: 'goalie.place', description: 'Place a goalie', input: goalSchema, run: () => 1 });
  r.defineCommand({ name: 'kata.read', description: 'Read KATA', run: () => 2 });
  const list = r.listCommands();
  assert.deepEqual(list.map((c) => c.name), ['goalie.place', 'kata.read']);
  assert.equal(list[0].description, 'Place a goalie');
  assert.deepEqual(list[0].input, goalSchema);
  assert.deepEqual(list[1].input, { type: 'object', properties: {}, additionalProperties: false }, 'no input means an empty object');
  assert.equal('run' in list[0], false, 'handlers stay private');
});

test('defineCommand: rejects bad definitions and duplicate names', () => {
  const r = createRegistry();
  r.defineCommand({ name: 'a.b', description: 'x', run() {} });
  assert.throws(() => r.defineCommand({ name: 'a.b', description: 'x', run() {} }), /already defined/);
  assert.throws(() => r.defineCommand({ name: 'Bad Name', description: 'x', run() {} }), /name/);
  assert.throws(() => r.defineCommand({ name: 'a.c', run() {} }), /description/);
  assert.throws(() => r.defineCommand({ name: 'a.d', description: 'x' }), /run/);
});

test('runCommand: runs the handler with validated input and resolves to ok + result', async () => {
  const r = createRegistry();
  let got;
  r.defineCommand({ name: 'goalie.place', description: 'x', input: goalSchema, run: async (input) => { got = input; return { moved: true }; } });
  assert.deepEqual(await r.runCommand('goalie.place', { goal: 'B', x: 5 }), { ok: true, result: { moved: true } });
  assert.deepEqual(got, { goal: 'B', x: 5 });
  r.defineCommand({ name: 'kata.read', description: 'x', run: (input) => input });
  assert.deepEqual(await r.runCommand('kata.read'), { ok: true, result: {} }, 'missing input is {}');
  r.defineCommand({ name: 'void.cmd', description: 'x', run: () => undefined });
  assert.deepEqual(await r.runCommand('void.cmd', {}), { ok: true, result: null }, 'undefined result becomes null (JSON)');
});

test('runCommand: unknown name, bad input and a throwing handler are errors, never throws', async () => {
  const r = createRegistry();
  let ran = false;
  r.defineCommand({ name: 'goalie.place', description: 'x', input: goalSchema, run: () => { ran = true; } });
  r.defineCommand({ name: 'boom.now', description: 'x', run: () => { throw new Error('no goalie'); } });
  r.defineCommand({ name: 'boom.later', description: 'x', run: async () => { throw new Error('later'); } });
  const unknown = await r.runCommand('nope.cmd', {});
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /Unknown command "nope.cmd"/);
  const bad = await r.runCommand('goalie.place', { goal: 'C' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /goal.*one of A, B/);
  assert.match(bad.error, /x.*required/, 'all problems listed');
  assert.equal(ran, false, 'handler not run on bad input');
  assert.deepEqual(await r.runCommand('boom.now'), { ok: false, error: 'boom.now: no goalie' });
  assert.deepEqual(await r.runCommand('boom.later'), { ok: false, error: 'boom.later: later' });
});
