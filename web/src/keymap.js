// Single source of truth for the shortcuts/tips overlay's content
// (help.js). The 4 real window-level keydown handlers - controls.js,
// dock.js, timeline.js, help.js itself - are NOT generated from this list;
// merging their closures into one dispatcher was looked at for S-BACK-003
// and ruled out as too risky to attempt blind, without a browser to
// regression-test in. What this file fixes instead: help.js used to
// hand-maintain its own copy of the shortcut text, independent of what the
// handlers actually did, and it had already drifted - controls.js's 'F'
// (reset top-down view) and dock.js's Ctrl+Shift+Z (alt redo) were both
// real, working shortcuts missing from the overlay. Centralizing the
// *display* list here means adding a new shortcut to a handler and
// forgetting to add it here is still possible, but at least there's one
// place to check/update instead of a paragraph buried in help.js's innerHTML.
export const KEY_SECTIONS = [
  {
    title: '2D Plan mode (RTS controls)',
    entries: [
      ['left-click', 'select object &middot; on empty floor = deselect (or place with active tool)'],
      ['left-drag chip', 'move that chip under the cursor'],
      ['right-click floor', 'move-command: selected chip / ball / goalie walks there'],
      ['right-click tool', 'cancel the active tool (chip stamp, arrow, zone, text)'],
      ['right-drag / middle-drag', 'pan the top-down camera'],
      ['scroll', 'zoom in / out'],
      ['WASD / arrows', 'pan camera (never moves the selected item)'],
      ['F', 'reset zoom + pan to the fitted default (top-down only)'],
    ],
  },
  {
    title: '3D walking view',
    entries: [
      ['left-drag', 'look around (first-person)'],
      ['WASD / arrows', 'walk relative to look direction'],
      ['scroll', 'zoom / dolly'],
    ],
  },
  {
    title: 'Selection &amp; edit',
    entries: [
      ['Q / E', 'rotate the selected goalie (Shift = fine)'],
      ['Tab / Shift+Tab', 'cycle selection'],
      ['Esc', 'cancel active tool &middot; second press = deselect'],
      ['Del / Backspace', 'remove selected chip or shape'],
    ],
  },
  {
    title: 'Tool hotkeys',
    entries: [],
    note: 'Click the tool palette on the left. Number-key hotkeys are reserved for playback speed.',
  },
  {
    title: 'Authoring dock',
    entries: [
      ['3D / 2D', 'toggle first-person and top-down camera'],
      ['T1 / T2', 'flip active team (chip color)'],
      ['color swatch', 'pick color for next shape or the selected shape'],
    ],
  },
  {
    title: 'Timeline &amp; playback',
    entries: [
      ['Space', 'play / pause'],
      [', / .', 'step to previous / next keyframe'],
      ['R', 'toggle loop'],
      ['1-9', 'set playback speed'],
      ['+', 'append a new keyframe (copy of current)'],
      ['&#9744;', 'set / clear a camera keyframe on that frame'],
      ['duration', 'per-frame in the small ms box'],
    ],
  },
  {
    title: 'Choreograph mode (draft the next frame)',
    entries: [
      ['Choreo', "timeline button. Duplicates the current frame as a draft <em>N+1</em>, snapshots every chip's position, then shows a cyan ring at each snapshot with a live line to the chip's new position."],
      ['drag chips', "move each chip to where it should end up. Right-click move-commands and walk-tweens also work. Arrows appear as chips leave their starting rings."],
      ['Commit', 'keep the new frame and exit (green banner button).'],
      ['Cancel / Esc', 'delete the draft frame and return to N (red banner button).'],
    ],
    note: "Plan a play by seeing before / after positions side by side. Use it when the current frame is your <em>starting</em> position and you want to draft where each player runs next.",
  },
  {
    title: 'Save / share / export',
    entries: [
      ['Ctrl+Z / Ctrl+Y', 'undo / redo (Ctrl+Shift+Z also redoes)'],
      ['&hellip;', 'Save / Load / Export JSON / Import JSON / Copy share link / Export video'],
      ['share link', 'copies a URL with the whole scheme embedded (up to ~32 KB, JSON download otherwise)'],
    ],
  },
  {
    title: 'Help',
    entries: [
      ['?', 'open this dialog'],
    ],
  },
];
