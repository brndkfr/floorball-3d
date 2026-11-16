// Train's floating cards (A-BACK-054, layout A): which are collapsed to their
// header, remembered per browser. Pure so it is Node-testable; train-mode.js
// applies it to the DOM.

export const TRAIN_CARDS = ['zone', 'kata'];
export const TRAIN_CARDS_STORAGE_KEY = 'floorball3d.trainCards';
const DEFAULT = Object.freeze({ zone: false, kata: false });   // true = collapsed

export function parseTrainCards(stored) {
  let raw = null;
  try { raw = JSON.parse(stored); } catch { /* not JSON: defaults */ }
  const out = { ...DEFAULT };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of TRAIN_CARDS) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  }
  return out;
}

export function toggleTrainCard(cards, key) {
  if (!TRAIN_CARDS.includes(key)) return cards;
  return { ...cards, [key]: !cards[key] };
}
