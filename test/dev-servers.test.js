// Code scanning js/stack-trace-exposure (alerts #2, #3): the local dev
// servers answered a 500 with String(err), which leaks error messages and
// absolute file-system paths to whoever can reach the port. Starts each
// script on a free port and triggers its error path for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function start(script) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script)], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (String(d).includes(String(port))) resolve(); });
    child.on('exit', (code) => reject(new Error(`${script} exited ${code}: ${stderr}`)));
  });
  return { port, child, stderr: () => stderr };
}

function assertNoLeak(body) {
  assert.doesNotMatch(body, /ENOENT|EISDIR|SyntaxError|Error:|at \w|[A-Za-z]:\\|\/Users\/|\/home\//, `500 body leaks internals: ${body}`);
}

test('serve-static: a 500 does not expose the error or file paths', async () => {
  const s = await start('serve-static.mjs');
  try {
    // web/src/ is a directory without index.html -> readFile throws.
    const res = await fetch(`http://127.0.0.1:${s.port}/src/`);
    assert.equal(res.status, 500);
    assertNoLeak(await res.text());
  } finally {
    s.child.kill();
  }
});

test('label-goals: a 500 does not expose the error', async () => {
  const s = await start('label-goals.mjs');
  try {
    // Invalid JSON -> JSON.parse throws; truth.json is left untouched.
    const res = await fetch(`http://127.0.0.1:${s.port}/api/truth`, { method: 'PUT', body: '{not json' });
    assert.equal(res.status, 500);
    assertNoLeak(await res.text());
  } finally {
    s.child.kill();
  }
});
