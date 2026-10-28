// A-BACK-039: the Swiss Way tactical zones are layers, one per zone, and
// which ones are shown is saved with the project (doc.zones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ZONES, sanitizeZones, isZoneVisible, withZone } from '../web/src/authoring/zones-model.js';
import { acceptDoc, emptyDoc } from '../web/src/authoring/doc.js';

test('five zones, each tied to a material in tactical_zones.mtl', () => {
  assert.deepEqual(ZONES.map((z) => z.key), ['slotNear', 'slotHigh', 'pocket', 'playmaker', 'centreLine']);
  const mtl = readFileSync(new URL('../web/assets/tactical_zones.mtl', import.meta.url), 'utf8');
  for (const z of ZONES) {
    assert.match(mtl, new RegExp(`^newmtl ${z.mtl}$`, 'm'), `${z.key} has no material ${z.mtl}`);
    assert.match(z.color, /^#[0-9a-f]{6}$/i);
    assert.ok(z.label.length > 0);
  }
});

test('tactical_zones.obj has one object per zone, so each can be shown on its own', () => {
  const obj = readFileSync(new URL('../web/assets/tactical_zones.obj', import.meta.url), 'utf8');
  const objects = [...obj.matchAll(/^o (\S+)$/gm)].map((m) => m[1]);
  assert.deepEqual(objects.sort(), ZONES.map((z) => z.mtl).sort());
});

test('sanitizeZones keeps known keys once, in zone order; anything else becomes []', () => {
  assert.deepEqual(sanitizeZones(['pocket', 'slotNear', 'pocket']), ['slotNear', 'pocket']);
  assert.deepEqual(sanitizeZones(['pocket', 'nope', 7, null]), ['pocket']);
  assert.deepEqual(sanitizeZones(undefined), []);
  assert.deepEqual(sanitizeZones('pocket'), []);
  assert.deepEqual(sanitizeZones({ pocket: true }), []);
});

test('withZone shows / hides one zone without touching the others', () => {
  assert.deepEqual(withZone([], 'pocket', true), ['pocket']);
  assert.deepEqual(withZone(['slotNear', 'pocket'], 'slotNear', false), ['pocket']);
  assert.deepEqual(withZone(['pocket'], 'pocket', true), ['pocket']);
  assert.deepEqual(withZone(['pocket'], 'nope', true), ['pocket']);
  assert.equal(isZoneVisible(['pocket'], 'pocket'), true);
  assert.equal(isZoneVisible(['pocket'], 'slotHigh'), false);
  assert.equal(isZoneVisible(undefined, 'pocket'), false);
});

test('a loaded project keeps valid zones and drops the rest; old projects get none', () => {
  const raw = JSON.parse(JSON.stringify(emptyDoc()));
  raw.zones = ['slotHigh', '<img src=x>', 'slotHigh'];
  assert.deepEqual(acceptDoc(raw).zones, ['slotHigh']);
  const old = JSON.parse(JSON.stringify(emptyDoc()));
  delete old.zones;
  assert.deepEqual(acceptDoc(old).zones, []);
});
