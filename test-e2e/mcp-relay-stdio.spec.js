// S-BACK-034: the relay as Claude Code runs it. mcp-bridge.spec.js covers
// every tool with the relay core inside this Node process; this spec starts
// scripts/mcp-relay/main.mjs as its own process and plays the MCP client
// over stdio, so it also covers main.mjs's wiring: the pairing code on
// stderr, newline-delimited JSON on stdout (a whole PNG on one line),
// the parse-error reply and the exit when the client closes stdin.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { test, expect, waitForAssets, waitUntil } from './fixtures.js';

const MAIN = fileURLToPath(new URL('../scripts/mcp-relay/main.mjs', import.meta.url));

// main.mjs treats --port 0 as "use the default", so ask the OS for a free
// port first. Keeps the run clear of a real relay on 8765.
async function freePort() {
  const srv = net.createServer().listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}

async function startRelayProcess() {
  const port = await freePort();
  const child = spawn(process.execPath, [MAIN, '--port', String(port)], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  const codeSeen = new Promise((resolve, reject) => {
    child.stderr.on('data', (s) => {
      stderr += s;
      const m = stderr.match(/pairing code (\S+)/);
      if (m) resolve(m[1]);
    });
    child.on('exit', (c) => reject(new Error(`relay exited (${c}) before printing a code: ${stderr}`)));
  });

  const inbox = [];
  const waiters = [];
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);   // anything else on stdout breaks the MCP client
      const w = waiters.find((x) => x.match(msg));
      if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); } else inbox.push(msg);
    }
  });
  const next = (match) => {
    const hit = inbox.find(match);
    if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((resolve) => waiters.push({ match, resolve }));
  };
  const write = (line) => child.stdin.write(line + '\n');
  let nextId = 1;
  const request = (method, params) => {
    const id = nextId++;
    const p = next((m) => m.id === id);
    write(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return p;
  };
  const call = async (name, args = {}) => (await request('tools/call', { name, arguments: args })).result;

  const code = await codeSeen;
  return { child, port, code, next, write, request, call, stderr: () => stderr };
}

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.goalies.A && !!state.goalies.B;
  });
}

test('the relay process pairs with the app over stdio and runs tools end to end', async ({ page }) => {
  const relay = await startRelayProcess();
  try {
    // A non-default port is part of the code the user types: CODE@port.
    expect(relay.code).toMatch(new RegExp(`^[A-Z0-9]{4}-[A-Z0-9]{4}@${relay.port}$`));

    const init = (await relay.request('initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' },
    })).result;
    relay.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(init.serverInfo.name).toBe('floorball-3d');
    expect(init.capabilities.tools.listChanged).toBe(true);
    expect(init.instructions).toContain(relay.code);

    // Not JSON: a JSON-RPC parse error on stdout, and the relay keeps going.
    const parseError = relay.next((m) => m.error?.code === -32700);
    relay.write('{not json');
    expect((await parseError).id).toBeNull();

    // Before pairing: no tools, and a call says how to pair.
    expect((await relay.request('tools/list')).result.tools).toEqual([]);
    const early = await relay.call('kata_read');
    expect(early.isError).toBe(true);
    expect(early.content[0].text).toContain(relay.code);

    await boot(page);
    const btn = page.locator('#appTopbar #aiBtn');
    const changed = relay.next((m) => m.method === 'notifications/tools/list_changed');
    await btn.click();
    const dialog = page.locator('dialog.app-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input').fill(relay.code);
    await dialog.locator('button[value="ok"]').click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await changed;

    const tools = (await relay.request('tools/list')).result.tools.map((t) => t.name).sort();
    expect(tools).toEqual(['goalie_place', 'kata_read', 'lesson_open', 'playback_seek', 'playback_stop', 'screenshot_take']);

    const opened = await relay.call('lesson_open', { key: 'zones' });
    expect(opened.isError).toBeUndefined();
    expect(await page.evaluate(() => document.body.dataset.mode)).toBe('train');

    const placed = await relay.call('goalie_place', { goal: 'A', x: -2500, z: 5200 });
    expect(placed.isError).toBeUndefined();
    expect(await page.evaluate(async () => {
      const g = (await import('/src/state.js')).state.goalies.A;
      return [g.position.x, g.position.z];
    })).toEqual([-2500, 5200]);

    // The largest message: a base64 PNG must arrive as one stdout line.
    const shot = await relay.call('screenshot_take', { clean: true });
    const png = shot.content.find((c) => c.type === 'image');
    expect(png.mimeType).toBe('image/png');
    expect(Buffer.from(png.data, 'base64').subarray(1, 4).toString()).toBe('PNG');

    // Disconnect in the app: the client is told and the tools go away.
    const gone = relay.next((m) => m.method === 'notifications/tools/list_changed');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await gone;
    expect((await relay.request('tools/list')).result.tools).toEqual([]);
    expect(relay.stderr()).toContain('app tab connected');

    // The client goes away: the relay exits on its own.
    const exited = once(relay.child, 'exit');
    relay.child.stdin.end();
    const [exitCode] = await exited;
    expect(exitCode).toBe(0);
  } finally {
    if (relay.child.exitCode === null) relay.child.kill();
  }
});
