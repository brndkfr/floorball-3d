# Meshy AI - detailed goalie (goalie_02)

The detailed goalie model, made with Meshy AI and exported from Blender
4.4 as OBJ + MTL + one 2048 px PNG. It was a static file under
`web/assets/` until S-BACK-026 (first slice) moved it here, unchanged:

| File | sha256 (first 16) |
| --- | --- |
| `goalie_02.obj` | `bc37e552514c7405` |
| `goalie_02.mtl` | `a4901c43a6eba2f2` |
| `goalie_02_texture.png` | `28812157f2436ce6` |

Licence: still open, see A-Q-003 in [docs/plan.md](../../../docs/plan.md)
(if made on Meshy's free plan the output may be CC BY and need a credit).
The texture shows a real goalie-gear brand name on the chest. Both go
away when A-BACK-042 replaces the mesh.

Never deployed: `scripts/build.mjs` stages `web/` only. The shipped file
is `web/assets/goalie_02.glb`, produced by
`node generators/prepare_goalie.mjs`.
