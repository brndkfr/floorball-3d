// The MCP relay core (S-BACK-034), transport-free so it is Node-testable.
// The client side (Claude Code over stdio) talks MCP to the relay; the
// relay answers the lifecycle itself (initialize, ping) and forwards
// tools/list and tools/call to the paired app tab, which runs them on its
// command registry (web/src/commands/mcp-server.js). No floorball logic
// here: the tools are whatever the tab lists.

import { randomInt, timingSafeEqual } from 'node:crypto';

export const RELAY_NAME = 'floorball-3d';
export const RELAY_VERSION = '0.1.0';
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST = '2025-06-18';

// 32 characters, without the 0/O and 1/I lookalikes; 8 of them = 40 bits.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(rand = randomInt) {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[rand(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const normalizeCode = (c) => (typeof c === 'string' ? c.replace(/[\s-]/g, '').toUpperCase() : '');

// Newline-delimited JSON on stdio (the MCP stdio transport): feed chunks,
// get complete non-empty lines.
export function createLineReader(onLine) {
  let rest = '';
  return (chunk) => {
    rest += chunk;
    let i;
    while ((i = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, i).replace(/\r$/, '');
      rest = rest.slice(i + 1);
      if (line.trim()) onLine(line);
    }
  };
}

// send(message): to the MCP client. The page connection passed to
// attachPage() has send(message) and close(code, reason).
export function createRelay({ code, port, send, log = () => {}, timeoutMs = 60_000, maxFailures = 10 }) {
  const want = Buffer.from(normalizeCode(code));
  let currentPort = port;
  let page = null;
  let initialized = false;
  let failures = 0;
  let nextId = 1;
  const pending = new Map();   // relay id -> { clientId, method, timer }

  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, c, message) => send({ jsonrpc: '2.0', id, error: { code: c, message } });
  const pairingHint = () => `In the floorball-3d app, click the "AI" button (Connect AI) in the top bar and enter the pairing code ${code}${currentPort === 8765 ? '' : `@${currentPort}`}.`;
  const toolError = (text) => ({ isError: true, content: [{ type: 'text', text }] });

  function instructions() {
    return [
      'Drives an open floorball-3d app tab (tactics board and goalie training) through the app\'s own commands.',
      'Tools appear once a tab is connected. ' + pairingHint(),
      "Tell the user this code if no tools are listed. Positions are millimetres: x across the rink (0 = centre line), z along it from 0 at goal A's end board; tool descriptions give the bounds.",
    ].join(' ');
  }

  function notifyToolsChanged() {
    if (initialized) send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
  }

  function settle(relayId, outcome) {
    const p = pending.get(relayId);
    if (!p) return;
    pending.delete(relayId);
    clearTimeout(p.timer);
    if (outcome.error) {
      if (p.method === 'tools/call') reply(p.clientId, toolError(outcome.error.message));
      else send({ jsonrpc: '2.0', id: p.clientId, error: outcome.error });
    } else {
      reply(p.clientId, outcome.result);
    }
  }

  function failPending(message) {
    for (const id of [...pending.keys()]) settle(id, { error: { code: -32603, message } });
  }

  function forward(msg) {
    const relayId = nextId++;
    const timer = setTimeout(() => settle(relayId, { error: { code: -32603, message: `The app tab did not answer within ${Math.round(timeoutMs / 1000)} s (is it visible?).` } }), timeoutMs);
    pending.set(relayId, { clientId: msg.id, method: msg.method, timer });
    page.send({ jsonrpc: '2.0', id: relayId, method: msg.method, params: msg.params });
  }

  return {
    instructions,
    setPort(p) { currentPort = p; },

    // 'ok' | 'bad' | 'locked'. After maxFailures wrong codes pairing stays
    // locked until the relay restarts (a local process guessing codes).
    checkCode(given) {
      if (failures >= maxFailures) return 'locked';
      const got = Buffer.from(normalizeCode(given));
      if (got.length === want.length && want.length > 0 && timingSafeEqual(got, want)) return 'ok';
      failures++;
      log(`pairing: wrong code (${failures}/${maxFailures})`);
      return failures >= maxFailures ? 'locked' : 'bad';
    },

    attachPage(conn) {
      if (page && page !== conn) {
        failPending('The app tab was replaced by another tab.');
        page.close(4002, 'another tab connected');
      }
      page = conn;
      log('app tab connected');
      notifyToolsChanged();
    },

    detachPage(conn) {
      if (page !== conn) return;
      page = null;
      failPending('The app tab disconnected.');
      log('app tab disconnected');
      notifyToolsChanged();
    },

    onPageMessage(conn, msg) {
      if (conn !== page || !msg || msg.id === undefined) return;
      if ('error' in msg) settle(msg.id, { error: msg.error });
      else settle(msg.id, { result: msg.result });
    },

    onClientMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      const { id, method } = msg;
      const isRequest = id !== undefined && id !== null && typeof method === 'string';
      if (!isRequest) {
        if (method === 'notifications/initialized') initialized = true;
        return;   // other notifications (cancelled, ...) and stray responses
      }
      switch (method) {
        case 'initialize': {
          const asked = msg.params?.protocolVersion;
          return reply(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST,
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: RELAY_NAME, version: RELAY_VERSION },
            instructions: instructions(),
          });
        }
        case 'ping':
          return reply(id, {});
        case 'tools/list':
          if (!page) return reply(id, { tools: [] });
          return forward(msg);
        case 'tools/call':
          if (!page) return reply(id, toolError(`No floorball-3d app tab is connected. ${pairingHint()}`));
          return forward(msg);
        default:
          return fail(id, -32601, `Method not found: ${method}`);
      }
    },
  };
}
