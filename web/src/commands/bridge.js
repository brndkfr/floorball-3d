// "Connect AI" (S-BACK-034): an outgoing WebSocket from this tab to the
// local MCP relay (scripts/mcp-relay/), which an MCP client such as Claude
// Code starts. Off until the user connects with the relay's pairing code;
// nothing is kept, so a reload or a closed tab ends it. Loaded on demand by
// the top bar button (ui/ai-connect.js), never imported statically, so the
// deployed site opens no connection unless the user asks for one.
// Requests are run one at a time, in order, on the command registry.

import { commands } from './registry.js';
import { createMcpHandler } from './mcp-server.js';

const handle = createMcpHandler(commands);
let socket = null;
let status = 'off';   // 'off' | 'connecting' | 'on'
let queue = Promise.resolve();

const CLOSE_REASONS = {
  4000: 'The relay did not get a pairing code.',
  4001: 'Wrong pairing code.',
  4002: 'Another tab connected to the relay.',
  4003: 'Too many wrong codes: restart the relay (Claude Code: /mcp, reconnect).',
};

function setStatus(next, reason = '') {
  status = next;
  window.dispatchEvent(new CustomEvent('aiBridgeChanged', { detail: { status, reason } }));
}

export const bridgeStatus = () => status;

// Resolves once the relay accepted the code; rejects with a message to show.
export function connectBridge({ port, code }) {
  if (socket) disconnectBridge();
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch (e) {
      reject(new Error(`Could not open ws://127.0.0.1:${port}: ${e.message}`));
      return;
    }
    socket = ws;
    let welcomed = false;
    setStatus('connecting');

    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', code })));
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!welcomed) {
        if (msg?.type !== 'welcome') return;
        welcomed = true;
        setStatus('on');
        resolve();
        return;
      }
      queue = queue.then(async () => {
        const res = await handle(msg);
        if (res && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(res));
      }).catch((e) => console.warn('ai bridge: request failed', e));
    });
    ws.addEventListener('close', (ev) => {
      if (socket === ws) socket = null;
      const reason = CLOSE_REASONS[ev.code] || (welcomed ? 'The relay closed the connection.' : `No relay on port ${port}. Is the MCP server running?`);
      if (!welcomed) reject(new Error(reason));
      if (socket === null) setStatus('off', ev.code === 1000 ? '' : reason);
    });
  });
}

export function disconnectBridge() {
  const ws = socket;
  socket = null;
  if (ws) ws.close(1000, 'disconnected in the app');
  setStatus('off');
}
