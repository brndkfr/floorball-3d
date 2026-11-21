// S-BACK-034: the app tab as an MCP server through the local relay. The
// relay core and its WebSocket endpoint run in this Node process on a free
// port; the test plays the MCP client (Claude Code) against it, the page
// connects with the top bar "Connect AI" button and the pairing code.

import { once } from 'node:events';
import { test, expect, waitForAssets, waitUntil } from './fixtures.js';
import { createRelay } from '../scripts/mcp-relay/relay.mjs';
import { createBridgeServer } from '../scripts/mcp-relay/server.mjs';

const CODE = 'TEST-2345';

async function startRelay() {
  const out = [];
  const waiters = [];
  const relay = createRelay({
    code: CODE, port: 0, timeoutMs: 20_000,
    send: (m) => { out.push(m); for (const w of [...waiters]) if (w.match(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } },
  });
  const server = createBridgeServer({ relay, port: 0 });
  await once(server, 'listening');
  const port = server.address().port;
  relay.setPort(port);
  let nextId = 1;
  const next = (match) => {
    const hit = out.find(match);
    if (hit) { out.splice(out.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((resolve) => waiters.push({ match, resolve }));
  };
  const request = (method, params) => {
    const id = nextId++;
    const p = next((m) => m.id === id);
    relay.onClientMessage({ jsonrpc: '2.0', id, method, params });
    return p;
  };
  const call = async (name, args = {}) => (await request('tools/call', { name, arguments: args })).result;
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  relay.onClientMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return { port, request, call, next, close: () => server.close() };
}

async function boot(page) {
  await page.goto('/', { waitUntil: 'load' });
  await waitForAssets(page);
  await page.waitForFunction(() => document.getElementById('dockProjectName')?.textContent?.length > 0);
  await waitUntil(page, async () => {
    const { state } = await import('/src/state.js');
    return !!state.ballGroup && !!state.goalies.A && !!state.goalies.B;
  });
}

async function pair(page, text) {
  await page.locator('#aiBtn').click();
  const dialog = page.locator('dialog.app-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input').fill(text);
  await dialog.locator('button[value="ok"]').click();
}

test('Connect AI pairs the tab; the MCP client opens a lesson, places the goalie, reads KATA, takes a screenshot', async ({ page }) => {
  const relay = await startRelay();
  try {
    await boot(page);
    const btn = page.locator('#appTopbar #aiBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    // Nothing connects before the user asks.
    expect((await relay.request('tools/list')).result.tools).toEqual([]);

    const changed = relay.next((m) => m.method === 'notifications/tools/list_changed');
    await pair(page, `${CODE}@${relay.port}`);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await changed;

    const tools = (await relay.request('tools/list')).result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['goalie_place', 'kata_read', 'lesson_open', 'playback_seek', 'playback_stop', 'screenshot_take']);
    expect(tools.find((t) => t.name === 'lesson_open').inputSchema.required).toEqual(['key']);

    const opened = await relay.call('lesson_open', { key: 'zones' });
    expect(opened.isError).toBeUndefined();
    expect(JSON.parse(opened.content[0].text).frames).toBeGreaterThan(2);
    expect(await page.evaluate(() => document.body.dataset.mode)).toBe('train');

    const placed = await relay.call('goalie_place', { goal: 'A', x: -17000, z: 600 });
    expect(JSON.parse(placed.content[0].text)).toMatchObject({ goal: 'A', x: -17000, z: 600 });

    const kata = await relay.call('kata_read');
    expect(kata.isError).toBeUndefined();
    const readout = JSON.parse(kata.content[0].text);
    expect(['A', 'B']).toContain(readout.goal);
    expect(typeof readout.zone).toBe('string');

    const shot = await relay.call('screenshot_take', { clean: true });
    expect(shot.content[0].type).toBe('image');
    expect(shot.content[0].mimeType).toBe('image/png');
    expect(Buffer.from(shot.content[0].data, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(JSON.parse(shot.content[1].text).width).toBeGreaterThan(100);

    const bad = await relay.call('lesson_open', { key: 'nope' });
    expect(bad.isError).toBe(true);

    // Disconnect in the app: the tools go away.
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await relay.request('tools/list')).result.tools.length).toBe(0);
  } finally {
    relay.close();
  }
});

test('a wrong pairing code is refused and the tab stays disconnected', async ({ page }) => {
  const relay = await startRelay();
  try {
    await boot(page);
    await pair(page, `ZZZZ-ZZZZ@${relay.port}`);
    const alert = page.locator('dialog.app-dialog');
    await expect(alert).toContainText('Wrong pairing code');
    await alert.locator('button[value="ok"]').click();
    await expect(page.locator('#aiBtn')).toHaveAttribute('aria-pressed', 'false');
    expect((await relay.request('tools/list')).result.tools).toEqual([]);
  } finally {
    relay.close();
  }
});
