// Shared Playwright fixtures. Specs import { test, expect } from here, not from
// '@playwright/test', so `pnpm test:e2e:record` can collect per-test JS coverage
// for the affected-test selector (S-BACK-018). Without E2E_COVERAGE this is a no-op.

import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { coverageToLines } from '../scripts/e2e-impact/impact.mjs';

const RECORD = !!process.env.E2E_COVERAGE;
const PARTS_DIR = path.resolve('test-e2e/.impact');

export const test = base.extend({
  // Auto fixture: writes one part per test, even for tests that never touch the
  // `page` fixture (e.g. a11y specs opening their own context) - those land in the
  // map without coverage and are always selected.
  impactPart: [async ({}, use, testInfo) => {
    const files = {};
    await use(files);
    if (!RECORD) return;
    const rel = path.relative(process.cwd(), testInfo.file).split(path.sep).join('/');
    const title = testInfo.titlePath.slice(1).join(' > ');
    const part = { test: { file: rel, line: testInfo.line, title }, files };
    fs.mkdirSync(PARTS_DIR, { recursive: true });
    const name = createHash('sha1').update(`${rel}:${testInfo.line}:${title}`).digest('hex').slice(0, 16);
    fs.writeFileSync(path.join(PARTS_DIR, `${name}.json`), JSON.stringify(part));
  }, { auto: true }],

  page: async ({ page, impactPart }, use) => {
    if (!RECORD) {
      await use(page);
      return;
    }
    // resetOnNavigation: false keeps what ran before a spec's reload / goto.
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    let entries = [];
    try { entries = await page.coverage.stopJSCoverage(); } catch { /* page closed by the test: no coverage, always-run */ }
    for (const entry of entries) {
      const { pathname } = new URL(entry.url);
      if (!pathname.startsWith('/src/') || entry.source == null) continue;
      (impactPart[`web${pathname}`] ??= []).push(...coverageToLines(entry.source, entry.functions));
    }
  },
});

export { expect };
