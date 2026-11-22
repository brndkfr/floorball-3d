# S-BACK-032 to 035 - Screenshot and an MCP server in the app

Status: in progress (033 first slice, 034 local relay built
2026-11-22). Added 2026-11-16. Step tags `[small]` / `[lead]` as in
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

Design (2026-11-21, first slice):
- `web/src/commands/registry.js`, pure: `defineCommand({ name,
  description, input, run })`, `listCommands()` (name, description,
  input schema: what MCP `tools/list` will return), `runCommand(name,
  input)` resolving to `{ ok: true, result }` or `{ ok: false, error }`.
  It never throws: an unknown name, bad input and a handler that throws
  all come back as `ok: false` with a message.
- Input schemas are a small JSON-schema subset checked by a built-in
  validator (no dependency): `type` (object, string, number, integer,
  boolean), `properties`, `required`, `additionalProperties: false`,
  `enum`, `minimum`, `maximum`. Missing input means `{}`.
- `web/src/commands/app-commands.js` defines the app's commands and is
  imported from `authoring/index.js`. Handlers call the functions the UI
  uses (openLesson, the drag's mesh move + tickActors, seekTo / stop,
  updateKataReadout, captureStage); no logic of their own.
- Progress (2026-11-21): registry, validator and the first slice built
  (`test/commands-registry.test.js`, `test-e2e/commands.spec.js`). Not
  yet: undo integration, overwrite confirmation, the rest of the list
  above.
- Names are `area.verb`. First slice: `lesson.open`, `goalie.place`,
  `playback.seek`, `playback.stop`, `kata.read`, `screenshot.take`.

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

Design (2026-11-22, built; how to run it: README, "Driving the app from
Claude (MCP)"):
- Processes: the MCP client starts `node scripts/mcp-relay/main.mjs`
  (stdio, newline-delimited JSON-RPC). The relay answers `initialize`
  and `ping` itself and forwards `tools/list` / `tools/call` to the
  paired tab under its own request ids; it sends
  `notifications/tools/list_changed` when a tab connects or leaves.
  Without a tab the tool list is empty and a call explains how to pair.
- In the tab: `web/src/commands/mcp-server.js` (pure) turns
  `listCommands()` into tools and `runCommand()` results into MCP
  content; a result with a base64 image data URL becomes an image block
  (`screenshot.take`). Tool names are `area_verb` (API tool names allow
  no dot); `bridge.js` holds the WebSocket and runs requests one at a
  time.
- Connect AI: an **AI** button in the top bar, every mode
  (`web/src/ui/ai-connect.js`). It asks for the pairing code and only
  then loads `bridge.js` and connects to `ws://127.0.0.1:<port>`;
  nothing is stored, so a reload or a closed tab ends it. A
  Node test pins that only `bridge.js` creates a WebSocket and nothing
  imports it statically.
- Security: the relay binds 127.0.0.1; the handshake needs an app
  Origin (`http://localhost[:port]`, `http://127.0.0.1[:port]`,
  `https://brndkfr.github.io`) and a loopback Host (DNS rebinding);
  the first message must carry the pairing code (8 characters, 40 bits,
  new per relay start, compared in constant time) within 10 s; ten
  wrong codes lock pairing until a restart; a newer paired tab replaces
  the older one. The code reaches the user through the relay's MCP
  `instructions` (Claude can tell it) and its stderr log.
- No dependency: a ~150-line RFC 6455 server side (`ws.mjs`: text
  frames, fragments, ping, close, 32 MB limit, masks required) instead
  of the `ws` package, like `serve-static.mjs`. `scripts/` is not part
  of `dist/`.
- Tests: `test/mcp-server.test.js`, `test/mcp-relay.test.js`,
  `test-e2e/mcp-bridge.spec.js` (relay in the test process, pairing
  through the button, all four tool kinds end to end).
- Open, decided when editing commands exist (2026-11-22): (1) one
  Ctrl+Z per command through the history; (2) a registry-enforced
  `confirm: true` flag for commands that overwrite a saved project, or
  handlers asking in the app (the bullet above); (3) keeping `area.verb`
  names (they travel as `area_verb` tool names).

### S-BACK-035 - Cloud relay `[small]` (optional)

Only if the app should be used from claude.ai or a tablet: the relay as
a small hosted service with proper sign-in; the app connects out to it.

## Order

S-BACK-032 -> S-BACK-033 -> S-BACK-034 -> (S-BACK-035).
