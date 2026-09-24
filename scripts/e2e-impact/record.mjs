// pnpm test:e2e:record - run the whole e2e suite with per-test JS coverage and
// write test-e2e/.impact-map.json for `pnpm test:e2e:affected` (S-BACK-018).

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from './impact.mjs';

const PARTS = path.resolve('test-e2e/.impact');
const MAP = path.resolve('test-e2e/.impact-map.json');
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();

// Coverage line numbers must match the commit we stamp, so the served code has to be HEAD.
const dirty = git('status --porcelain -- web test-e2e');
if (dirty) {
  console.error(`record: uncommitted changes under web/ or test-e2e/ - commit or stash first:\n${dirty}`);
  process.exit(1);
}
const sha = git('rev-parse HEAD');

fs.rmSync(PARTS, { recursive: true, force: true });
const run = spawnSync(`pnpm exec playwright test ${process.argv.slice(2).join(' ')}`, {
  shell: true, stdio: 'inherit', env: { ...process.env, E2E_COVERAGE: '1' },
});
if (run.status !== 0) console.warn('record: some tests failed - their coverage is still recorded.');

const parts = fs.existsSync(PARTS)
  ? fs.readdirSync(PARTS).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(PARTS, f), 'utf8')))
  : [];
if (!parts.length) {
  console.error('record: no coverage parts written - nothing to map.');
  process.exit(1);
}
const map = buildMap(sha, parts);
fs.writeFileSync(MAP, JSON.stringify(map));
fs.rmSync(PARTS, { recursive: true, force: true });
const uncovered = map.tests.filter((t) => !t.covered).length;
console.log(`record: ${map.tests.length} tests, ${Object.keys(map.files).length} modules, ` +
  `${uncovered} without coverage (always run) -> ${path.relative(process.cwd(), MAP)} @ ${sha.slice(0, 7)}`);
