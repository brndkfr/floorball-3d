// Playwright config for the browser-level integration suite (S-BACK-014).
// Only Chromium: the app depends on the CompressionStream API (share.js)
// and the Chromium module-cache behaviour that CLAUDE.md documents;
// covering Firefox/WebKit would require different workarounds and is not
// worth it for this deploy target (GitHub Pages, evergreen users).

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test-e2e',
  fullyParallel: false, // shared localStorage state per browser context
  // Every test boots the whole WebGL app: 6 local workers produced load-induced
  // timeouts that passed serially (S-BACK-018). CI keeps Playwright's default.
  workers: process.env.CI ? undefined : 3,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'retain-on-failure',
    // Chromium module-cache is aggressive - see CLAUDE.md - individual
    // specs still bounce through about:blank + CDP setCacheDisabled when
    // they reload after seeding localStorage.
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node scripts/serve-static.mjs',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
