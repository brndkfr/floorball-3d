// Fails CI if the staged deploy artifact (dist/) or the source it minifies
// from (web/src) grows past a budget. Catches an accidentally-committed
// large asset (a raw photo, an unquantized model) before it ships.
// Budgets are deliberately generous - this is a tripwire, not a target.
// Set from this repo's actual measured sizes at the time this script was
// written (dist ~55.5MB, dist/assets ~6.5MB, web/src ~0.65MB) plus
// headroom, not copied from an external estimate.

import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const BUDGETS_MB = {
  dist: 70,
  'dist/assets': 8,
  'web/src': 1.0,   // raised from 0.8 on 2026-09-24 (was at 0.78 before A-BACK-022 shots)
};

function dirSizeBytes(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    total += st.isDirectory() ? dirSizeBytes(full) : st.size;
  }
  return total;
}

let failed = false;
for (const [rel, budgetMb] of Object.entries(BUDGETS_MB)) {
  const dir = join(ROOT, rel);
  let bytes;
  try {
    bytes = dirSizeBytes(dir);
  } catch (e) {
    console.warn(`check-size: skipping "${rel}" (${e.code === 'ENOENT' ? 'not found' : e.message})`);
    continue;
  }
  const mb = bytes / (1024 * 1024);
  const ok = mb <= budgetMb;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${rel}: ${mb.toFixed(2)} MB (budget ${budgetMb} MB)`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('check-size: one or more budgets exceeded');
  process.exit(1);
}
