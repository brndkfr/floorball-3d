// pnpm test:e2e:affected [--dry] [-- <playwright args>] - run only the e2e tests
// whose recorded coverage touches the changed code (S-BACK-018). Falls back to
// the full suite whenever selection would be a guess. CI always runs everything.

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseDiff, selectTests } from './impact.mjs';

const MAP = path.resolve('test-e2e/.impact-map.json');
const STALE_AFTER = 30;   // commits; an estimate of when paths drift enough to re-record
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const passthrough = args.includes('--') ? args.slice(args.indexOf('--') + 1) : [];
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function decide() {
  if (!fs.existsSync(MAP)) return { full: 'no impact map yet - run `pnpm test:e2e:record` once', targets: [] };
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  try {
    execSync(`git merge-base --is-ancestor ${map.sha} HEAD`, { stdio: 'ignore' });
  } catch {
    return { full: `impact map commit ${map.sha.slice(0, 7)} is not an ancestor of HEAD - re-record`, targets: [] };
  }
  const behind = Number(git(`rev-list --count ${map.sha}..HEAD`).trim());
  if (behind > STALE_AFTER) console.warn(`affected: impact map is ${behind} commits old - consider \`pnpm test:e2e:record\`.`);

  const changes = parseDiff(git(`diff --unified=0 --no-renames --no-color ${map.sha}`));
  for (const p of git('ls-files --others --exclude-standard').split('\n').map((s) => s.trim()).filter(Boolean)) {
    changes.push({ path: p, status: 'added', hunks: [] });
  }
  return selectTests(map, changes);
}

const r = decide();
for (const n of r.notes ?? []) console.log(`affected: note: ${n}`);
if (r.uncovered?.length) {
  console.log('affected: changed code no e2e test executes (consider a spec):');
  for (const u of r.uncovered) console.log(`  - ${u}`);
}
if (r.full) console.log(`affected: FULL RUN - ${r.full}`);
else console.log(`affected: ${r.targets.length} target(s):\n${r.targets.map((t) => `  ${t}`).join('\n')}`);
if (dry) process.exit(0);

const run = spawnSync(`pnpm exec playwright test ${[...(r.full ? [] : r.targets), ...passthrough].join(' ')}`, {
  shell: true, stdio: 'inherit',
});
process.exit(run.status ?? 1);
