# core_gen: how christmas_star_core.sc was built

Python scripts (venv, stdlib + numpy/scipy for `geom.py`) that write SolidCraft command scripts. SolidCraft runs them
with `batch {"path": ...}` (the MCP may only read its own temp folder and `D:\CreativeProjects\Solidcraft_Models`), or
headless with `solidcraft-cli run script.json --in design.sc --save out.sc`. In this order, on an empty design:

| Script | Writes | What |
|---|---|---|
| `geom.py` | – | numbers at D 550 and the 26 face frames (imported by the others) |
| `gen.py` | `s1_params.json` … `s6_assembly.json` | parameters, core (polyhedra, windows with flanks), square and triangle point, assembly copies |
| `gen_top.py` | `s7_top.json` | rope lugs, lamp plate, top point half and sleeve, their assembly copies |
| `gen_fit.py` | `s8_fit.json` | fit-test bodies (crown, short points with notches, flipped lamp plate) |
| `gen_lamptube.py` | `s9_lamptube.json` | patch: the lamp plate's free tabs become a closed octagonal plug |
| `gen_e10.py` | `s10_e10.json` | patch: lugs scale with the window; E10 variant of the lamp plate |

The patches edit the timeline (`timeline.roll_to`, `reorder`, `delete`), so they only apply to the design the earlier
scripts built. After `gen_top.py` the lamp plate width was changed by hand: `hp = hb*(Z0 + hs - zr - tpl)/(hs + er) -
ttp*qt - g` (the top point's walls lean in). Checks: `vol_core.py` and `vol_point.py` (analytic volumes),
`overhang.py` (down-facing area of an STL by angle), `plates.py` (fit-test plates), `limits.py` (size limits over D, k).
The JS port (`Christmas/web/src/corestar.js`) is the maintained description; `node node/corestar_check.mjs` compares it
with the .sc.
