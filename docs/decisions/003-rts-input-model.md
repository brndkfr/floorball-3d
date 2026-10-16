# 003 - RTS-style input model in Plan mode

Date: 2026 (shipped before IDs were tracked). Status: accepted, shipped.

## Context

The first authoring surface guessed between click and drag with a
movement threshold, which misfired on small chips and touchpads.

## Decision

One verb per mouse button, as in real-time strategy games
([selection.js](../../web/src/selection.js),
[controls.js](../../web/src/controls.js)):

- Left-click selects (chip, shape, ball, goalie, goal); on empty floor it
  deselects or places with the active tool.
- Left-drag on a selected object moves the whole selection; on empty
  top-down floor it draws a marquee.
- Right-click on empty floor is a move command for the selection (top-down
  only), with a short walk animation. Right-click with a tool active
  cancels the tool.
- Right / middle drag pans, wheel zooms, arrows / WASD pan the camera and
  never move the selection.
- Q / E rotate the selected goalie or extra goal.

## Consequences

- Number hotkeys `1..9` stay playback speeds, so tools have no number
  hotkeys.
- Moving a chip by keyboard is not possible, which blocks full keyboard
  access in the Choreo tutorial (step 2).
