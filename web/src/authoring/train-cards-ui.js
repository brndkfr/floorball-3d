// Collapsed / open state of Train's floating cards (A-BACK-054, layout A),
// loaded from and saved to this browser (train-cards.js holds the pure
// rules). Fires `trainCardsChanged` on window; each card applies it itself.

import { TRAIN_CARDS_STORAGE_KEY, parseTrainCards, toggleTrainCard } from '../train-cards.js';

let stored = null;
try { stored = localStorage.getItem(TRAIN_CARDS_STORAGE_KEY); } catch { /* storage blocked: all open */ }
let cards = parseTrainCards(stored);

export const isCardCollapsed = (key) => !!cards[key];

export function toggleCard(key) {
  const next = toggleTrainCard(cards, key);
  if (next === cards) return;
  cards = next;
  try { localStorage.setItem(TRAIN_CARDS_STORAGE_KEY, JSON.stringify(cards)); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('trainCardsChanged'));
}
