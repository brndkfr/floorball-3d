// Goalie module text in English and German (A-BACK-052). Pure, three-free and
// DOM-free so it is Node-testable; goalie-lang-state.js holds the chosen
// language. Every later goalie step (zone layer, KATA readout, lessons,
// exercises) adds its strings here in both languages.
//
// Our own wording (A-Q-007). German uses the terms of the J+S / swiss
// unihockey module "Goalies - Positionierung" (Schusslinie, Torlinie,
// Verschiebungsvorbereitung) so coaches recognise them; the zone names and
// one-word mottos are the module's labels, the cards are ours. Swiss
// spelling (ss, no sharp s) like the module.

export const GOALIE_LANGS = ['en', 'de'];
export const GOALIE_LANG_STORAGE_KEY = 'floorball3d.goalieLang';
export const GOALIE_MODULE_URL = 'https://swiss-unihockey-lernmodul.lernetz.site/module/goalies-positionierung';
export const GOALIE_ZONE_KEYS = ['awareness', 'attention', 'danger', 'slot', 'passing', 'transition'];

const EN = {
  'section.title': 'Goalie',
  'lang.label': 'Language',
  'source.text': 'Positioning after the J+S / swiss unihockey goalie module.',
  'source.link': 'Open the module',

  'kata.body': 'Body (Körper)',
  'kata.placement': 'Placement (Ausrichtung)',
  'kata.depth': 'Depth (Tiefe)',
  'kata.axis': 'Axis (Achse)',

  'action.shot': 'Shot',
  'action.pass': 'Pass',
  'action.dribble': 'Dribble',

  'zone.ball': 'Ball zone: {zone}',
  'zone.awareness.name': 'Awareness zone',
  'zone.awareness.motto': 'Recover!',
  'zone.awareness.card': 'Your team has the ball in the other half. Stand up, move, take the load off your knees and let your concentration drop a little. Keep an eye open for a turnover.',
  'zone.attention.name': 'Attention zone',
  'zone.attention.motto': 'Stay patient!',
  'zone.attention.card': 'The opponents are coming into your half. Stay patient and neutral: centred, deep, axis parallel to the goal line. Read what comes next and help your defence with short calls.',
  'zone.danger.name': 'Danger zone',
  'zone.danger.motto': 'Full alert!',
  'zone.danger.card': 'The ball can reach the danger zone. Shot expected: step forward and square up to the shooting line. Pass expected: stay back with your knees parallel to the goal line, ready to move across.',
  'zone.slot.name': 'Slot',
  'zone.slot.motto': 'Full alert!',
  'zone.slot.card': 'The most dangerous area in front of the goal. Keep it in view from every position: a pass into the slot is the shot to fear most.',
  'zone.passing.name': 'Passing-first zone',
  'zone.passing.motto': 'Play the line!',
  'zone.passing.card': 'The ball is behind or beside the goal. Play the line: feet in the goal, knees parallel to the goal line, body and glances turned to the slot for the pass.',
  'zone.transition.name': 'Defensive transition',
  'zone.transition.motto': 'Wide awake!',
  'zone.transition.card': 'The opponents start a counter. Call early, stay on the shooting line: forward against the ball carrier, back against a player without the ball.',
};

const DE = {
  'section.title': 'Goalie',
  'lang.label': 'Sprache',
  'source.text': 'Positionierung nach dem J+S-/swiss-unihockey-Lernmodul für Goalies.',
  'source.link': 'Zum Lernmodul',

  'kata.body': 'Körper',
  'kata.placement': 'Ausrichtung',
  'kata.depth': 'Tiefe',
  'kata.axis': 'Achse',

  'action.shot': 'Schuss',
  'action.pass': 'Pass',
  'action.dribble': 'Dribbling',

  'zone.ball': 'Ballzone: {zone}',
  'zone.awareness.name': 'Awareness-Zone',
  'zone.awareness.motto': 'Erholen!',
  'zone.awareness.card': 'Dein Team hat den Ball in der gegnerischen Hälfte. Aufstehen, bewegen, die Knie entlasten und die Konzentration bewusst etwas senken. Einen Ballverlust trotzdem im Blick behalten.',
  'zone.attention.name': 'Attention-Zone',
  'zone.attention.motto': 'Geduldig bleiben!',
  'zone.attention.card': 'Das gegnerische Team kommt in deine Hälfte. Geduldig und neutral bleiben: mittig, tief, Achse parallel zur Torlinie. Lesen, was als Nächstes kommt, und die Verteidigung mit kurzen Kommandos unterstützen.',
  'zone.danger.name': 'Danger-Zone',
  'zone.danger.motto': 'Hochspannung!',
  'zone.danger.card': 'Der Ball kann in die Danger-Zone kommen. Schuss erwartet: nach vorne und frontal zur Schusslinie. Pass erwartet: tief bleiben, Knie parallel zur Torlinie, bereit zur Verschiebung (Verschiebungsvorbereitung).',
  'zone.slot.name': 'Slot',
  'zone.slot.motto': 'Hochspannung!',
  'zone.slot.card': 'Der gefährlichste Bereich vor dem Tor. Aus jeder Position im Blick behalten: Ein Pass in den Slot ist die grösste Gefahr.',
  'zone.passing.name': 'Passing-First-Zone',
  'zone.passing.motto': 'Linie spielen!',
  'zone.passing.card': 'Der Ball ist hinter oder neben dem Tor. Linie spielen: Füsse im Tor, Knie parallel zur Torlinie, Fläche und Blick zum Slot für den Pass.',
  'zone.transition.name': 'Defensiv-Transition',
  'zone.transition.motto': 'Hellwach!',
  'zone.transition.card': 'Das gegnerische Team lanciert einen Konter. Früh kommunizieren, auf der Schusslinie bleiben: vorne gegen die ballführende Person, hinten gegen eine Person ohne Ball.',
};

export const GOALIE_TEXT = Object.freeze({ en: Object.freeze(EN), de: Object.freeze(DE) });

// Distinct {name} placeholders in a string, sorted.
export function placeholdersOf(s) {
  return [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

// The string for key in lang, {vars} filled in. Falls back to English, then
// to the key itself, so a gap shows up on screen instead of as a blank.
// `table` is for tests.
export function goalieText(key, lang, vars, table = GOALIE_TEXT) {
  const s = table[lang]?.[key] ?? table.en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}

// First default: the browser's first language, de* -> German, else English.
export function defaultGoalieLang(languages) {
  const first = Array.isArray(languages) ? languages[0] : null;
  return typeof first === 'string' && first.toLowerCase().startsWith('de') ? 'de' : 'en';
}

// A stored choice wins when it is a known language; anything else -> default.
export function parseGoalieLang(stored, languages) {
  return GOALIE_LANGS.includes(stored) ? stored : defaultGoalieLang(languages);
}
