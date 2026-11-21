// The MCP server in the app (S-BACK-034): tools/list and tools/call over the
// command registry, as JSON-RPC messages. Pure (no DOM, no socket):
// bridge.js carries the messages to and from the local relay
// (scripts/mcp-relay/), which handles the MCP lifecycle and has no
// floorball logic. Tools are generated from listCommands(), so a new
// command appears as a tool without any change here.

export const DEFAULT_RELAY_PORT = 8765;

// API tool names allow [a-zA-Z0-9_-] only, so `area.verb` travels as
// `area_verb`. Command names never contain '_' (registry NAME_RE), so the
// mapping is reversible.
export const toolName = (command) => command.replace(/\./g, '_');
export const commandName = (tool) => tool.replace(/_/g, '.');

export function toolList(registry) {
  return registry.listCommands().map(({ name, description, input }) => ({ name: toolName(name), description, inputSchema: input }));
}

const IMAGE_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]*)$/;

// runCommand's { ok, result } / { ok: false, error } as an MCP tool result.
// A result with a base64 image data URL becomes an image block plus the
// rest of the result as text (screenshot.take).
export function toolResult(r) {
  if (!r.ok) return { isError: true, content: [{ type: 'text', text: r.error }] };
  const v = r.result;
  const m = v && typeof v === 'object' && typeof v.dataUrl === 'string' ? IMAGE_URL.exec(v.dataUrl) : null;
  if (m) {
    const { dataUrl, ...rest } = v;
    return { content: [{ type: 'image', data: m[2], mimeType: m[1] }, { type: 'text', text: JSON.stringify(rest) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(v === undefined ? null : v) }] };
}

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

// handle(message) resolves to the JSON-RPC response, or null for a
// notification (no id).
export function createMcpHandler(registry) {
  return async function handle(msg) {
    if (msg?.id === undefined || msg.id === null) return null;
    const { id, method, params } = msg;
    if (method === 'tools/list') return reply(id, { tools: toolList(registry) });
    if (method === 'tools/call') {
      const name = params?.name;
      const known = typeof name === 'string' && registry.listCommands().some((c) => c.name === commandName(name) && toolName(c.name) === name);
      if (!known) return fail(id, -32602, `Unknown tool: ${typeof name === 'string' ? name : '(none)'}`);
      return reply(id, toolResult(await registry.runCommand(commandName(name), params.arguments ?? {})));
    }
    return fail(id, -32601, `Method not found: ${method}`);
  };
}

// The pairing code the relay shows ("ABCD-EFGH", or "ABCD-EFGH@8766" for a
// relay on another port) as { code, port }; null when it is not one.
export function parsePairing(text) {
  if (typeof text !== 'string') return null;
  const m = /^([A-Za-z0-9]{4})[\s-]*([A-Za-z0-9]{4})(?:\s*@\s*(\d{1,5}))?$/.exec(text.trim());
  if (!m) return null;
  const port = m[3] ? Number(m[3]) : DEFAULT_RELAY_PORT;
  if (port < 1024 || port > 65535) return null;
  return { code: (m[1] + m[2]).toUpperCase(), port };
}
