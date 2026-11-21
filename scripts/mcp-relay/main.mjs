#!/usr/bin/env node
// The floorball-3d MCP server for Claude Code / Claude Desktop (S-BACK-034):
// a local relay between the MCP client (stdio) and the app tab (WebSocket
// on 127.0.0.1). The tab connects out to it after the user clicks
// "Connect AI" and types the pairing code this process prints (and gives
// the client in its MCP instructions). A dev tool: not part of dist/.
//
//   claude mcp add floorball -- node <repo>/scripts/mcp-relay/main.mjs
//   node scripts/mcp-relay/main.mjs --port 8766    (or FLOORBALL_MCP_PORT)
//
// stdout carries only MCP messages; everything else goes to stderr.

import { createRelay, createLineReader, generateCode } from './relay.mjs';
import { createBridgeServer } from './server.mjs';

const argPort = process.argv.indexOf('--port');
const port = Number(argPort > 0 ? process.argv[argPort + 1] : process.env.FLOORBALL_MCP_PORT) || 8765;
const code = generateCode();
const log = (s) => process.stderr.write(`[floorball relay] ${s}\n`);

const relay = createRelay({
  code,
  port,
  log,
  send: (msg) => process.stdout.write(JSON.stringify(msg) + '\n'),
});

const server = createBridgeServer({ relay, port, log });
server.on('listening', () => log(`waiting for the app on ws://127.0.0.1:${port}; pairing code ${code}${port === 8765 ? '' : `@${port}`}`));
server.on('error', (e) => {
  log(e.code === 'EADDRINUSE' ? `port ${port} is in use (another relay?). Pick one with --port.` : `server error: ${e.message}`);
  process.exit(1);
});

process.stdin.setEncoding('utf8');
process.stdin.on('data', createLineReader((line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    return;
  }
  relay.onClientMessage(msg);
}));
process.stdin.on('end', () => process.exit(0));   // the client went away
