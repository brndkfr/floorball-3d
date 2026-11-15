// Which browser the local e2e run uses (S-BACK-022). Pure, so
// test/e2e-browser.test.js can pin it; playwright.config.js calls it.
//
// The bundled Playwright Chromium on Windows is x64 only and renders WebGL
// in software (SwiftShader). On an ARM64 machine (Snapdragon X) it runs
// under emulation too, and the suite timed out under load: 58 tests took
// 253 s with 5 timeouts at 3 workers, against 56 s and no failures with
// Edge (2026-11-15). Edge is Chromium, ships natively for ARM64 and draws
// on the GPU. CI always keeps the bundled Chromium and stays the gate.
//
// PW_CHANNEL overrides locally: "chromium" forces the bundled browser, any
// other value is passed to Playwright as the channel ("chrome", "msedge").

export const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

export function localBrowserChannel({ ci, platform, env, exists }) {
  if (ci) return undefined;
  if (env.PW_CHANNEL) return env.PW_CHANNEL === 'chromium' ? undefined : env.PW_CHANNEL;
  if (platform === 'win32' && EDGE_PATHS.some(exists)) return 'msedge';
  return undefined;
}
