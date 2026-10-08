// Analyze step 4 (design canvas "Insights"): turn a recomputeInsights()
// result into a verdict pill and the 2x2 stat grid. Pure, no DOM.
//
// Tone thresholds are estimates, not sourced numbers: under half the goal
// covered reads as good for the shooter, and at least one clear pass as good.

const VERDICTS = {
  'blocked-centred': { tone: 'bad', label: 'Blocked', detail: 'goalie square on the shooting line' },
  'blocked-off': { tone: 'warn', label: 'Partly blocked', detail: 'goalie on the line but off-centre' },
};
const ANGLE = {
  on: { tone: 'good', label: 'On target', detail: 'clear lane past the goalie' },
  'near-miss': { tone: 'warn', label: 'Sharp angle', detail: 'clear lane, tight angle to goal' },
  off: { tone: 'bad', label: 'Off target', detail: 'almost along the goal line' },
};

export function insightStats({ shot, coveragePct, passes = [] }) {
  const verdict = VERDICTS[shot.lineColor] ?? ANGLE[shot.onTarget] ?? ANGLE.on;
  const clear = passes.filter((p) => p.clear).length;
  const hasCov = coveragePct != null && Number.isFinite(coveragePct);
  const cells = [
    { key: 'angle', value: String(Math.round(shot.angleDeg)), unit: '°', label: 'angle to goal' },
    { key: 'distance', value: (shot.distance / 1000).toFixed(1), unit: 'm', label: 'shot distance' },
    {
      key: 'coverage', value: hasCov ? String(Math.round(coveragePct)) : '-', unit: hasCov ? '%' : '',
      label: 'goal covered', tone: hasCov ? (coveragePct < 50 ? 'good' : 'bad') : undefined,
    },
    {
      key: 'passes', value: String(clear), unit: `/ ${passes.length}`, label: 'clear passes',
      tone: passes.length ? (clear > 0 ? 'good' : 'bad') : undefined,
    },
  ];
  const text = [
    verdict.label,
    `angle ${cells[0].value}°`,
    `distance ${cells[1].value} m`,
    `goal covered ${hasCov ? cells[2].value + '%' : '-'}`,
    `clear passes ${clear} / ${passes.length}`,
  ].join(' - ');
  return { verdict, cells, text };
}

// Fill the step 4 block (#photoInsightsStats) from a recomputeInsights()
// result; null hides it. Built with textContent only - no HTML strings.
export function renderInsightStats(root, result) {
  if (!result) { root.hidden = true; root.replaceChildren(); return; }
  const { verdict, cells, text } = insightStats(result);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const head = el('div', 'ps-verdict');
  const pill = el('span', 'ps-vpill', verdict.label);
  pill.dataset.tone = verdict.tone;
  head.append(pill, el('span', 'ps-vdetail', verdict.detail));
  const grid = el('div', 'ps-stat-grid');
  for (const c of cells) {
    const cell = el('div', 'ps-stat');
    cell.dataset.key = c.key;
    const v = el('div', 'ps-stat-v', c.value);
    if (c.tone) v.dataset.tone = c.tone;
    if (c.unit) v.append(el('small', null, c.unit === '°' ? c.unit : ` ${c.unit}`));
    cell.append(v, el('div', 'ps-stat-t', c.label));
    grid.append(cell);
  }
  root.setAttribute('aria-label', text);
  root.replaceChildren(head, grid);
  root.hidden = false;
}
