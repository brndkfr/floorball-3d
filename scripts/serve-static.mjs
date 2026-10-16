// Minimal static server used by the Playwright e2e suite.
// Serves web/ over HTTP with correct MIME types for .js modules, .mjs,
// .css, .json, .png, .jpg, .obj, .mtl, and a couple of others the app
// pulls in at runtime. Kept dependency-free so CI doesn't need Python
// installed on the runner.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', 'web');
const PORT = Number(process.env.PORT) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.obj':  'text/plain; charset=utf-8',
  '.mtl':  'text/plain; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

// Log text with control characters (CR/LF etc.) replaced, so a request
// can't forge extra log lines (code scanning js/log-injection).
const logSafe = (v) => String(v).replace(/[\r\n\u0000-\u001f\u007f\u2028\u2029]/g, '?');

// Opens `p` if it is a regular file, else null. Stat goes through the open
// handle, so what was checked is what gets read (code scanning
// js/file-system-race: stat() then readFile() on a path is check-then-use).
async function openFile(p) {
  let fh;
  try {
    fh = await fs.open(p, 'r');
    if ((await fh.stat()).isFile()) return fh;
  } catch {
    // missing, a directory (EISDIR on Windows) or unreadable
  }
  await fh?.close();
  return null;
}

async function serve(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    // Resolve safely - reject anything that escapes ROOT.
    const abs = path.resolve(ROOT, '.' + rel);
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    // A file, else a directory's index.html.
    let target = abs;
    let fh = await openFile(target);
    if (!fh) {
      target = path.join(abs, 'index.html');
      fh = await openFile(target);
    }
    if (!fh) { res.writeHead(404); res.end('not found'); return; }
    let body;
    try {
      body = await fh.readFile();
    } finally {
      await fh.close();
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    // Details go to the server log, never into the response: an error
    // message carries absolute file-system paths (code scanning
    // js/stack-trace-exposure).
    console.error('serve-static:', logSafe(req.url), logSafe(e?.stack ?? e));
    res.writeHead(500); res.end('internal error');
  }
}

const server = http.createServer(serve);
server.listen(PORT, () => {
  console.log(`serve-static: web/ on http://localhost:${PORT}/`);
});
