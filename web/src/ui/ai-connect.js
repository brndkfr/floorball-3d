// "Connect AI" button in the top bar, every mode (S-BACK-034). Off by
// default; a click asks for the pairing code the local MCP relay shows
// (Claude tells it, too) and connects this tab to it; a second click
// disconnects. The socket code (commands/bridge.js) is loaded on the first
// click only, so the site opens no connection unless the user asks.

import { showAlert, showPrompt } from '../authoring/dialog.js';
import { parsePairing } from '../commands/mcp-server.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const button = document.getElementById('aiBtn');
if (!button) throw new Error('ai-connect.js: #aiBtn missing from index.html');

const TITLE_OFF = 'Connect AI: let Claude drive this tab through the local MCP relay';
let bridge = null;
let busy = false;

function show(status) {
  button.setAttribute('aria-pressed', status === 'on' ? 'true' : 'false');
  button.title = status === 'on' ? 'AI connected: click to disconnect' : status === 'connecting' ? 'Connecting to the MCP relay...' : TITLE_OFF;
}

window.addEventListener('aiBridgeChanged', (e) => show(e.detail.status));

button.addEventListener('click', async () => {
  if (busy) return;
  if (bridge?.bridgeStatus() === 'on') { bridge.disconnectBridge(); return; }
  busy = true;
  try {
    const text = await showPrompt('Connect AI. Start the floorball MCP server in Claude Code, then enter the pairing code it shows (ABCD-EFGH, or ABCD-EFGH@port):');
    if (text === null) return;
    const pairing = parsePairing(text);
    if (!pairing) { await showAlert('That is not a pairing code. It looks like ABCD-EFGH.'); return; }
    bridge ??= await import('../commands/bridge.js');
    await bridge.connectBridge(pairing);
  } catch (e) {
    await showAlert(`Could not connect: ${e.message}`);
  } finally {
    busy = false;
  }
});
