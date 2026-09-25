// Broadcast app shell size (S-BACK-021, design canvas "Plan"): a 64 px left
// rail and a 52 px top bar. Mirrored as --shell-rail / --shell-topbar in
// app.css (test/shell-metrics.test.js keeps both in step). Floating panels
// clamp against SHELL_RESERVED so they never slide under the shell.
export const SHELL = { rail: 64, topbar: 52, gap: 8 };
export const SHELL_RESERVED = {
  top: SHELL.topbar + SHELL.gap,
  left: SHELL.rail + SHELL.gap,
  right: SHELL.gap,
  bottom: SHELL.gap,
};
