# A-BACK-033 / A-BACK-034 - Player figure kit (jersey, number, stick)

Status: A-BACK-033 open, parked. A-BACK-034 in progress: the stick
asset shipped in PR #10, wiring it to the figures is open. A-BACK-031 (static figures) and A-BACK-032
(animation) are shipped (PRs #7, #8; code in
[figures.js](../../web/src/authoring/figures.js), `figure-math.js`,
`figure-gait.js`). The original 031 / 032 specs are in
[archive/plan-2026-10.md](../archive/plan-2026-10.md).

Facts that still apply:

- Body: the free Quaternius "Universal Base Characters" tier contains
  only the Superhero male + female (checked in the zip, 2026-10-07). No
  Regular or Teen body is free; the SOURCE tier ($19.99) has them.
  Swapping bodies is a re-run of `generators/prepare_player_figure.mjs`.
- Animations: Quaternius "Universal Animation Library" (same rig). No
  stick, shot or goalie moves; no backwards / sideways running in the
  free tier.
- Quaternius has no sticks and only fantasy outfits, so jersey and stick
  are our own.

Spec as drafted (moved unchanged from the old plan):

- **[A-BACK-033]** [open] [blocked-by: A-BACK-031] **Jersey, shorts
  and back number.**
  - Jersey + shorts derived from the body in Blender: duplicate the
    torso / upper arm / hip faces, push outwards (Solidify or
    Shrink/Fatten); the copy keeps the body's skin weights, so it moves
    with every animation. UV the back for a number. Script it as
    `generators/generate_player_jersey.py` (Blender headless,
    `blender -b -P`), feeding `prepare_player_figure.mjs`, so it can be
    regenerated. Expect 1-2 fitting rounds (sleeves, hem); render
    preview images for review. A Blender MCP (e.g. ahujasid/blender-mcp)
    makes the fitting interactive on a desktop; optional, not required.
  - Runtime: jersey / shorts materials cloned once per team and tinted
    from tokens.js (two shared clones, not one per player); back number
    drawn per player into a `CanvasTexture`, same number as the chip.
    Optional logo / stripes on the same canvas later.
  - Fallback if Blender is too much: tint body regions (torso team
    colour, legs dark) and keep the number above the head.
  - Tests: node test for the number-texture layout helper; e2e: home
    and away figures have different jersey colours, the back-number
    texture follows a renumber.
- **[A-BACK-034]** [in-progress] **Floorball stick.**
  Own generator `generators/generate_stick.py` like ball and goal.
  - Done (PR #10, asset only - the app does not load it yet):
    - [generate_stick.py](../../generators/generate_stick.py) writes
      `assets/floorball_stick.obj/.mtl`. Checked against the SPCR 011
      (2024) PDF, section 2.1.3 and drawings B1/B2: stick <= 1140 mm,
      shaft <= 35 mm, grip line 375 +/- 20 mm, blade <= 270 mm long,
      height 72-80 mm (a real number after all), >= 8 mm thick, edge
      radius >= 2 mm, bottom-edge radius <= 270 mm, concavity <= 12 mm,
      penetration depth <= 20 mm (50 mm cup on the toe - the "hook
      <= 30 mm" from the earlier chat was wrong), 60 deg lie.
    - Model: 920 mm stick, 28 mm shaft, blade 76 high / 9 thick /
      10 mm concavity / 270 mm bottom radius; length, shaft and outline
      are commented estimates. Origin = blade floor-contact point.
    - Blade holes in the style of a Fat Pipe blade, traced by eye from
      a product photo; every hole corner rounded >= 2 mm.
    - Part colours: `--blade/--shaft/--grip/--grip-line/--knob` on the
      generator, and `applyStickColors(stick, {...})` in
      [stick-colors.js](../../web/src/stick-colors.js) for per-stick
      runtime colours (clones shared template materials).
    - Tests: `test/stick-asset.test.js` (IFF dimensions, perforation,
      closed rim), `test/stick-colors.test.js`.
  - Done (stick in the hands, decided 2026-10-16: left-handed default
    with a per-player toggle, two hands at all speeds):
    - Not parented to the hand bone: the gait clips swing the arms, so
      the stick would fly around. The stick is placed relative to the
      figure (blade on the floor, front and stick side) and both arms
      are bent onto it each pose ([figure-stick.js](../../web/src/authoring/figure-stick.js),
      math in [stick-pose.js](../../web/src/authoring/stick-pose.js)).
    - The clips are upright (hands hang at ~0.96 m, out of reach of a
      floor-planted stick), so a ready stance is layered on top: pelvis
      down 240 mm with the legs re-bent to keep the feet planted, spine
      lean 40 deg, shoulders turned 20 deg toward the stick. All
      look-based estimates.
    - The idle clip leans asymmetrically, so the bottom hand slides up
      the shaft when its planned grip is out of reach (min 100 mm hand
      spacing). Right-handed standing ends at ~130-160 mm, the rest at
      the planned 220 mm.
    - Handedness: `player.hand` ('R' stored, 'L' default not stored),
      set on every frame; Stick L / R in the chip popover; right-handed
      players get the stick mirrored.
    - Loaded with the figures only (not at boot).
    - Tests: `test/stick-pose.test.js`, `test-e2e/player-stick.spec.js`
      (hands on the shaft, blade on the floor, L and R, standing / jog /
      sprint, toggle, lazy load).
  - Open:
    - Tuning: running poses lean far (clip lean + stance lean); the top
      arm crosses the chest for right-handed players. A real reference
      stance (photos) would help.
    - Hand bones are not rotated to wrap the shaft (fingers point along
      the forearm).
    - Default colours per team from `tokens.js`; optionally per-player
      colours (then it is doc data).
    - Asset budget: OBJ ~520 KB, loaded with the figures; recheck when
      S-BACK-026 converts assets to GLB.
