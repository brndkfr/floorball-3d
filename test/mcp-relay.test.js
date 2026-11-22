// S-BACK-034: the local MCP relay (scripts/mcp-relay/). stdio MCP to the
// client (Claude Code), a WebSocket on 127.0.0.1 to the app tab. Tested
// here: WebSocket framing and handshake, stdio line framing, origin / host /
// pairing checks, and the relay core (lifecycle, forwarding, list_changed),
// plus one run over a real socket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';

const ws = await import('../scripts/mcp-relay/ws.mjs');
const { createRelay, generateCode, normalizeCode, createLineReader } = await import('../scripts/mcp-relay/relay.mjs');
const { createBridgeServer } = await import('../scripts/mcp-relay/server.mjs');

const MASK = Buffer.from([1, 2, 3, 4]);

test('acceptKey matches the RFC 6455 example', () => {
  assert.equal(ws.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('frames round-trip for all three length encodings, masked and split into chunks', () => {
  for (const len of [0, 5, 125, 126, 1000, 65535, 65536, 200000]) {
    const text = 'x'.repeat(len);
    const frame = ws.encodeFrame(ws.OP.TEXT, text, { mask: MASK });
    const dec = ws.createFrameDecoder({ maxPayload: 1 << 20 });
    const events = [];
    for (let i = 0; i < frame.length; i += 7000) events.push(...dec.push(frame.subarray(i, i + 7000)));
    assert.deepEqual(events, [{ type: 'message', data: text }], `len ${len}`);
  }
  // Server frames are unmasked; a client-side decoder reads them.
  const out = ws.encodeFrame(ws.OP.TEXT, 'hi');
  assert.equal(out[1] & 0x80, 0);
  assert.deepEqual(ws.createFrameDecoder({ requireMask: false }).push(out), [{ type: 'message', data: 'hi' }]);
});

test('the decoder joins fragments, answers control frames in between and reads close', () => {
  const dec = ws.createFrameDecoder({ maxPayload: 100 });
  const first = ws.encodeFrame(ws.OP.TEXT, 'Hel', { mask: MASK, fin: false });
  const ping = ws.encodeFrame(ws.OP.PING, 'p', { mask: MASK });
  const last = ws.encodeFrame(ws.OP.CONT, 'lo', { mask: MASK });
  assert.deepEqual(dec.push(Buffer.concat([first, ping, last])), [{ type: 'ping', data: Buffer.from('p') }, { type: 'message', data: 'Hello' }]);
  const close = ws.encodeFrame(ws.OP.CLOSE, ws.closePayload(4001, 'bad code'), { mask: MASK });
  assert.deepEqual(dec.push(close), [{ type: 'close', code: 4001, reason: 'bad code' }]);
});

test('the decoder refuses unmasked client frames, binary, oversize and bad UTF-8', () => {
  const err = (fn) => { try { fn(); } catch (e) { return e.closeCode; } return null; };
  assert.equal(err(() => ws.createFrameDecoder().push(ws.encodeFrame(ws.OP.TEXT, 'x'))), 1002);
  assert.equal(err(() => ws.createFrameDecoder().push(ws.encodeFrame(ws.OP.BINARY, Buffer.from([1]), { mask: MASK }))), 1003);
  assert.equal(err(() => ws.createFrameDecoder({ maxPayload: 10 }).push(ws.encodeFrame(ws.OP.TEXT, 'x'.repeat(11), { mask: MASK }))), 1009);
  // Fragments count towards the limit too.
  const d = ws.createFrameDecoder({ maxPayload: 10 });
  d.push(ws.encodeFrame(ws.OP.TEXT, 'x'.repeat(6), { mask: MASK, fin: false }));
  assert.equal(err(() => d.push(ws.encodeFrame(ws.OP.CONT, 'x'.repeat(6), { mask: MASK }))), 1009);
  assert.equal(err(() => ws.createFrameDecoder().push(ws.encodeFrame(ws.OP.TEXT, Buffer.from([0xff, 0xfe]), { mask: MASK }))), 1007);
  // The length is checked from the header, before the payload arrives.
  const big = ws.encodeFrame(ws.OP.TEXT, 'x'.repeat(70000), { mask: MASK }).subarray(0, 14);
  assert.equal(err(() => ws.createFrameDecoder({ maxPayload: 1000 }).push(big)), 1009);
});

test('only the app origins and a loopback Host may open the socket', () => {
  for (const o of ['http://localhost:8000', 'http://127.0.0.1:8010', 'http://localhost', 'https://brndkfr.github.io']) assert.equal(ws.originAllowed(o), true, o);
  for (const o of [undefined, '', 'null', 'https://evil.example', 'http://localhost.evil.example:8000', 'https://brndkfr.github.io.evil.example',
    'http://brndkfr.github.io', 'https://evil.github.io', 'file://', 'http://192.168.1.5:8000', 'https://localhost:8000/x']) assert.equal(ws.originAllowed(o), false, String(o));
  assert.equal(ws.hostAllowed('127.0.0.1:8765', 8765), true);
  assert.equal(ws.hostAllowed('localhost:8765', 8765), true);
  assert.equal(ws.hostAllowed('evil.example:8765', 8765), false);   // DNS rebinding
  assert.equal(ws.hostAllowed('127.0.0.1:9999', 8765), false);
  assert.equal(ws.hostAllowed(undefined, 8765), false);
});

test('pairing codes: 8 characters from an unambiguous alphabet, shown as XXXX-XXXX', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const c = generateCode();
    assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    seen.add(c);
  }
  assert.ok(seen.size > 45);
  assert.equal(normalizeCode(' abcd-efgh '), 'ABCDEFGH');
});

test('the stdio line reader splits on newlines across chunks and skips blank lines', () => {
  const lines = [];
  const push = createLineReader((l) => lines.push(l));
  push('{"a":1}\n{"b"');
  push(':2}\r\n\n');
  push('{"c":3}');
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
  push('\n');
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}']);
});

// A relay core with captured client output and a fake page.
function harness(opts = {}) {
  const out = [];
  const relay = createRelay({ code: 'ABCD-EFGH', port: 8765, send: (m) => out.push(m), timeoutMs: 200, ...opts });
  const page = { sent: [], closed: null, send(m) { this.sent.push(m); }, close(code, reason) { this.closed = { code, reason }; } };
  return { relay, out, page };
}

test('initialize: tools capability with listChanged, instructions carry the pairing code', () => {
  const { relay, out } = harness();
  relay.onClientMessage({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  const r = out[0];
  assert.equal(r.id, 0);
  assert.equal(r.result.protocolVersion, '2025-06-18');
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: true } });
  assert.equal(typeof r.result.serverInfo.name, 'string');
  assert.match(r.result.instructions, /ABCD-EFGH/);
  assert.match(r.result.instructions, /Connect AI/);
  // An unknown version gets the relay's own.
  relay.onClientMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.match(out[1].result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(out[1].result.protocolVersion, '1999-01-01');
  relay.onClientMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
  relay.onClientMessage({ jsonrpc: '2.0', id: 2, method: 'ping' });
  assert.deepEqual(out[2], { jsonrpc: '2.0', id: 2, result: {} });
  relay.onClientMessage({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
  assert.equal(out[3].error.code, -32601);
});

test('without a tab: no tools, and a call explains how to connect', () => {
  const { relay, out } = harness();
  relay.onClientMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(out[0], { jsonrpc: '2.0', id: 1, result: { tools: [] } });
  relay.onClientMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'kata_read', arguments: {} } });
  assert.equal(out[1].result.isError, true);
  assert.match(out[1].result.content[0].text, /ABCD-EFGH/);
});

test('pairing: the right code is accepted, wrong codes are counted and lock pairing', () => {
  const { relay } = harness({ maxFailures: 3 });
  assert.equal(relay.checkCode('abcd efgh'), 'ok');
  assert.equal(relay.checkCode('WRONG-CODE'), 'bad');
  assert.equal(relay.checkCode(undefined), 'bad');
  assert.equal(relay.checkCode(''), 'locked');            // the 3rd failure locks pairing
  assert.equal(relay.checkCode('ABCD-EFGH'), 'locked');   // ... until the relay restarts, even for the right code
});

test('with a tab: tools/list and tools/call go to the page under relay ids and come back under the client ids', async () => {
  const { relay, out, page } = harness();
  relay.onClientMessage({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  relay.onClientMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
  relay.attachPage(page);
  assert.deepEqual(out.at(-1), { jsonrpc: '2.0', method: 'notifications/tools/list_changed' });

  relay.onClientMessage({ jsonrpc: '2.0', id: 'x', method: 'tools/call', params: { name: 'lesson_open', arguments: { key: 'zones' } } });
  const fwd = page.sent[0];
  assert.equal(fwd.method, 'tools/call');
  assert.deepEqual(fwd.params, { name: 'lesson_open', arguments: { key: 'zones' } });
  relay.onPageMessage(page, { jsonrpc: '2.0', id: fwd.id, result: { content: [{ type: 'text', text: 'ok' }] } });
  assert.deepEqual(out.at(-1), { jsonrpc: '2.0', id: 'x', result: { content: [{ type: 'text', text: 'ok' }] } });

  // A response for an unknown id, or from a stale page, is dropped.
  const n = out.length;
  relay.onPageMessage(page, { jsonrpc: '2.0', id: 999, result: {} });
  relay.onPageMessage({}, { jsonrpc: '2.0', id: fwd.id, result: {} });
  assert.equal(out.length, n);

  // Errors from the page pass through.
  relay.onClientMessage({ jsonrpc: '2.0', id: 7, method: 'tools/list' });
  relay.onPageMessage(page, { jsonrpc: '2.0', id: page.sent[1].id, error: { code: -32601, message: 'no' } });
  assert.deepEqual(out.at(-1), { jsonrpc: '2.0', id: 7, error: { code: -32601, message: 'no' } });
});

test('a tab that goes away fails its pending calls; a slow tab times out; a new tab replaces the old', async () => {
  const { relay, out, page } = harness({ timeoutMs: 50 });
  relay.onClientMessage({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} });
  relay.onClientMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
  relay.attachPage(page);
  relay.onClientMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kata_read' } });
  relay.detachPage(page);
  const failed = out.find((m) => m.id === 1);
  assert.equal(failed.result.isError, true);
  assert.match(failed.result.content[0].text, /disconnected/);
  assert.deepEqual(out.at(-1), { jsonrpc: '2.0', method: 'notifications/tools/list_changed' });

  relay.attachPage(page);
  relay.onClientMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'kata_read' } });
  await new Promise((r) => setTimeout(r, 120));
  const slow = out.find((m) => m.id === 2);
  assert.equal(slow.result.isError, true);
  assert.match(slow.result.content[0].text, /did not answer/);

  const other = { sent: [], send(m) { this.sent.push(m); }, close() {} };
  relay.attachPage(other);
  assert.equal(page.closed.code, 4002);
  relay.detachPage(page);   // the old tab's close event must not drop the new tab
  relay.onClientMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.equal(other.sent.length, 1);
});

test('list_changed is only sent after the client finished initializing', () => {
  const { relay, out, page } = harness();
  relay.attachPage(page);
  assert.equal(out.length, 0);
});

// ---- over a real socket ----

function upgrade(port, { origin = 'http://localhost:8000', host } = {}) {
  return new Promise((resolve) => {
    const headers = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' };
    if (origin) headers.Origin = origin;
    if (host) headers.Host = host;
    const req = http.request({ host: '127.0.0.1', port, headers });
    req.on('upgrade', (res, socket) => resolve({ status: res.statusCode, headers: res.headers, socket }));
    req.on('response', (res) => { res.resume(); resolve({ status: res.statusCode }); });
    req.on('error', (e) => resolve({ error: e }));
    req.end();
  });
}

function reader(socket) {
  const dec = ws.createFrameDecoder({ requireMask: false });
  const queue = [];
  let wake = null;
  socket.on('data', (c) => { queue.push(...dec.push(c)); wake?.(); });
  socket.on('close', () => { queue.push({ type: 'eof' }); wake?.(); });
  return async () => {
    while (!queue.length) await new Promise((r) => { wake = r; });
    wake = null;
    return queue.shift();
  };
}

const sendJson = (socket, obj) => socket.write(ws.encodeFrame(ws.OP.TEXT, JSON.stringify(obj), { mask: MASK }));

test('the bridge server: listens on 127.0.0.1, rejects foreign origins, checks the code, then relays', async () => {
  const out = [];
  const relay = createRelay({ code: 'ABCD-EFGH', port: 0, send: (m) => out.push(m), timeoutMs: 2000 });
  const server = createBridgeServer({ relay, port: 0, helloTimeoutMs: 500 });
  await once(server, 'listening');
  const { address, port } = server.address();
  assert.equal(address, '127.0.0.1');
  relay.setPort(port);
  try {
    const plain = await new Promise((resolve) => http.get({ host: '127.0.0.1', port }, (res) => { res.resume(); resolve(res.statusCode); }));
    assert.equal(plain, 426);

    assert.equal((await upgrade(port, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await upgrade(port, { origin: null })).status, 403);
    assert.equal((await upgrade(port, { host: 'evil.example:' + port })).status, 403);

    // Wrong code: closed with 4001.
    const bad = await upgrade(port);
    assert.equal(bad.status, 101);
    assert.equal(bad.headers['sec-websocket-accept'], 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
    const readBad = reader(bad.socket);
    sendJson(bad.socket, { type: 'hello', code: 'ZZZZ-ZZZZ' });
    assert.deepEqual(await readBad(), { type: 'close', code: 4001, reason: 'wrong pairing code' });

    // No hello in time: closed.
    const silent = await upgrade(port);
    const readSilent = reader(silent.socket);
    assert.equal((await readSilent()).code, 4000);

    // Right code: welcome, then requests arrive and answers go back to the client.
    relay.onClientMessage({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} });
    relay.onClientMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const good = await upgrade(port, { origin: 'https://brndkfr.github.io' });
    const read = reader(good.socket);
    sendJson(good.socket, { type: 'hello', code: 'abcd-efgh' });
    assert.deepEqual(await read(), { type: 'message', data: JSON.stringify({ type: 'welcome' }) });
    assert.equal(out.at(-1).method, 'notifications/tools/list_changed');
    relay.onClientMessage({ jsonrpc: '2.0', id: 5, method: 'tools/list' });
    const req = JSON.parse((await read()).data);
    assert.equal(req.method, 'tools/list');
    sendJson(good.socket, { jsonrpc: '2.0', id: req.id, result: { tools: [{ name: 'kata_read' }] } });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(out.at(-1), { jsonrpc: '2.0', id: 5, result: { tools: [{ name: 'kata_read' }] } });

    // Ping gets a pong; the tab closing detaches it.
    good.socket.write(ws.encodeFrame(ws.OP.PING, 'k', { mask: MASK }));
    assert.deepEqual(await read(), { type: 'pong' });
    good.socket.write(ws.encodeFrame(ws.OP.CLOSE, ws.closePayload(1000, ''), { mask: MASK }));
    assert.equal((await read()).type, 'close');
    await new Promise((r) => setTimeout(r, 50));
    relay.onClientMessage({ jsonrpc: '2.0', id: 6, method: 'tools/list' });
    assert.deepEqual(out.at(-1), { jsonrpc: '2.0', id: 6, result: { tools: [] } });
    for (const s of [bad.socket, silent.socket, good.socket]) s.destroy();
  } finally {
    server.close();
  }
});
