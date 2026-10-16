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
    // A malformed escape makes decodeURIComponent throw.
    const res = await fetch(`http://127.0.0.1:${s.port}/%E0%A4%A`);
    assert.equal(res.status, 500);
    assertNoLeak(await res.text());
  } finally {
    s.child.kill();
  }
});

// Code scanning js/file-system-race (#6): stat() then readFile() on a path
// is check-then-use. The server now opens the file once and stats the
// handle. The race itself can't be provoked reliably in a test; these pin
// the serving behaviour the rewrite must keep.
test('serve-static: files, directory index, 404s and traversal', async () => {
  const s = await start('serve-static.mjs');
  const get = (p) => fetch(`http://127.0.0.1:${s.port}${p}`);
  try {
    let res = await get('/index.html');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /<html/i);
    res = await get('/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<html/i);
    res = await get('/src/main.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    await res.arrayBuffer();
    assert.equal((await get('/nope.js')).status, 404);
    assert.equal((await get('/src/')).status, 404, 'directory without index.html');
    // The URL parser normalises %2e%2e segments; an encoded slash survives
    // it and decodeURIComponent turns it into ../ - a real escape attempt.
    assert.equal((await get('/..%2fpackage.json')).status, 403, 'escapes web/');
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
