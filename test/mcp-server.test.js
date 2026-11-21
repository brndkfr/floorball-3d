// S-BACK-034: the MCP server in the app. tools/list is generated from the
// command registry, tools/call runs a command and turns its result into MCP
// content (an image block for results carrying a PNG data URL). Pure: the
// WebSocket side (bridge.js) only moves these messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { createRegistry } = await import('../web/src/commands/registry.js');
const { toolName, commandName, toolList, toolResult, createMcpHandler, parsePairing, DEFAULT_RELAY_PORT } =
  await import('../web/src/commands/mcp-server.js');

function registry() {
  const r = createRegistry();
  r.defineCommand({
    name: 'lesson.open',
    description: 'Open a lesson.',
    input: { type: 'object', properties: { key: { type: 'string', enum: ['zones'] } }, required: ['key'], additionalProperties: false },
    run: ({ key }) => ({ key, frames: 3 }),
  });
  r.defineCommand({ name: 'playback.stop', description: 'Stop playback.', run: () => undefined });
  r.defineCommand({ name: 'kata.read', description: 'Read KATA.', run: () => { throw new Error('needs Train mode'); } });
  r.defineCommand({
    name: 'screenshot.take',
    description: 'A PNG.',
    run: () => ({ mimeType: 'image/png', width: 2, height: 1, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
  });
  return r;
}

test('tool names swap the dot for an underscore and back (API tool names allow no dot)', () => {
  assert.equal(toolName('lesson.open'), 'lesson_open');
  assert.equal(toolName('screenshot.take'), 'screenshot_take');
  assert.equal(commandName('lesson_open'), 'lesson.open');
  for (const n of ['lesson.open', 'goalie.place', 'playback.seek', 'kata.read']) assert.equal(commandName(toolName(n)), n);
  for (const t of toolList(registry())) assert.match(t.name, /^[a-zA-Z0-9_-]{1,64}$/);
});

test('toolList comes from listCommands, with the input schema as inputSchema', () => {
  const r = registry();
  const tools = toolList(r);
  assert.deepEqual(tools.map((t) => t.name), ['lesson_open', 'playback_stop', 'kata_read', 'screenshot_take']);
  const open = tools[0];
  assert.equal(open.description, 'Open a lesson.');
  assert.deepEqual(open.inputSchema, r.listCommands()[0].input);
  assert.equal(tools[1].inputSchema.type, 'object');   // a command without input still has an object schema
  // A command defined later shows up without any MCP change.
  r.defineCommand({ name: 'camera.preset', description: 'Pick a view.', run: () => null });
  assert.ok(toolList(r).some((t) => t.name === 'camera_preset'));
});

test('toolResult: data as JSON text, errors as isError, PNG data URLs as an image block', () => {
  assert.deepEqual(toolResult({ ok: true, result: { key: 'zones', frames: 3 } }), {
    content: [{ type: 'text', text: '{"key":"zones","frames":3}' }],
  });
  assert.deepEqual(toolResult({ ok: true, result: null }), { content: [{ type: 'text', text: 'null' }] });
  assert.deepEqual(toolResult({ ok: false, error: 'kata.read: needs Train mode' }), {
    isError: true,
    content: [{ type: 'text', text: 'kata.read: needs Train mode' }],
  });
  const img = toolResult({ ok: true, result: { mimeType: 'image/png', width: 2, height: 1, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.deepEqual(img.content[0], { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' });
  assert.deepEqual(JSON.parse(img.content[1].text), { mimeType: 'image/png', width: 2, height: 1 });
  assert.equal(img.isError, undefined);
});

test('the handler answers tools/list and tools/call as JSON-RPC', async () => {
  const handle = createMcpHandler(registry());
  const list = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(list.id, 1);
  assert.equal(list.jsonrpc, '2.0');
  assert.equal(list.result.tools.length, 4);

  const call = await handle({ jsonrpc: '2.0', id: 'a', method: 'tools/call', params: { name: 'lesson_open', arguments: { key: 'zones' } } });
  assert.deepEqual(call, { jsonrpc: '2.0', id: 'a', result: { content: [{ type: 'text', text: '{"key":"zones","frames":3}' }] } });

  const noArgs = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'playback_stop' } });
  assert.deepEqual(noArgs.result.content, [{ type: 'text', text: 'null' }]);

  const bad = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lesson_open', arguments: { key: 'nope' } } });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /nope/);

  const thrown = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'kata_read', arguments: {} } });
  assert.equal(thrown.result.isError, true);
  assert.match(thrown.result.content[0].text, /Train/);

  const shot = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'screenshot_take', arguments: {} } });
  assert.equal(shot.result.content[0].type, 'image');
});

test('the handler rejects unknown tools and methods with JSON-RPC errors; notifications get no answer', async () => {
  const handle = createMcpHandler(registry());
  const unknown = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'rink_delete', arguments: {} } });
  assert.equal(unknown.error.code, -32602);
  assert.match(unknown.error.message, /rink_delete/);
  const noName = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} });
  assert.equal(noName.error.code, -32602);
  const method = await handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
  assert.equal(method.error.code, -32601);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {} }), null);
});

test('parsePairing reads the code the relay shows, with an optional @port', () => {
  assert.equal(DEFAULT_RELAY_PORT, 8765);
  assert.deepEqual(parsePairing('ABCD-EFGH'), { code: 'ABCDEFGH', port: 8765 });
  assert.deepEqual(parsePairing('  abcd efgh '), { code: 'ABCDEFGH', port: 8765 });
  assert.deepEqual(parsePairing('abcdefgh@8766'), { code: 'ABCDEFGH', port: 8766 });
  assert.deepEqual(parsePairing('ABCD-EFGH @ 9001'), { code: 'ABCDEFGH', port: 9001 });
  for (const bad of ['', 'ABC', 'ABCD-EFGH-IJ', 'ABCD-EFG!', 'ABCD-EFGH@80', 'ABCD-EFGH@70000', null]) {
    assert.equal(parsePairing(bad), null, String(bad));
  }
});

// Security: the deployed site must not open connections unless the user
// turns the bridge on. Only bridge.js may create a WebSocket, and nothing
// imports it statically (the top bar button loads it on the first click).
test('only commands/bridge.js opens a WebSocket, and it is only loaded on demand', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'src');
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.js')) files.push(p);
    }
  })(src);
  const sockets = files.filter((f) => /new\s+WebSocket\s*\(/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(sockets.map((f) => f.slice(src.length + 1).replace(/\\/g, '/')), ['commands/bridge.js']);
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /^\s*import\s[^(]*['"][^'"]*bridge\.js['"]/m, `${f} imports bridge.js statically`);
    assert.doesNotMatch(text, /fetch\(\s*['"`]https?:\/\/(127\.0\.0\.1|localhost)/, `${f} reaches localhost`);
  }
});
