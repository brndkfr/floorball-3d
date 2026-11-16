// A-BACK-052: the goalie module's text in English and German. Every key
// exists in both languages with the same {placeholders}; a missing key falls
// back to English; the first default comes from the browser language.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  GOALIE_LANGS, GOALIE_TEXT, GOALIE_LANG_STORAGE_KEY, GOALIE_ZONE_KEYS,
  goalieText, placeholdersOf, defaultGoalieLang, parseGoalieLang,
} = await import('../web/src/goalie-i18n.js');

test('English and German, stored under its own key', () => {
  assert.deepEqual(GOALIE_LANGS, ['en', 'de']);
  assert.equal(GOALIE_LANG_STORAGE_KEY, 'floorball3d.goalieLang');
  assert.ok(Object.isFrozen(GOALIE_TEXT) && Object.isFrozen(GOALIE_TEXT.en) && Object.isFrozen(GOALIE_TEXT.de));
});

test('every key exists in both languages, non-empty, with the same placeholders', () => {
  const en = Object.keys(GOALIE_TEXT.en).sort();
  const de = Object.keys(GOALIE_TEXT.de).sort();
  assert.deepEqual(de, en);
  for (const k of en) {
    for (const lang of GOALIE_LANGS) assert.ok(GOALIE_TEXT[lang][k].trim().length > 0, `${lang}.${k} empty`);
    assert.deepEqual(placeholdersOf(GOALIE_TEXT.de[k]), placeholdersOf(GOALIE_TEXT.en[k]), k);
  }
});

test('no em-dashes in either language', () => {
  for (const lang of GOALIE_LANGS) for (const [k, v] of Object.entries(GOALIE_TEXT[lang])) assert.ok(!v.includes('—'), `${lang}.${k}`);
});

test('placeholdersOf lists distinct names, sorted', () => {
  assert.deepEqual(placeholdersOf('Ball {zone}, {pct} and {zone}'), ['pct', 'zone']);
  assert.deepEqual(placeholdersOf('none'), []);
});

test('zone names, mottos and cards for all six zones; KATA rows keep the German letter', () => {
  assert.deepEqual(GOALIE_ZONE_KEYS, ['awareness', 'attention', 'danger', 'slot', 'passing', 'transition']);
  for (const z of GOALIE_ZONE_KEYS) for (const part of ['name', 'motto', 'card']) assert.ok(GOALIE_TEXT.en[`zone.${z}.${part}`], `zone.${z}.${part}`);
  assert.equal(goalieText('kata.body', 'en'), 'Body (Körper)');
  assert.equal(goalieText('kata.placement', 'en'), 'Placement (Ausrichtung)');
  assert.equal(goalieText('kata.depth', 'en'), 'Depth (Tiefe)');
  assert.equal(goalieText('kata.axis', 'en'), 'Axis (Achse)');
  assert.equal(goalieText('kata.axis', 'de'), 'Achse');
});

test('German uses the module\'s terms', () => {
  const all = Object.values(GOALIE_TEXT.de).join(' ');
  for (const term of ['Schusslinie', 'Verschiebungsvorbereitung', 'Torlinie']) assert.ok(all.includes(term), term);
});

test('goalieText fills placeholders and falls back to English, then to the key', () => {
  assert.equal(goalieText('zone.ball', 'en', { zone: 'Slot' }), 'Ball zone: Slot');
  assert.equal(goalieText('zone.ball', 'de', { zone: 'Slot' }), 'Ballzone: Slot');
  assert.equal(goalieText('zone.ball', 'fr', { zone: 'Slot' }), 'Ball zone: Slot');      // unknown language
  assert.equal(goalieText('zone.ball', 'de'), 'Ballzone: {zone}');                       // missing var stays visible
  assert.equal(goalieText('no.such.key', 'de'), 'no.such.key');
  const de = { ...GOALIE_TEXT.de };
  delete de['zone.ball'];
  assert.equal(goalieText('zone.ball', 'de', { zone: 'X' }, { en: GOALIE_TEXT.en, de }), 'Ball zone: X');
});

test('defaultGoalieLang: de* browsers get German, everything else English', () => {
  assert.equal(defaultGoalieLang(['de-CH', 'en']), 'de');
  assert.equal(defaultGoalieLang(['DE']), 'de');
  assert.equal(defaultGoalieLang(['en-US', 'de']), 'en');       // first choice wins
  assert.equal(defaultGoalieLang(['fr-CH']), 'en');
  assert.equal(defaultGoalieLang([]), 'en');
  assert.equal(defaultGoalieLang(undefined), 'en');
});

test('parseGoalieLang: a stored choice wins, otherwise the browser default', () => {
  assert.equal(parseGoalieLang('de', ['en-US']), 'de');
  assert.equal(parseGoalieLang('en', ['de-DE']), 'en');
  for (const bad of [null, undefined, '', 'fr', 'DE ', '{}']) assert.equal(parseGoalieLang(bad, ['de-AT']), 'de', String(bad));
});
