# Quaternius - Universal Base Characters (Standard, free)

Source: https://quaternius.itch.io/universal-base-characters ("Download
Now", price 0), downloaded 2026-10-07. License: CC0 1.0, see
`License_Standard.txt`. Models by @Quaternius.

Only the files `generators/prepare_player_figure.mjs` reads are kept here,
copied unchanged from the zip's `Base Characters/Godot - UE/` folder:

| File | sha256 (first 16) |
| --- | --- |
| `Superhero_Male_FullBody.gltf` | `e7fcea214ecf8855` |
| `Superhero_Male_FullBody.bin` | `459003f9745853ae` |
| `T_Superhero_Male_Dark.png` | body base colour |
| `T_Hair_1_BaseColor.png` | eyebrows |
| `T_Eye_Brown.png` | eyes |

The `.gltf` also references normal / roughness maps; the script drops
those references (two of them are missing from the zip anyway), so the
files are not copied here.

The free Standard tier only contains the Superhero male / female bodies.
The Regular and Teen bodies are in the paid SOURCE version; to switch,
drop the new `.gltf` + `.bin` + base-colour texture here and pass the
file to the script (the kit mask landmarks in `player-figure-kit.mjs`
must be re-read from the new skin).

Never deployed: `scripts/build.mjs` stages `web/` only. The shipped file
is `web/assets/player_figure.glb`, produced by
`node generators/prepare_player_figure.mjs`.
