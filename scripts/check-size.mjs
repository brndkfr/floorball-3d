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
  'dist/assets': 3,            // 1.81 MB after the goalie became a GLB (S-BACK-026, 2026-11-15)
  // Raised from 0.8 on 2026-09-24 (was at 0.78 before A-BACK-022 shots) and
  // from 1.0 on 2026-11-15 (0.99 after the camera work, A-BACK-040; the
  // largest files are source, photo-overlay.js 94 KB, app.css 56 KB, not
  // an asset). Still a tripwire for a committed photo or model, not a target.
  'web/src': 1.3,
  // Vendored by scripts/vendor-*.mjs (S-BACK-021). A jump here means the
  // Web Awesome COMPONENTS list or the font weights grew - check that first.
  'web/lib/webawesome': 1.0,   // 0.60 MB when added (23 components)
  'web/lib/fonts': 0.2,        // 0.09 MB when added (6 latin woff2)
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
