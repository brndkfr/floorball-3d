// Command layer (S-BACK-033): the app's actions as named commands with a
// JSON-schema input, run by the same code as the UI. listCommands() is
// what the MCP server (S-BACK-034) offers as tools/list, runCommand() its
// tools/call. Pure (no DOM, no three.js) so it is Node-testable; the app's
// commands are defined in app-commands.js.

const NAME_RE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;   // area.verb
const EMPTY_INPUT = Object.freeze({ type: 'object', properties: {}, additionalProperties: false });

function typeOk(type, v) {
  switch (type) {
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    default: return true;
  }
}

function checkValue(schema, v, path, out) {
  const label = path || 'input';
  if (schema.type && !typeOk(schema.type, v)) {
    out.push(`${label}: must be ${schema.type === 'integer' ? 'an integer' : schema.type === 'object' ? 'an object' : `a ${schema.type}`}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(v)) out.push(`${label}: ${JSON.stringify(v)} is not one of ${schema.enum.join(', ')}`);
  if (typeof v === 'number') {
    if (schema.minimum != null && v < schema.minimum) out.push(`${label}: must be at least ${schema.minimum}`);
    if (schema.maximum != null && v > schema.maximum) out.push(`${label}: must be at most ${schema.maximum}`);
  }
  if (schema.type === 'object') {
    const props = schema.properties || {};
    for (const key of schema.required || []) if (v[key] === undefined) out.push(`${path ? `${path}.` : ''}${key}: required`);
    for (const [key, val] of Object.entries(v)) {
      const sub = props[key];
      const p = path ? `${path}.${key}` : key;
      if (!sub) { if (schema.additionalProperties === false) out.push(`${p}: not allowed`); continue; }
      if (val !== undefined) checkValue(sub, val, p, out);
    }
  }
}

// Problems with `input` against `schema`, as messages; [] when it is fine.
export function validateInput(schema, input) {
  const out = [];
  checkValue(schema || EMPTY_INPUT, input, '', out);
  return out;
}

export function createRegistry() {
  const commands = new Map();

  function defineCommand({ name, description, input, run }) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) throw new Error(`defineCommand: bad name ${JSON.stringify(name)} (want area.verb)`);
    if (commands.has(name)) throw new Error(`defineCommand: "${name}" is already defined`);
    if (typeof description !== 'string' || !description.trim()) throw new Error(`defineCommand: "${name}" needs a description`);
    if (typeof run !== 'function') throw new Error(`defineCommand: "${name}" needs a run function`);
    commands.set(name, { name, description, input: input || EMPTY_INPUT, run });
  }

  function listCommands() {
    return [...commands.values()].map(({ name, description, input }) => ({ name, description, input }));
  }

  async function runCommand(name, input = {}) {
    const cmd = commands.get(name);
    if (!cmd) return { ok: false, error: `Unknown command "${name}"` };
    const problems = validateInput(cmd.input, input);
    if (problems.length) return { ok: false, error: `${name}: ${problems.join('; ')}` };
    try {
      const result = await cmd.run(input);
      return { ok: true, result: result === undefined ? null : result };
    } catch (e) {
      return { ok: false, error: `${name}: ${e?.message || String(e)}` };
    }
  }

  return { defineCommand, listCommands, runCommand };
}

// The app's one registry (app-commands.js fills it; the MCP server reads it).
export const commands = createRegistry();
