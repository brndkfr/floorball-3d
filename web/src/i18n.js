// App text in English and German (A-BACK-052). Pure, three-free and
// DOM-free so it is Node-testable; lang-state.js holds the chosen language,
// switched app-wide from the globe button at the bottom of the rail
// (A-Q-010). Goalie training is translated first; the rest of the UI moves
// its strings here step by step. Keys are namespaced by area ('lang.',
// 'goalie.').
//
// Goalie text: our own wording (A-Q-007). German uses the terms of the J+S /
// swiss unihockey module "Goalies - Positionierung" (Schusslinie, Torlinie,
// Verschiebungsvorbereitung) so coaches recognise them; the zone names and
// one-word mottos are the module's labels, the cards are ours. Swiss
// spelling (ss, no sharp s) like the module.

export const LANGS = ['en', 'de'];
// Each language named in itself, so a reader can find their own.
export const LANG_NAMES = Object.freeze({ en: 'English', de: 'Deutsch' });
export const LANG_STORAGE_KEY = 'floorball3d.lang';
export const GOALIE_MODULE_URL = 'https://swiss-unihockey-lernmodul.lernetz.site/module/goalies-positionierung';
export const GOALIE_ZONE_KEYS = ['awareness', 'attention', 'danger', 'slot', 'passing', 'transition'];

const EN = {
  'goalie.title': 'Goalie training',
  'lang.label': 'Language',
  'goalie.intro': 'Practice rink: drag the goalie and the ball, turn with ↺ ↻ or Q / E.',
  'goalie.card.toggle': 'Show or hide {card}',
  'goalie.turn.left': 'Turn the goalie left',
  'goalie.turn.right': 'Turn the goalie right',
  'goalie.openAsPlay': 'Open as play',
  'goalie.source.text': 'Positioning after the J+S / swiss unihockey goalie module.',
  'goalie.source.link': 'Open the module',

  'goalie.kata.body': 'Body (Körper)',
  'goalie.kata.placement': 'Placement (Ausrichtung)',
  'goalie.kata.depth': 'Depth (Tiefe)',
  'goalie.kata.axis': 'Axis (Achse)',

  'goalie.marks': 'Marks',
  'goalie.focus': 'Focus goalie',
  'goalie.kata.title': 'KATA',
  'goalie.kata.action': 'Expected action',
  'goalie.kata.auto': 'Auto',
  'goalie.kata.coverage': '{pct} of the goal covered',
  'goalie.kata.pending': 'needs goalie poses',
  'goalie.kata.free': 'free',
  'goalie.kata.ok': 'ok',
  'goalie.kata.adjust': 'adjust',
  'goalie.side.left': 'left',
  'goalie.side.right': 'right',
  'goalie.side.on': 'on target',
  'goalie.hint.ok': 'Good position for this situation.',
  'goalie.hint.free': 'Ball far away: recover, the position does not matter yet.',
  'goalie.hint.placement.left': 'Step {m} m to your left.',
  'goalie.hint.placement.right': 'Step {m} m to your right.',
  'goalie.hint.depth.forward': 'Step {m} m forward: it shortens the angle.',
  'goalie.hint.depth.back': 'Step {m} m back towards the goal line.',
  'goalie.hint.axis.square.left': 'Turn {deg}° to your left to face the shot square.',
  'goalie.hint.axis.square.right': 'Turn {deg}° to your right to face the shot square.',
  'goalie.hint.axis.parallel.left': 'Turn {deg}° to your left: knees parallel to the goal line.',
  'goalie.hint.axis.parallel.right': 'Turn {deg}° to your right: knees parallel to the goal line.',

  'goalie.action.shot': 'Shot',
  'goalie.action.pass': 'Pass',
  'goalie.action.dribble': 'Dribble',

  'goalie.zones.toggle': 'Zones',
  'goalie.lines': 'Lines',
  'goalie.zones.labels': 'Labels',
  'goalie.zones.layer': 'Goalie zones',
  'goalie.zones.section': 'Goalie zones',
  'goalie.zone.ball': 'Ball zone: {zone}',
  'goalie.zone.awareness.name': 'Awareness zone',
  'goalie.zone.awareness.motto': 'Recover!',
  'goalie.zone.awareness.card': 'Your team has the ball in the other half. Stand up, move, take the load off your knees and let your concentration drop a little. Keep an eye open for a turnover.',
  'goalie.zone.attention.name': 'Attention zone',
  'goalie.zone.attention.motto': 'Stay patient!',
  'goalie.zone.attention.card': 'The opponents are coming into your half. Stay patient and neutral: centred, deep, axis parallel to the goal line. Read what comes next and help your defence with short calls.',
  'goalie.zone.danger.name': 'Danger zone',
  'goalie.zone.danger.motto': 'Full alert!',
  'goalie.zone.danger.card': 'The ball can reach the danger zone. Shot expected: step forward and square up to the shooting line. Pass expected: stay back with your knees parallel to the goal line, ready to move across.',
  'goalie.zone.slot.name': 'Slot',
  'goalie.zone.slot.motto': 'Full alert!',
  'goalie.zone.slot.card': 'The most dangerous area in front of the goal. Keep it in view from every position: a pass into the slot is the shot to fear most.',
  'goalie.zone.passing.name': 'Passing-first zone',
  'goalie.zone.passing.motto': 'Play the line!',
  'goalie.zone.passing.card': 'The ball is behind or beside the goal. Play the line: feet in the goal, knees parallel to the goal line, body and glances turned to the slot for the pass.',
  'goalie.zone.transition.name': 'Defensive transition',
  'goalie.zone.transition.motto': 'Wide awake!',
  'goalie.zone.transition.card': 'The opponents start a counter. Call early, stay on the shooting line: forward against the ball carrier, back against a player without the ball.',
};

const DE = {
  'goalie.title': 'Goalie-Training',
  'lang.label': 'Sprache',
  'goalie.intro': 'Übungsfeld: Goalie und Ball ziehen, drehen mit ↺ ↻ oder Q / E.',
  'goalie.card.toggle': '{card} ein- oder ausblenden',
  'goalie.turn.left': 'Goalie nach links drehen',
  'goalie.turn.right': 'Goalie nach rechts drehen',
  'goalie.openAsPlay': 'Als Spielzug öffnen',
  'goalie.source.text': 'Positionierung nach dem J+S-/swiss-unihockey-Lernmodul für Goalies.',
  'goalie.source.link': 'Zum Lernmodul',

  'goalie.kata.body': 'Körper',
  'goalie.kata.placement': 'Ausrichtung',
  'goalie.kata.depth': 'Tiefe',
  'goalie.kata.axis': 'Achse',

  'goalie.marks': 'Markierungen',
  'goalie.focus': 'Goalie fokussieren',
  'goalie.kata.title': 'KATA',
  'goalie.kata.action': 'Erwartete Aktion',
  'goalie.kata.auto': 'Auto',
  'goalie.kata.coverage': '{pct} des Tors abgedeckt',
  'goalie.kata.pending': 'braucht Goalie-Posen',
  'goalie.kata.free': 'frei',
  'goalie.kata.ok': 'ok',
  'goalie.kata.adjust': 'anpassen',
  'goalie.side.left': 'links',
  'goalie.side.right': 'rechts',
  'goalie.side.on': 'im Ziel',
  'goalie.hint.ok': 'Gute Position für diese Situation.',
  'goalie.hint.free': 'Ball weit weg: erholen, die Position spielt noch keine Rolle.',
  'goalie.hint.placement.left': '{m} m nach links verschieben.',
  'goalie.hint.placement.right': '{m} m nach rechts verschieben.',
  'goalie.hint.depth.forward': '{m} m nach vorne: Das verkürzt den Winkel.',
  'goalie.hint.depth.back': '{m} m zurück Richtung Torlinie.',
  'goalie.hint.axis.square.left': '{deg}° nach links drehen, frontal zur Schusslinie.',
  'goalie.hint.axis.square.right': '{deg}° nach rechts drehen, frontal zur Schusslinie.',
  'goalie.hint.axis.parallel.left': '{deg}° nach links drehen: Knie parallel zur Torlinie.',
  'goalie.hint.axis.parallel.right': '{deg}° nach rechts drehen: Knie parallel zur Torlinie.',

  'goalie.action.shot': 'Schuss',
  'goalie.action.pass': 'Pass',
  'goalie.action.dribble': 'Dribbling',

  'goalie.zones.toggle': 'Zonen',
  'goalie.lines': 'Linien',
  'goalie.zones.labels': 'Beschriftung',
  'goalie.zones.layer': 'Goalie-Zonen',
  'goalie.zones.section': 'Goalie-Zonen',
  'goalie.zone.ball': 'Ballzone: {zone}',
  'goalie.zone.awareness.name': 'Awareness-Zone',
  'goalie.zone.awareness.motto': 'Erholen!',
  'goalie.zone.awareness.card': 'Dein Team hat den Ball in der gegnerischen Hälfte. Aufstehen, bewegen, die Knie entlasten und die Konzentration bewusst etwas senken. Einen Ballverlust trotzdem im Blick behalten.',
  'goalie.zone.attention.name': 'Attention-Zone',
  'goalie.zone.attention.motto': 'Geduldig bleiben!',
  'goalie.zone.attention.card': 'Das gegnerische Team kommt in deine Hälfte. Geduldig und neutral bleiben: mittig, tief, Achse parallel zur Torlinie. Lesen, was als Nächstes kommt, und die Verteidigung mit kurzen Kommandos unterstützen.',
  'goalie.zone.danger.name': 'Danger-Zone',
  'goalie.zone.danger.motto': 'Hochspannung!',
  'goalie.zone.danger.card': 'Der Ball kann in die Danger-Zone kommen. Schuss erwartet: nach vorne und frontal zur Schusslinie. Pass erwartet: tief bleiben, Knie parallel zur Torlinie, bereit zur Verschiebung (Verschiebungsvorbereitung).',
  'goalie.zone.slot.name': 'Slot',
  'goalie.zone.slot.motto': 'Hochspannung!',
  'goalie.zone.slot.card': 'Der gefährlichste Bereich vor dem Tor. Aus jeder Position im Blick behalten: Ein Pass in den Slot ist die grösste Gefahr.',
  'goalie.zone.passing.name': 'Passing-First-Zone',
  'goalie.zone.passing.motto': 'Linie spielen!',
  'goalie.zone.passing.card': 'Der Ball ist hinter oder neben dem Tor. Linie spielen: Füsse im Tor, Knie parallel zur Torlinie, Fläche und Blick zum Slot für den Pass.',
  'goalie.zone.transition.name': 'Defensiv-Transition',
  'goalie.zone.transition.motto': 'Hellwach!',
  'goalie.zone.transition.card': 'Das gegnerische Team lanciert einen Konter. Früh kommunizieren, auf der Schusslinie bleiben: vorne gegen die ballführende Person, hinten gegen eine Person ohne Ball.',
};

export const TEXT = Object.freeze({ en: Object.freeze(EN), de: Object.freeze(DE) });

// Distinct {name} placeholders in a string, sorted.
export function placeholdersOf(s) {
  return [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

// The string for key in lang, {vars} filled in. Falls back to English, then
// to the key itself, so a gap shows up on screen instead of as a blank.
// `table` is for tests.
export function text(key, lang, vars, table = TEXT) {
  const s = table[lang]?.[key] ?? table.en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}

// First default: the browser's first language, de* -> German, else English.
export function defaultLang(languages) {
  const first = Array.isArray(languages) ? languages[0] : null;
  return typeof first === 'string' && first.toLowerCase().startsWith('de') ? 'de' : 'en';
}

// A stored choice wins when it is a known language; anything else -> default.
export function parseLang(stored, languages) {
  return LANGS.includes(stored) ? stored : defaultLang(languages);
}
