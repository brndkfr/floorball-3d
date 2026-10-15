// S-BUG-001 guard: page.waitForFunction() does not await an async
// predicate. The returned Promise is truthy, so the wait resolves after one
// poll whatever the answer. E2E specs must use waitUntil() from
// test-e2e/fixtures.js (expect.poll around page.evaluate, which awaits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('test-e2e');

test('no e2e file passes an async predicate to page.waitForFunction', () => {
  const hits = [];
  for (const name of fs.readdirSync(DIR)) {
    if (!name.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(DIR, name), 'utf8');
    const re = /waitForFunction\(\s*async\b/g;
    let m;
    while ((m = re.exec(src))) {
      hits.push(`${name}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(hits, [], `use waitUntil() from fixtures.js instead:\n${hits.join('\n')}`);
});
