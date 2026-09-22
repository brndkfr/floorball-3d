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

async function serve(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    // Resolve safely - reject anything that escapes ROOT.
    const abs = path.resolve(ROOT, '.' + rel);
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) { res.writeHead(404); res.end('not found'); return; }
    const target = stat.isDirectory() ? path.join(abs, 'index.html') : abs;
    const body = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}

const server = http.createServer(serve);
server.listen(PORT, () => {
  console.log(`serve-static: web/ on http://localhost:${PORT}/`);
});
