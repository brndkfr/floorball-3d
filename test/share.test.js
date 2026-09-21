import { test } from 'node:test';
import assert from 'node:assert/strict';

// readHashDoc()/clearHashDoc() read/write the browser's location/history
// globals directly - stub minimal versions so they're testable in Node.
const fakeLocation = { hash: '', origin: 'http://localhost', pathname: '/', search: '' };
const fakeHistory = { replaceState(_state, _title, url) { fakeLocation.href = url; } };
globalThis.location = fakeLocation;
globalThis.history = fakeHistory;

const { encodeShareUrl, readHashDoc, clearHashDoc } = await import('../web/src/authoring/share.js');
const { emptyDoc, acceptDoc } = await import('../web/src/authoring/doc.js');

test('encodeShareUrl produces a #doc= fragment', async () => {
  const url = await encodeShareUrl(emptyDoc(), 'http://localhost/app');
  assert.match(url, /^http:\/\/localhost\/app#doc=/);
});

test('encodeShareUrl returns null when the encoded URL would exceed the size limit', async () => {
  const hugeBase = 'http://localhost/' + 'x'.repeat(40 * 1024);
  const url = await encodeShareUrl(emptyDoc(), hugeBase);
  assert.equal(url, null);
});

test('encode -> readHashDoc round-trips a doc unchanged', async () => {
  const doc = acceptDoc(JSON.parse(JSON.stringify(emptyDoc())));
  doc.scheme.players['p_ab12cd'] = { team: 'home', x: 1000, z: 2000 };
  const url = await encodeShareUrl(doc, 'http://localhost/app');
  fakeLocation.hash = url.slice(url.indexOf('#'));
  const roundtripped = await readHashDoc();
  assert.deepEqual(roundtripped.scheme.players, doc.scheme.players);
});

test('readHashDoc returns null when there is no #doc= fragment', async () => {
  fakeLocation.hash = '';
  assert.equal(await readHashDoc(), null);
});

test('readHashDoc returns null for a malformed payload instead of throwing', async () => {
  fakeLocation.hash = '#doc=not-valid-base64url-deflate-data';
  assert.equal(await readHashDoc(), null);
});

test('clearHashDoc strips only the doc= fragment, keeping the rest of the hash', async () => {
  fakeLocation.hash = '#foo=bar&doc=abc123';
  fakeLocation.pathname = '/app';
  fakeLocation.search = '';
  clearHashDoc();
  assert.equal(fakeLocation.href, '/app#foo=bar');
});

test('clearHashDoc is a no-op when there is no doc= fragment', async () => {
  fakeLocation.hash = '#foo=bar';
  fakeLocation.href = undefined;
  clearHashDoc();
  assert.equal(fakeLocation.href, undefined);
});
