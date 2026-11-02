// User-facing names for the two goal ends. Code and saved data keep 'A' / 'B'
// (scheme.goalies.A, landmark ids, ...); home defends goal A, away goal B.
export const END_NAMES = { A: 'Home', B: 'Away' };

export function endName(end) {
  return END_NAMES[end] ?? end;
}

// Mode A: a fixed goal goes by its label (renamable per frame), else its end name.
export function goalName(scheme, end) {
  const label = scheme?.goals?.fixed?.[end]?.label?.trim();
  return label || endName(end);
}
