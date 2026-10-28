// Swiss Way tactical zones as layers (A-BACK-039). Pure: the zone list and
// the doc.zones helpers. doc.zones is a project-level list of the zone keys
// that are shown (not per frame), so a play about the pocket opens with the
// pocket on, in exports and share links too. Absent on older projects,
// which then show no zones.
//
// Not an IFF spec: the zones are estimated from the swissunihockey.ch
// coaching lexicon (generators/generate_tactical_zones.py). `mtl` is the
// material and object name in web/assets/tactical_zones.{obj,mtl}; `color`
// is the legend swatch.

export const ZONES = [
  { key: 'slotNear', mtl: 'SlotNear', label: 'naher Slot', color: '#f27366' },
  { key: 'slotHigh', mtl: 'SlotHigh', label: 'hoher Slot', color: '#ff8c0d' },
  { key: 'pocket', mtl: 'Pocket', label: 'Tasche (pocket)', color: '#4073bf' },
  { key: 'playmaker', mtl: 'Playmaker', label: 'Playmaker Position', color: '#26bf59' },
  { key: 'centreLine', mtl: 'ZentralLine', label: 'Zentrallinie', color: '#f2d926' },
];

const KEYS = ZONES.map((z) => z.key);

// Known keys only, each once, in ZONES order; anything else is [].
export function sanitizeZones(raw) {
  if (!Array.isArray(raw)) return [];
  return KEYS.filter((k) => raw.includes(k));
}

export function isZoneVisible(zones, key) {
  return Array.isArray(zones) && zones.includes(key);
}

export function withZone(zones, key, visible) {
  const set = new Set(sanitizeZones(zones));
  if (!KEYS.includes(key)) return [...set];
  if (visible) set.add(key); else set.delete(key);
  return sanitizeZones([...set]);
}
