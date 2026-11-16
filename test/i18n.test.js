// A-BACK-052: app text in English and German (goalie training first, the
// rest of the UI follows). Every key exists in both languages with the same
// {placeholders}; a missing key falls back to English; the first default
// comes from the browser language. The switch is app-wide (A-Q-010).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  LANGS, LANG_NAMES, TEXT, LANG_STORAGE_KEY, GOALIE_ZONE_KEYS,
  text, placeholdersOf, defaultLang, parseLang,
} = await import('../web/src/i18n.js');

test('English and German, each named in its own language, stored under one app-wide key', () => {
  assert.deepEqual(LANGS, ['en', 'de']);
  assert.deepEqual(LANG_NAMES, { en: 'English', de: 'Deutsch' });
  assert.equal(LANG_STORAGE_KEY, 'floorball3d.lang');
  assert.ok(Object.isFrozen(TEXT) && Object.isFrozen(TEXT.en) && Object.isFrozen(TEXT.de));
});

test('every key exists in both languages, non-empty, with the same placeholders', () => {
  const en = Object.keys(TEXT.en).sort();
  const de = Object.keys(TEXT.de).sort();
  assert.deepEqual(de, en);
  for (const k of en) {
    for (const lang of LANGS) assert.ok(TEXT[lang][k].trim().length > 0, `${lang}.${k} empty`);
    assert.deepEqual(placeholdersOf(TEXT.de[k]), placeholdersOf(TEXT.en[k]), k);
  }
});

test('no em-dashes in either language', () => {
  for (const lang of LANGS) for (const [k, v] of Object.entries(TEXT[lang])) assert.ok(!v.includes('—'), `${lang}.${k}`);
});

test('placeholdersOf lists distinct names, sorted', () => {
  assert.deepEqual(placeholdersOf('Ball {zone}, {pct} and {zone}'), ['pct', 'zone']);
  assert.deepEqual(placeholdersOf('none'), []);
});

test('goalie zones: name, motto and card for all six; KATA rows keep the German letter', () => {
  assert.deepEqual(GOALIE_ZONE_KEYS, ['awareness', 'attention', 'danger', 'slot', 'passing', 'transition']);
  for (const z of GOALIE_ZONE_KEYS) for (const part of ['name', 'motto', 'card']) assert.ok(TEXT.en[`goalie.zone.${z}.${part}`], `goalie.zone.${z}.${part}`);
  assert.equal(text('goalie.kata.body', 'en'), 'Body (Körper)');
  assert.equal(text('goalie.kata.placement', 'en'), 'Placement (Ausrichtung)');
  assert.equal(text('goalie.kata.depth', 'en'), 'Depth (Tiefe)');
  assert.equal(text('goalie.kata.axis', 'en'), 'Axis (Achse)');
  assert.equal(text('goalie.kata.axis', 'de'), 'Achse');
});

test('German goalie text uses the module\'s terms', () => {
  const all = Object.values(TEXT.de).join(' ');
  for (const term of ['Schusslinie', 'Verschiebungsvorbereitung', 'Torlinie']) assert.ok(all.includes(term), term);
});

test('text fills placeholders and falls back to English, then to the key', () => {
  assert.equal(text('goalie.zone.ball', 'en', { zone: 'Slot' }), 'Ball zone: Slot');
  assert.equal(text('goalie.zone.ball', 'de', { zone: 'Slot' }), 'Ballzone: Slot');
  assert.equal(text('goalie.zone.ball', 'fr', { zone: 'Slot' }), 'Ball zone: Slot');   // unknown language
  assert.equal(text('goalie.zone.ball', 'de'), 'Ballzone: {zone}');                    // missing var stays visible
  assert.equal(text('no.such.key', 'de'), 'no.such.key');
  const de = { ...TEXT.de };
  delete de['goalie.zone.ball'];
  assert.equal(text('goalie.zone.ball', 'de', { zone: 'X' }, { en: TEXT.en, de }), 'Ball zone: X');
});

test('defaultLang: de* browsers get German, everything else English', () => {
  assert.equal(defaultLang(['de-CH', 'en']), 'de');
  assert.equal(defaultLang(['DE']), 'de');
  assert.equal(defaultLang(['en-US', 'de']), 'en');       // first choice wins
  assert.equal(defaultLang(['fr-CH']), 'en');
  assert.equal(defaultLang([]), 'en');
  assert.equal(defaultLang(undefined), 'en');
});

test('parseLang: a stored choice wins, otherwise the browser default', () => {
  assert.equal(parseLang('de', ['en-US']), 'de');
  assert.equal(parseLang('en', ['de-DE']), 'en');
  for (const bad of [null, undefined, '', 'fr', 'DE ', '{}']) assert.equal(parseLang(bad, ['de-AT']), 'de', String(bad));
});
