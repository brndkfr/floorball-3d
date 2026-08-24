// Share-URL codec: JSON -> deflate-raw -> base64url, packed into `#doc=<...>`.
// Uses the native CompressionStream API (no dependencies). Callers are
// responsible for capacity fallback - encodeShareUrl returns null when the
// resulting URL would exceed HASH_LIMIT.

import { acceptDoc } from './doc.js';

// Most browsers refuse or truncate URLs past ~32 KB (some Chromium builds
// silently trim history entries). Stay comfortably under that.
const HASH_LIMIT = 32 * 1024;

async function deflateRaw(str) {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([str]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Returns the sharable URL, or null if the encoded fragment would be too
// large. `baseHref` defaults to the current page without any hash.
export async function encodeShareUrl(doc, baseHref = location.origin + location.pathname + location.search) {
  const bytes = await deflateRaw(JSON.stringify(doc));
  const encoded = toBase64Url(bytes);
  const url = `${baseHref}#doc=${encoded}`;
  if (url.length > HASH_LIMIT) return null;
  return url;
}

// Reads a doc from the current `location.hash` if present. Returns null if
// no `#doc=` is present, the payload is malformed, or the version doesn't
// match this build.
export async function readHashDoc() {
  const m = location.hash.match(/[#&]doc=([^&]+)/);
  if (!m) return null;
  try {
    const json = await inflateRaw(fromBase64Url(m[1]));
    const doc = acceptDoc(JSON.parse(json));
    if (doc) return doc;
    console.warn('readHashDoc: version mismatch, ignoring hash doc');
  } catch (e) {
    console.warn('readHashDoc: decode failed', e);
  }
  return null;
}

// Strip the `#doc=...` fragment from the URL bar after we've loaded it, so
// subsequent Save/Copy actions don't chain onto a stale doc payload.
export function clearHashDoc() {
  if (!/[#&]doc=/.test(location.hash)) return;
  const cleaned = location.hash.replace(/[#&]doc=[^&]*/, '').replace(/^#&/, '#');
  history.replaceState(null, '', location.pathname + location.search + (cleaned === '#' ? '' : cleaned));
}
