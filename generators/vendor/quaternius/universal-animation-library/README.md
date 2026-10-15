# Quaternius - Universal Animation Library (Standard, free)

Source: https://quaternius.com/packs/universalanimationlibrary.html
(price 0), downloaded 2026-10-07. License: CC0 1.0, see `License.txt`.
Animations by @Quaternius.

`gait_clips.glb` is not the download itself: it is the skeleton plus the
four clips the player figures use (`Idle_Loop`, `Walk_Loop`,
`Jog_Fwd_Loop`, `Sprint_Loop`), cut out of the 7.6 MB
`Unreal-Godot/UAL1_Standard.glb` (sha256 `69591853d817488e...`) by

    node generators/extract_gait_clips.mjs "<download>/Unreal-Godot/UAL1_Standard.glb"

The clip list lives in `GAIT_CLIPS` in `web/src/authoring/figure-gait.js`;
add a clip there and re-run both scripts. Use the non-`_RM` file (no root
motion: the chip moves the figure). The `_RM` file was only used once to
read how far each loop travels (`strideM` in `GAIT_CLIPS`).

Never deployed. `generators/prepare_player_figure.mjs` retargets these
clips onto the body in `web/assets/player_figure.glb`.
