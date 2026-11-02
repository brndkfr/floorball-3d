// The two fixed rink goals and their goalies as layers. Pure: the object
// list and the doc.hiddenFixed helpers. doc.hiddenFixed is a project-level
// list of the hidden keys (not per frame, like doc.zones), so a hidden
// goalie stays hidden across frames, reloads, exports and share links, and
// no per-frame write-back of scheme.goalies can drop it (S-BACK-024).
// Absent on older projects, which then show everything.

export const FIXED_OBJECTS = [
  { key: 'goalA', end: 'A', kind: 'goal' },
  { key: 'goalB', end: 'B', kind: 'goal' },
  { key: 'goalieA', end: 'A', kind: 'goalie' },
  { key: 'goalieB', end: 'B', kind: 'goalie' },
];

const KEYS = FIXED_OBJECTS.map((o) => o.key);

// Known keys only, each once, in FIXED_OBJECTS order; anything else is [].
export function sanitizeHiddenFixed(raw) {
  if (!Array.isArray(raw)) return [];
  return KEYS.filter((k) => raw.includes(k));
}

export function isFixedShown(hidden, key) {
  return !(Array.isArray(hidden) && hidden.includes(key));
}

export function withFixedShown(hidden, key, shown) {
  const set = new Set(sanitizeHiddenFixed(hidden));
  if (!KEYS.includes(key)) return [...set];
  if (shown) set.delete(key); else set.add(key);
  return sanitizeHiddenFixed([...set]);
}
