# S-BACK-032 to 035 - Screenshot and an MCP server in the app

Status: open. Added 2026-11-16. Step tags `[small]` / `[lead]` as in
[S-BACK-030](S-BACK-030-3d-look.md). Every step is one PR and follows
the TDD workflow in [CLAUDE.md](../../CLAUDE.md).

## Why

The user wants AI help across the whole app (A-Q-013) and a one-click
picture of what is on screen, in every mode (A-Q-014). The screenshot is
also the first MCP tool: Claude sees the same image the user would save.

## Decisions (2026-11-16)

- **A-Q-013 MCP shape:** the MCP server lives in the app (tool
  definitions and handlers run in the open tab, with the code the
  buttons use); a thin relay connects it to MCP clients, because a web
  page cannot accept incoming connections. Local relay first (a small
  script registered in Claude Desktop / Claude Code); a cloud relay
  only if the app should be used from claude.ai or a tablet. WebMCP
  (browser-native page tools) later, when it is stable.
- **A-Q-014 Screenshot:** the whole app (Plan, Analyze, Train,
  Present; 2D and 3D). Defaults: "with labels" (HTML overlays painted
  in), a click saves a PNG; a small menu offers Copy to clipboard and
  Clean (rink only). Optional caption strip.

## Items

### S-BACK-032 - Screenshot, whole app `[small]`

- A camera button in the top bar, visible in every mode (not
  `data-view`-tagged), plus a shortcut; a small menu: Save PNG (default),
  Copy to clipboard, Clean.
- The image is the WebGL frame (rendered once on demand, like
  `exportPng`) with the visible HTML overlays painted on top from the
  same data the screen uses: zone tags (A-BACK-048), the hint pill
  (A-BACK-054), chip labels where they are HTML. Floating cards and
  the app chrome are not in it; an optional caption strip carries the
  zone and the worst KATA dimension in Train.
- Pure part (Node-tested): file name from date and mode, the overlay
  draw list (what to paint where, in canvas pixels, with device pixel
  ratio), the caption text.
- e2e: the button exists in each mode, a click downloads a PNG of the
  stage size, Clean leaves out the overlays, Copy writes an image to
  the clipboard (Chromium permission).

### S-BACK-033 - Command layer `[lead]`

The app's actions as typed commands with JSON-schema inputs, run by the
same code as the UI: plays and frames (create, add / move / remove
players, carrier, pass, shot, frames, timing), Train and the goalie
(enter, place, turn, action, KATA readout), camera (presets, focus,
2D / 3D), screenshot, projects (open, save as, share link), Analyze
(load photo, landmarks, solve, insights), export. Pure dispatch and
schema checks are Node-tested; each command gets an e2e check.

### S-BACK-034 - MCP server in the app + local relay `[lead]`

- In the app: an MCP server over the command layer (tools/list,
  tools/call, image results for screenshots), reached through an
  outgoing WebSocket to the relay.
- "Connect AI" in the app: off by default, a pairing code shown by the
  relay must be typed into the app; the connection ends when the tab
  closes or the user disconnects. Commands that overwrite a saved
  project ask in the app first.
- Relay: a small Node script (stdio MCP to the client, WebSocket to the
  tab, `localhost` only), no floorball logic, so it rarely changes.
- Limits: a tab must be open and connected; screenshots need it
  visible (rAF pauses in hidden tabs); Safari is stricter about pages
  reaching `localhost` than Chrome / Edge.

### S-BACK-035 - Cloud relay `[small]` (optional)

Only if the app should be used from claude.ai or a tablet: the relay as
a small hosted service with proper sign-in; the app connects out to it.

## Order

S-BACK-032 -> S-BACK-033 -> S-BACK-034 -> (S-BACK-035).
