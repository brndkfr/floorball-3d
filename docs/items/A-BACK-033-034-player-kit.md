# A-BACK-033 / A-BACK-034 - Player figure kit (jersey, number, stick)

Status: open, parked. A-BACK-031 (static figures) and A-BACK-032
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
- **[A-BACK-034]** [open] [blocked-by: A-BACK-031] **Floorball stick.**
  Own generator `generators/generate_stick.py` like ball and goal,
  attached to the right-hand bone at runtime.
  - IFF Material Regulations SPCR 011 (2024),
    https://archive.floorball.sport/cloudfront/2024/06/Material-Regulations-SPCR011_2024_Final.pdf,
    per an earlier chat, verify against the PDF before using: blade
    <= 270 mm long, >= 8 mm thick, edge radius >= 2 mm, concavity
    <= 12 mm, hook <= 30 mm; blade height is checked with a gauge (no
    single number); stick <= 1140 mm total (least sure of this one).
  - Model a typical blade (270 mm, 8-10 mm thick, ~15-20 mm hook) and
    a shaft fitted to the body height (~850-920 mm for Teen); these are
    estimates, commented as such.
  - Left / right handedness: open.
  - Tests: python-side dimension asserts in the generator like the
    other generators; e2e: stick present and parented to the hand bone.
