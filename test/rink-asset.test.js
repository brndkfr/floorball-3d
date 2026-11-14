// S-BACK-030 step 6: the generated rink (generators/generate_rink.py) has
// white boards with a darker top rail. Black boards read as a hole next to
// the dark hall. Checks the shipped files, so a hand edit or a stale
// generator run shows up here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mtl = fs.readFileSync(new URL('../web/assets/rink.mtl', import.meta.url), 'utf8');
const obj = fs.readFileSync(new URL('../web/assets/rink.obj', import.meta.url), 'utf8');

function kd(name) {
  const m = mtl.match(new RegExp(`newmtl ${name}\\s+Kd ([\\d.]+) ([\\d.]+) ([\\d.]+)`));
  assert.ok(m, `material ${name} missing in rink.mtl`);
  return m.slice(1).map(Number);
}

test('boards are light, the top rail is clearly darker', () => {
  const board = kd('Board'), rail = kd('BoardRail');
  for (const c of board) assert.ok(c >= 0.8, `Board Kd ${board}`);
  for (const c of rail) assert.ok(c <= 0.3, `BoardRail Kd ${rail}`);
});

test('the rink mesh uses both board materials and keeps its markings', () => {
  for (const name of ['Board', 'BoardRail', 'Marking']) {
    assert.ok(new RegExp(`^usemtl ${name}$`, 'm').test(obj), `usemtl ${name}`);
  }
});

test('boards are still 500 mm high', () => {
  const ys = obj.split('\n').filter((l) => l.startsWith('v ')).map((l) => Number(l.split(' ')[2]));
  assert.equal(Math.max(...ys), 500);
});
